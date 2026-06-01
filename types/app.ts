export type UserRole = "admin" | "presenter" | "participant";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  designation: string | null;
  role: UserRole;
  is_active: boolean;
  color: string | null;
  must_change_password: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingStatus = "scheduled" | "live" | "paused" | "completed" | "cancelled";

export type Meeting = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  presenter_id: string;
  scheduled_start_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  participant_annotation_enabled: boolean;
  document_locked: boolean;
  selected_document_id: string | null;
  selected_page_id: string | null;
  downloads_enabled: boolean;
  max_participants: number;
  created_at: string;
  updated_at: string;
};

export type MeetingParticipant = {
  id: string;
  meeting_id: string;
  user_id: string;
  role_snapshot: UserRole;
  name_snapshot: string;
  designation_snapshot: string | null;
  color_snapshot: string | null;
  joined_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  is_present: boolean;
};

export type ParticipantPermission = {
  id: string;
  meeting_id: string;
  user_id: string;
  can_annotate: boolean;
  can_download: boolean;
  is_muted_from_annotation: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type DocumentType = "pdf" | "image" | "pptx" | "ppt";
export type ConversionStatus = "pending" | "processing" | "ready" | "failed";
export type AnnotationType = "pen" | "highlighter" | "text" | "rectangle" | "circle" | "line" | "arrow" | "eraser";
export type AnnotationEventType = "created" | "updated" | "deleted" | "cleared";
export type ExportType = "annotated_pdf" | "notes" | "annotation_history" | "user_report" | "archive";
export type ExportStatus = "queued" | "processing" | "completed" | "failed";

export type MeetingDocument = {
  id: string;
  meeting_id: string;
  uploaded_by: string | null;
  title: string;
  document_type: DocumentType;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  conversion_status: ConversionStatus;
  conversion_error: string | null;
  page_count: number;
  created_at: string;
};

export type DocumentPage = {
  id: string;
  document_id: string;
  meeting_id: string;
  page_number: number;
  width: number | null;
  height: number | null;
  preview_storage_path: string | null;
  created_at: string;
};

export type Annotation = {
  id: string;
  meeting_id: string;
  document_id: string;
  page_id: string;
  user_id: string | null;
  user_name_snapshot: string;
  designation_snapshot: string | null;
  role_snapshot: UserRole;
  annotation_type: AnnotationType;
  color: string;
  payload: Record<string, unknown>;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ScreenShareSession = {
  id: string;
  meeting_id: string;
  presenter_id: string | null;
  livekit_room_name: string;
  started_at: string;
  paused_at: string | null;
  stopped_at: string | null;
  status: "live" | "paused" | "stopped" | string;
};

export type MeetingNote = {
  id: string;
  meeting_id: string;
  user_id: string | null;
  note: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

export type ExportJob = {
  id: string;
  meeting_id: string;
  requested_by: string | null;
  export_type: ExportType;
  status: ExportStatus;
  storage_path: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

export type RouteSection = "admin" | "presenter" | "participant" | "shared";
