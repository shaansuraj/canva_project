export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Enums: {
      user_role: "admin" | "presenter" | "participant";
      meeting_status: "scheduled" | "live" | "paused" | "completed" | "cancelled";
      document_type: "pdf" | "image" | "pptx" | "ppt";
      conversion_status: "pending" | "processing" | "ready" | "failed";
      annotation_type: "pen" | "highlighter" | "text" | "rectangle" | "circle" | "line" | "arrow" | "eraser";
      annotation_event_type: "created" | "updated" | "deleted" | "cleared";
      export_type: "annotated_pdf" | "notes" | "annotation_history" | "user_report" | "archive";
      export_status: "queued" | "processing" | "completed" | "failed";
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          designation: string | null;
          role: Database["public"]["Enums"]["user_role"];
          is_active: boolean;
          color: string | null;
          must_change_password: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          designation?: string | null;
          role: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          color?: string | null;
          must_change_password?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          designation?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          color?: string | null;
          must_change_password?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      meetings: {
        Row: {
          id: string;
          code: string;
          title: string;
          description: string | null;
          status: Database["public"]["Enums"]["meeting_status"];
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
        Insert: {
          id?: string;
          code: string;
          title: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["meeting_status"];
          presenter_id: string;
          scheduled_start_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          participant_annotation_enabled?: boolean;
          document_locked?: boolean;
          selected_document_id?: string | null;
          selected_page_id?: string | null;
          downloads_enabled?: boolean;
          max_participants?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meetings"]["Insert"]>;
        Relationships: [];
      };
      meeting_participants: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string;
          role_snapshot: Database["public"]["Enums"]["user_role"];
          name_snapshot: string;
          designation_snapshot: string | null;
          color_snapshot: string | null;
          joined_at: string;
          last_seen_at: string | null;
          left_at: string | null;
          is_present: boolean;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id: string;
          role_snapshot: Database["public"]["Enums"]["user_role"];
          name_snapshot: string;
          designation_snapshot?: string | null;
          color_snapshot?: string | null;
          joined_at?: string;
          last_seen_at?: string | null;
          left_at?: string | null;
          is_present?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_participants"]["Insert"]>;
        Relationships: [];
      };
      participant_permissions: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string;
          can_annotate: boolean;
          can_download: boolean;
          is_muted_from_annotation: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id: string;
          can_annotate?: boolean;
          can_download?: boolean;
          is_muted_from_annotation?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["participant_permissions"]["Insert"]>;
        Relationships: [];
      };
      meeting_documents: {
        Row: {
          id: string;
          meeting_id: string;
          uploaded_by: string | null;
          title: string;
          document_type: Database["public"]["Enums"]["document_type"];
          storage_path: string;
          original_filename: string;
          mime_type: string | null;
          file_size_bytes: number | null;
          conversion_status: Database["public"]["Enums"]["conversion_status"];
          conversion_error: string | null;
          page_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          uploaded_by?: string | null;
          title: string;
          document_type: Database["public"]["Enums"]["document_type"];
          storage_path: string;
          original_filename: string;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          conversion_status?: Database["public"]["Enums"]["conversion_status"];
          conversion_error?: string | null;
          page_count?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_documents"]["Insert"]>;
        Relationships: [];
      };
      document_pages: {
        Row: {
          id: string;
          document_id: string;
          meeting_id: string;
          page_number: number;
          width: number | null;
          height: number | null;
          preview_storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          meeting_id: string;
          page_number: number;
          width?: number | null;
          height?: number | null;
          preview_storage_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_pages"]["Insert"]>;
        Relationships: [];
      };
      annotations: {
        Row: {
          id: string;
          meeting_id: string;
          document_id: string;
          page_id: string;
          user_id: string | null;
          user_name_snapshot: string;
          designation_snapshot: string | null;
          role_snapshot: Database["public"]["Enums"]["user_role"];
          annotation_type: Database["public"]["Enums"]["annotation_type"];
          color: string;
          payload: Json;
          version: number;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          document_id: string;
          page_id: string;
          user_id?: string | null;
          user_name_snapshot: string;
          designation_snapshot?: string | null;
          role_snapshot: Database["public"]["Enums"]["user_role"];
          annotation_type: Database["public"]["Enums"]["annotation_type"];
          color: string;
          payload: Json;
          version?: number;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["annotations"]["Insert"]>;
        Relationships: [];
      };
      annotation_events: {
        Row: {
          id: string;
          annotation_id: string | null;
          meeting_id: string;
          document_id: string;
          page_id: string;
          user_id: string | null;
          event_type: Database["public"]["Enums"]["annotation_event_type"];
          before_payload: Json | null;
          after_payload: Json | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          annotation_id?: string | null;
          meeting_id: string;
          document_id: string;
          page_id: string;
          user_id?: string | null;
          event_type: Database["public"]["Enums"]["annotation_event_type"];
          before_payload?: Json | null;
          after_payload?: Json | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["annotation_events"]["Insert"]>;
        Relationships: [];
      };
      meeting_notes: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string | null;
          note: string;
          is_shared: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id?: string | null;
          note: string;
          is_shared?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_notes"]["Insert"]>;
        Relationships: [];
      };
      screen_share_sessions: {
        Row: {
          id: string;
          meeting_id: string;
          presenter_id: string | null;
          livekit_room_name: string;
          started_at: string;
          paused_at: string | null;
          stopped_at: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          presenter_id?: string | null;
          livekit_room_name: string;
          started_at?: string;
          paused_at?: string | null;
          stopped_at?: string | null;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["screen_share_sessions"]["Insert"]>;
        Relationships: [];
      };
      export_jobs: {
        Row: {
          id: string;
          meeting_id: string;
          requested_by: string | null;
          export_type: Database["public"]["Enums"]["export_type"];
          status: Database["public"]["Enums"]["export_status"];
          storage_path: string | null;
          error_message: string | null;
          metadata: Json | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          requested_by?: string | null;
          export_type: Database["public"]["Enums"]["export_type"];
          status?: Database["public"]["Enums"]["export_status"];
          storage_path?: string | null;
          error_message?: string | null;
          metadata?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["export_jobs"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          meeting_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          meeting_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_user_role: { Args: Record<string, never>; Returns: Database["public"]["Enums"]["user_role"] | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_presenter: { Args: Record<string, never>; Returns: boolean };
      is_meeting_presenter: { Args: { meeting_id: string }; Returns: boolean };
      is_meeting_member: { Args: { meeting_id: string }; Returns: boolean };
      can_user_annotate: { Args: { p_meeting_id: string; p_user_id: string }; Returns: boolean };
      document_page_belongs_to_meeting: {
        Args: { p_meeting_id: string; p_document_id: string; p_page_id: string };
        Returns: boolean;
      };
      create_annotation_with_event: {
        Args: {
          p_meeting_id: string;
          p_document_id: string;
          p_page_id: string;
          p_annotation_type: Database["public"]["Enums"]["annotation_type"];
          p_color: string;
          p_payload: Json;
        };
        Returns: Database["public"]["Tables"]["annotations"]["Row"];
      };
    };
    CompositeTypes: Record<string, never>;
  };
};
