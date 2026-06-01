import { z } from "npm:zod@3.24.1";

import { createServiceClient, createUserClient, getRequiredEnv } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const schema = z.object({
  meetingId: z.string().uuid()
});

type VideoGrant = {
  roomJoin: true;
  room: string;
  canPublish: boolean;
  canSubscribe: true;
  canPublishData: false;
  canPublishSources?: ["screen_share", "screen_share_audio"];
};

function createRoomName(meetingId: string) {
  return `meeting-${meetingId}`;
}

function createVideoGrant({ roomName, isPresenterOwner }: { roomName: string; isPresenterOwner: boolean }): VideoGrant {
  if (isPresenterOwner) {
    return {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["screen_share", "screen_share_audio"]
    };
  }

  return {
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false
  };
}

function base64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signJwt({ apiKey, apiSecret, payload }: { apiKey: string; apiSecret: string; payload: Record<string, unknown> }) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify({ iss: apiKey, ...payload }));
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return `${data}.${base64Url(signature)}`;
}

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

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, designation, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) return jsonResponse({ error: "Active profile is required." }, 403);

  const { data: meeting, error: meetingError } = await serviceClient
    .from("meetings")
    .select("id, presenter_id, status")
    .eq("id", parsed.data.meetingId)
    .single();

  if (meetingError || !meeting) return jsonResponse({ error: "Meeting not found." }, 404);

  const { data: membership } = await serviceClient
    .from("meeting_participants")
    .select("id")
    .eq("meeting_id", meeting.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isPresenterOwner = profile.role === "presenter" && meeting.presenter_id === user.id;
  if (!membership) return jsonResponse({ error: "Meeting membership is required before joining LiveKit." }, 403);
  if (profile.role === "admin" || (profile.role === "presenter" && !isPresenterOwner)) {
    return jsonResponse({ error: "LiveKit screen share is available only to the presenter owner and joined participants." }, 403);
  }

  const roomName = createRoomName(meeting.id);
  const videoGrant = createVideoGrant({ roomName, isPresenterOwner });
  const now = Math.floor(Date.now() / 1000);

  const token = await signJwt({
    apiKey: getRequiredEnv("LIVEKIT_API_KEY"),
    apiSecret: getRequiredEnv("LIVEKIT_API_SECRET"),
    payload: {
      sub: user.id,
      name: profile.full_name,
      nbf: now - 5,
      iat: now,
      exp: now + 10 * 60,
      metadata: JSON.stringify({
        meetingId: meeting.id,
        role: profile.role,
        designation: profile.designation
      }),
      video: videoGrant
    }
  });

  return jsonResponse({
    token,
    roomName,
    grants: videoGrant,
    canPublishScreen: isPresenterOwner
  });
});
