import { z } from "npm:zod@3.24.1";

import { createServiceClient, createUserClient, getRequiredEnv } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const PPTX_FALLBACK_ERROR = "PPT/PPTX conversion provider is not configured. Please upload PDF for immediate annotation.";
const OFFICE_FALLBACK_ERROR = "Office document conversion provider is not configured. Please upload PDF for immediate annotation.";
const OFFICE_DOCUMENT_TYPES = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];

function getFallbackError(documentType: string) {
  return documentType === "ppt" || documentType === "pptx" ? PPTX_FALLBACK_ERROR : OFFICE_FALLBACK_ERROR;
}

const schema = z.object({
  documentId: z.string().uuid()
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return jsonResponse({ error: "Missing authorization header." }, 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request body.", issues: parsed.error.flatten() }, 400);

  const userClient = createUserClient(authorization);
  const serviceClient = createServiceClient();

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) return jsonResponse({ error: "Invalid or expired session." }, 401);

  const { data: document, error: documentError } = await serviceClient
    .from("meeting_documents")
    .select("id, meeting_id, uploaded_by, document_type, storage_path")
    .eq("id", parsed.data.documentId)
    .single();

  if (documentError || !document) return jsonResponse({ error: "Document not found." }, 404);

  const { data: meeting } = await serviceClient
    .from("meetings")
    .select("id, presenter_id")
    .eq("id", document.meeting_id)
    .single();

  if (!meeting || meeting.presenter_id !== user.id) {
    return jsonResponse({ error: "Only the meeting presenter can convert Office files." }, 403);
  }

  if (!OFFICE_DOCUMENT_TYPES.includes(document.document_type)) {
    return jsonResponse({ error: "Document is not a supported Office file." }, 400);
  }

  const provider = Deno.env.get("PPTX_CONVERSION_PROVIDER");
  const cloudConvertKey = Deno.env.get("CLOUDCONVERT_API_KEY");
  const fallbackError = getFallbackError(document.document_type);

  if (provider !== "cloudconvert" || !cloudConvertKey) {
    await serviceClient
      .from("meeting_documents")
      .update({ conversion_status: "failed", conversion_error: fallbackError })
      .eq("id", document.id);

    return jsonResponse({ status: "failed", message: fallbackError });
  }

  await serviceClient
    .from("meeting_documents")
    .update({ conversion_status: "processing", conversion_error: null })
    .eq("id", document.id);

  const { data: signedSource, error: signedSourceError } = await serviceClient.storage
    .from("meeting-documents")
    .createSignedUrl(document.storage_path, 60 * 30);

  if (signedSourceError || !signedSource?.signedUrl) {
    const message = signedSourceError?.message ?? "Could not create a signed source URL for conversion.";
    await serviceClient
      .from("meeting_documents")
      .update({ conversion_status: "failed", conversion_error: message })
      .eq("id", document.id);

    return jsonResponse({ status: "failed", message }, 500);
  }

  const callbackUrl = `${getRequiredEnv("SUPABASE_URL")}/functions/v1/pptx-convert-callback`;
  const jobResponse = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cloudConvertKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks: {
        "import-file": { operation: "import/url", url: signedSource.signedUrl },
        "convert-file": { operation: "convert", input: "import-file", output_format: "pdf" },
        "export-file": { operation: "export/url", input: "convert-file" }
      },
      webhook_url: callbackUrl
    })
  });

  if (!jobResponse.ok) {
    const message = await jobResponse.text();
    await serviceClient
      .from("meeting_documents")
      .update({ conversion_status: "failed", conversion_error: message || "CloudConvert job creation failed." })
      .eq("id", document.id);

    return jsonResponse({ status: "failed", message: message || "CloudConvert job creation failed." }, 502);
  }

  const job = await jobResponse.json();
  await serviceClient
    .from("meeting_documents")
    .update({ conversion_status: "processing", conversion_error: null })
    .eq("id", document.id);

  return jsonResponse({ status: "processing", job });
});
