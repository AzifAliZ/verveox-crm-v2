export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string;
          actor_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          lead_id: string;
          occurred_at: string;
          outcome: string | null;
          subject: string | null;
        };
        Insert: {
          activity_type: string;
          actor_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          lead_id: string;
          occurred_at?: string;
          outcome?: string | null;
          subject?: string | null;
        };
        Update: {
          activity_type?: string;
          actor_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          lead_id?: string;
          occurred_at?: string;
          outcome?: string | null;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      ad_sets: {
        Row: {
          campaign_id: string | null;
          external_ad_set_id: string | null;
          id: string;
          name: string;
          status: string | null;
        };
        Insert: {
          campaign_id?: string | null;
          external_ad_set_id?: string | null;
          id?: string;
          name?: string;
          status?: string | null;
        };
        Update: {
          campaign_id?: string | null;
          external_ad_set_id?: string | null;
          id?: string;
          name?: string;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      ads: {
        Row: {
          ad_set_id: string | null;
          external_ad_id: string | null;
          id: string;
          name: string;
          status: string | null;
        };
        Insert: {
          ad_set_id?: string | null;
          external_ad_id?: string | null;
          id?: string;
          name?: string;
          status?: string | null;
        };
        Update: {
          ad_set_id?: string | null;
          external_ad_id?: string | null;
          id?: string;
          name?: string;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ads_ad_set_id_fkey";
            columns: ["ad_set_id"];
            isOneToOne: false;
            referencedRelation: "ad_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          company_name: string;
          hot_threshold: number;
          id: number;
          retention_days: number | null;
          updated_at: string;
          warm_threshold: number;
        };
        Insert: {
          company_name?: string;
          hot_threshold?: number;
          id?: number;
          retention_days?: number | null;
          updated_at?: string;
          warm_threshold?: number;
        };
        Update: {
          company_name?: string;
          hot_threshold?: number;
          id?: number;
          retention_days?: number | null;
          updated_at?: string;
          warm_threshold?: number;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          changes: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      background_runs: {
        Row: {
          error: string | null;
          failed: number;
          finished_at: string | null;
          id: string;
          kind: string;
          processed: number;
          started_at: string;
          status: string;
        };
        Insert: {
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: string;
          kind: string;
          processed?: number;
          started_at?: string;
          status?: string;
        };
        Update: {
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          processed?: number;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          budget: number | null;
          created_at: string;
          end_date: string | null;
          external_campaign_id: string | null;
          id: string;
          name: string;
          objective: string | null;
          source_platform: string;
          spend: number | null;
          start_date: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          budget?: number | null;
          created_at?: string;
          end_date?: string | null;
          external_campaign_id?: string | null;
          id?: string;
          name: string;
          objective?: string | null;
          source_platform?: string;
          spend?: number | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          budget?: number | null;
          created_at?: string;
          end_date?: string | null;
          external_campaign_id?: string | null;
          id?: string;
          name?: string;
          objective?: string | null;
          source_platform?: string;
          spend?: number | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      consent_records: {
        Row: {
          consent_source: string | null;
          consent_status: string;
          consent_text_version: string | null;
          id: string;
          lead_id: string;
          purpose: string;
          recorded_at: string;
          recorded_by: string | null;
          withdrawn_at: string | null;
        };
        Insert: {
          consent_source?: string | null;
          consent_status: string;
          consent_text_version?: string | null;
          id?: string;
          lead_id: string;
          purpose: string;
          recorded_at?: string;
          recorded_by?: string | null;
          withdrawn_at?: string | null;
        };
        Update: {
          consent_source?: string | null;
          consent_status?: string;
          consent_text_version?: string | null;
          id?: string;
          lead_id?: string;
          purpose?: string;
          recorded_at?: string;
          recorded_by?: string | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consent_records_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
        };
        Relationships: [];
      };
      export_jobs: {
        Row: {
          created_at: string;
          expires_at: string | null;
          file_path: string | null;
          filters: Json;
          format: string;
          id: string;
          requested_by: string | null;
          row_count: number | null;
          selected_columns: string[];
          status: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          file_path?: string | null;
          filters?: Json;
          format?: string;
          id?: string;
          requested_by?: string | null;
          row_count?: number | null;
          selected_columns?: string[];
          status?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          file_path?: string | null;
          filters?: Json;
          format?: string;
          id?: string;
          requested_by?: string | null;
          row_count?: number | null;
          selected_columns?: string[];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "export_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      followup_history: {
        Row: {
          actor_id: string | null;
          changes: Json;
          created_at: string;
          event: string;
          followup_id: string;
          id: string;
          lead_id: string;
        };
        Insert: {
          actor_id?: string | null;
          changes?: Json;
          created_at?: string;
          event: string;
          followup_id: string;
          id?: string;
          lead_id: string;
        };
        Update: {
          actor_id?: string | null;
          changes?: Json;
          created_at?: string;
          event?: string;
          followup_id?: string;
          id?: string;
          lead_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "followup_history_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_history_followup_id_fkey";
            columns: ["followup_id"];
            isOneToOne: false;
            referencedRelation: "followups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_history_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      followups: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_at: string;
          followup_type: Database["public"]["Enums"]["followup_type"];
          id: string;
          lead_id: string;
          outcome: string | null;
          remind_at: string | null;
          reminder_sent_at: string | null;
          status: Database["public"]["Enums"]["followup_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at: string;
          followup_type?: Database["public"]["Enums"]["followup_type"];
          id?: string;
          lead_id: string;
          outcome?: string | null;
          remind_at?: string | null;
          reminder_sent_at?: string | null;
          status?: Database["public"]["Enums"]["followup_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string;
          followup_type?: Database["public"]["Enums"]["followup_type"];
          id?: string;
          lead_id?: string;
          outcome?: string | null;
          remind_at?: string | null;
          reminder_sent_at?: string | null;
          status?: Database["public"]["Enums"]["followup_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "followups_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followups_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          duplicate_mode: string;
          error_report_path: string | null;
          errors: Json;
          failed_rows: number;
          file_name: string | null;
          id: string;
          imported_rows: number;
          requested_by: string | null;
          skipped_rows: number;
          status: string;
          total_rows: number;
          updated_rows: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          duplicate_mode?: string;
          error_report_path?: string | null;
          errors?: Json;
          failed_rows?: number;
          file_name?: string | null;
          id?: string;
          imported_rows?: number;
          requested_by?: string | null;
          skipped_rows?: number;
          status?: string;
          total_rows?: number;
          updated_rows?: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          duplicate_mode?: string;
          error_report_path?: string | null;
          errors?: Json;
          failed_rows?: number;
          file_name?: string | null;
          id?: string;
          imported_rows?: number;
          requested_by?: string | null;
          skipped_rows?: number;
          status?: string;
          total_rows?: number;
          updated_rows?: number;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_checks: {
        Row: {
          checked_at: string;
          checked_by: string | null;
          details: Json;
          error: string | null;
          id: string;
          ok: boolean;
          provider: string;
        };
        Insert: {
          checked_at?: string;
          checked_by?: string | null;
          details?: Json;
          error?: string | null;
          id?: string;
          ok: boolean;
          provider: string;
        };
        Update: {
          checked_at?: string;
          checked_by?: string | null;
          details?: Json;
          error?: string | null;
          id?: string;
          ok?: boolean;
          provider?: string;
        };
        Relationships: [];
      };
      integration_events: {
        Row: {
          attempts: number;
          claim_token: string | null;
          dead_letter_at: string | null;
          event_type: string;
          external_event_id: string;
          id: string;
          last_error: string | null;
          lead_id: string | null;
          lease_expires_at: string | null;
          lifetime_attempts: number;
          next_attempt_at: string | null;
          payload: Json | null;
          processed_at: string | null;
          provider: string;
          received_at: string;
          status: string;
        };
        Insert: {
          attempts?: number;
          claim_token?: string | null;
          dead_letter_at?: string | null;
          event_type: string;
          external_event_id: string;
          id?: string;
          last_error?: string | null;
          lead_id?: string | null;
          lease_expires_at?: string | null;
          lifetime_attempts?: number;
          next_attempt_at?: string | null;
          payload?: Json | null;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          status?: string;
        };
        Update: {
          attempts?: number;
          claim_token?: string | null;
          dead_letter_at?: string | null;
          event_type?: string;
          external_event_id?: string;
          id?: string;
          last_error?: string | null;
          lead_id?: string | null;
          lease_expires_at?: string | null;
          lifetime_attempts?: number;
          next_attempt_at?: string | null;
          payload?: Json | null;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_forms: {
        Row: {
          campaign_id: string | null;
          external_form_id: string | null;
          field_mapping: Json;
          id: string;
          name: string;
          page_id: string | null;
          status: string | null;
        };
        Insert: {
          campaign_id?: string | null;
          external_form_id?: string | null;
          field_mapping?: Json;
          id?: string;
          name?: string;
          page_id?: string | null;
          status?: string | null;
        };
        Update: {
          campaign_id?: string | null;
          external_form_id?: string | null;
          field_mapping?: Json;
          id?: string;
          name?: string;
          page_id?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_forms_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_merges: {
        Row: {
          id: string;
          merged_at: string;
          merged_by: string | null;
          source_lead_id: string;
          source_snapshot: Json;
          target_lead_id: string;
        };
        Insert: {
          id?: string;
          merged_at?: string;
          merged_by?: string | null;
          source_lead_id: string;
          source_snapshot: Json;
          target_lead_id: string;
        };
        Update: {
          id?: string;
          merged_at?: string;
          merged_by?: string | null;
          source_lead_id?: string;
          source_snapshot?: Json;
          target_lead_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_merges_merged_by_fkey";
            columns: ["merged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_merges_source_lead_id_fkey";
            columns: ["source_lead_id"];
            isOneToOne: true;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_merges_target_lead_id_fkey";
            columns: ["target_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_score_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          id: string;
          lead_id: string;
          new_score: number | null;
          new_temperature: Database["public"]["Enums"]["lead_temperature"] | null;
          old_score: number | null;
          old_temperature: Database["public"]["Enums"]["lead_temperature"] | null;
          reason: string | null;
          source: string;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          lead_id: string;
          new_score?: number | null;
          new_temperature?: Database["public"]["Enums"]["lead_temperature"] | null;
          old_score?: number | null;
          old_temperature?: Database["public"]["Enums"]["lead_temperature"] | null;
          reason?: string | null;
          source?: string;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          lead_id?: string;
          new_score?: number | null;
          new_temperature?: Database["public"]["Enums"]["lead_temperature"] | null;
          old_score?: number | null;
          old_temperature?: Database["public"]["Enums"]["lead_temperature"] | null;
          reason?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_score_history_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_shares: {
        Row: {
          created_at: string;
          lead_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          lead_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          lead_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_shares_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_shares_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_signals: {
        Row: {
          added_by: string | null;
          created_at: string;
          lead_id: string;
          rule_key: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          lead_id: string;
          rule_key: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          lead_id?: string;
          rule_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_signals_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_signals_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_signals_rule_key_fkey";
            columns: ["rule_key"];
            isOneToOne: false;
            referencedRelation: "scoring_rules";
            referencedColumns: ["key"];
          },
        ];
      };
      lead_sources: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
        };
        Relationships: [];
      };
      lead_stage_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          id: string;
          lead_id: string;
          new_stage: Database["public"]["Enums"]["lead_stage"];
          old_stage: Database["public"]["Enums"]["lead_stage"] | null;
          reason: string | null;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          lead_id: string;
          new_stage: Database["public"]["Enums"]["lead_stage"];
          old_stage?: Database["public"]["Enums"]["lead_stage"] | null;
          reason?: string | null;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          lead_id?: string;
          new_stage?: Database["public"]["Enums"]["lead_stage"];
          old_stage?: Database["public"]["Enums"]["lead_stage"] | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_tags: {
        Row: {
          lead_id: string;
          tag_id: string;
        };
        Insert: {
          lead_id: string;
          tag_id: string;
        };
        Update: {
          lead_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          ad_id: string | null;
          ad_set_id: string | null;
          archived_at: string | null;
          assigned_to: string | null;
          availability: string | null;
          campaign_id: string | null;
          campaign_name_snapshot: string | null;
          classification_mode: string;
          college: string | null;
          conversion_at: string | null;
          course_id: string | null;
          created_at: string;
          created_by: string | null;
          degree: string | null;
          department: string | null;
          eligibility_status: string;
          email: string | null;
          experience_level: string | null;
          external_lead_id: string | null;
          full_name: string;
          graduation_year: number | null;
          id: string;
          interest: string | null;
          landing_page: string | null;
          last_contacted_at: string | null;
          lost_reason: string | null;
          manual_temperature_override: Database["public"]["Enums"]["lead_temperature"] | null;
          marketing_opt_out: boolean;
          meta_form_id: string | null;
          meta_lead_id: string | null;
          meta_page_id: string | null;
          next_followup_at: string | null;
          normalized_email: string | null;
          normalized_phone: string | null;
          phone: string | null;
          preferred_batch: string | null;
          preferred_channel: string | null;
          priority: Database["public"]["Enums"]["lead_priority"];
          score: number;
          score_reason: string | null;
          skills: string | null;
          source: string;
          source_details: string | null;
          stage: Database["public"]["Enums"]["lead_stage"];
          temperature: Database["public"]["Enums"]["lead_temperature"];
          updated_at: string;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          whatsapp_number: string | null;
        };
        Insert: {
          ad_id?: string | null;
          ad_set_id?: string | null;
          archived_at?: string | null;
          assigned_to?: string | null;
          availability?: string | null;
          campaign_id?: string | null;
          campaign_name_snapshot?: string | null;
          classification_mode?: string;
          college?: string | null;
          conversion_at?: string | null;
          course_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          degree?: string | null;
          department?: string | null;
          eligibility_status?: string;
          email?: string | null;
          experience_level?: string | null;
          external_lead_id?: string | null;
          full_name: string;
          graduation_year?: number | null;
          id?: string;
          interest?: string | null;
          landing_page?: string | null;
          last_contacted_at?: string | null;
          lost_reason?: string | null;
          manual_temperature_override?: Database["public"]["Enums"]["lead_temperature"] | null;
          marketing_opt_out?: boolean;
          meta_form_id?: string | null;
          meta_lead_id?: string | null;
          meta_page_id?: string | null;
          next_followup_at?: string | null;
          normalized_email?: string | null;
          normalized_phone?: string | null;
          phone?: string | null;
          preferred_batch?: string | null;
          preferred_channel?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          score?: number;
          score_reason?: string | null;
          skills?: string | null;
          source?: string;
          source_details?: string | null;
          stage?: Database["public"]["Enums"]["lead_stage"];
          temperature?: Database["public"]["Enums"]["lead_temperature"];
          updated_at?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          whatsapp_number?: string | null;
        };
        Update: {
          ad_id?: string | null;
          ad_set_id?: string | null;
          archived_at?: string | null;
          assigned_to?: string | null;
          availability?: string | null;
          campaign_id?: string | null;
          campaign_name_snapshot?: string | null;
          classification_mode?: string;
          college?: string | null;
          conversion_at?: string | null;
          course_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          degree?: string | null;
          department?: string | null;
          eligibility_status?: string;
          email?: string | null;
          experience_level?: string | null;
          external_lead_id?: string | null;
          full_name?: string;
          graduation_year?: number | null;
          id?: string;
          interest?: string | null;
          landing_page?: string | null;
          last_contacted_at?: string | null;
          lost_reason?: string | null;
          manual_temperature_override?: Database["public"]["Enums"]["lead_temperature"] | null;
          marketing_opt_out?: boolean;
          meta_form_id?: string | null;
          meta_lead_id?: string | null;
          meta_page_id?: string | null;
          next_followup_at?: string | null;
          normalized_email?: string | null;
          normalized_phone?: string | null;
          phone?: string | null;
          preferred_batch?: string | null;
          preferred_channel?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          score?: number;
          score_reason?: string | null;
          skills?: string | null;
          source?: string;
          source_details?: string | null;
          stage?: Database["public"]["Enums"]["lead_stage"];
          temperature?: Database["public"]["Enums"]["lead_temperature"];
          updated_at?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          whatsapp_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_ad_id_fkey";
            columns: ["ad_id"];
            isOneToOne: false;
            referencedRelation: "ads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_ad_set_id_fkey";
            columns: ["ad_set_id"];
            isOneToOne: false;
            referencedRelation: "ad_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_source_reference_fk";
            columns: ["source"];
            isOneToOne: false;
            referencedRelation: "lead_sources";
            referencedColumns: ["key"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          team_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          is_active?: boolean;
          team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_views: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_views_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scoring_rules: {
        Row: {
          evidence_type: string;
          is_active: boolean;
          key: string;
          label: string;
          points: number;
          sort_order: number;
        };
        Insert: {
          evidence_type?: string;
          is_active?: boolean;
          key: string;
          label: string;
          points: number;
          sort_order?: number;
        };
        Update: {
          evidence_type?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          points?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      transfer_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          errors: Json;
          expires_at: string;
          failed_rows: number;
          file_name: string;
          file_path: string | null;
          id: string;
          imported_rows: number;
          kind: string;
          payload: Json;
          processed_rows: number;
          requested_by: string;
          skipped_rows: number;
          status: string;
          total_rows: number;
          updated_rows: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          errors?: Json;
          expires_at?: string;
          failed_rows?: number;
          file_name: string;
          file_path?: string | null;
          id?: string;
          imported_rows?: number;
          kind: string;
          payload?: Json;
          processed_rows?: number;
          requested_by: string;
          skipped_rows?: number;
          status?: string;
          total_rows?: number;
          updated_rows?: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          errors?: Json;
          expires_at?: string;
          failed_rows?: number;
          file_name?: string;
          file_path?: string | null;
          id?: string;
          imported_rows?: number;
          kind?: string;
          payload?: Json;
          processed_rows?: number;
          requested_by?: string;
          skipped_rows?: number;
          status?: string;
          total_rows?: number;
          updated_rows?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transfer_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
      can_access_lead: { Args: { _lead_id: string }; Returns: boolean };
      can_assign_user: { Args: { _target: string }; Returns: boolean };
      can_download_transfer: { Args: { _path: string }; Returns: boolean };
      claim_meta_event: {
        Args: { _id: string };
        Returns: {
          attempts: number;
          claim_token: string | null;
          dead_letter_at: string | null;
          event_type: string;
          external_event_id: string;
          id: string;
          last_error: string | null;
          lead_id: string | null;
          lease_expires_at: string | null;
          lifetime_attempts: number;
          next_attempt_at: string | null;
          payload: Json | null;
          processed_at: string | null;
          provider: string;
          received_at: string;
          status: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "integration_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_meta_event: {
        Args: { _claim: string; _data: Json; _id: string };
        Returns: Json;
      };
      dashboard_metrics: {
        Args: {
          _campaign?: string;
          _course?: string;
          _from: string;
          _owner?: string;
          _source?: string;
          _to: string;
        };
        Returns: Json;
      };
      fail_meta_event: {
        Args: {
          _claim: string;
          _error: string;
          _id: string;
          _permanent?: boolean;
        };
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_active_user: { Args: { _uid: string }; Returns: boolean };
      is_admin: { Args: { _uid: string }; Returns: boolean };
      is_manager: { Args: { _uid: string }; Returns: boolean };
      merge_leads: {
        Args: { _source: string; _target: string };
        Returns: string;
      };
      my_team_id: { Args: never; Returns: string };
      process_followup_reminders: { Args: never; Returns: number };
      process_import_batch: { Args: { _job_id: string }; Returns: Json };
      recalc_lead_score: { Args: { _lead_id: string }; Returns: undefined };
      requeue_meta_event: { Args: { _id: string }; Returns: undefined };
      same_team: { Args: { _other: string }; Returns: boolean };
      temp_for_score: {
        Args: { _s: number };
        Returns: Database["public"]["Enums"]["lead_temperature"];
      };
    };
    Enums: {
      app_role: "super_admin" | "manager" | "employee";
      followup_status: "pending" | "completed" | "cancelled";
      followup_type: "call" | "email" | "whatsapp" | "meeting" | "other";
      lead_priority: "urgent" | "high" | "medium" | "low";
      lead_stage:
        | "new"
        | "contacted"
        | "interested"
        | "qualified"
        | "application_started"
        | "enrolled"
        | "not_responding"
        | "not_interested"
        | "not_eligible"
        | "lost";
      lead_temperature: "hot" | "warm" | "cold";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "manager", "employee"],
      followup_status: ["pending", "completed", "cancelled"],
      followup_type: ["call", "email", "whatsapp", "meeting", "other"],
      lead_priority: ["urgent", "high", "medium", "low"],
      lead_stage: [
        "new",
        "contacted",
        "interested",
        "qualified",
        "application_started",
        "enrolled",
        "not_responding",
        "not_interested",
        "not_eligible",
        "lost",
      ],
      lead_temperature: ["hot", "warm", "cold"],
    },
  },
} as const;
