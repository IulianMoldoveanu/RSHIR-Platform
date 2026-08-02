export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_applications: {
        Row: {
          also_fleet_manager: boolean
          audience_size: number | null
          audience_type: string
          channels: string[]
          created_at: string
          email: string
          full_name: string
          honeypot: string | null
          id: string
          ip_hash: string | null
          network_description: string | null
          partner_id: string | null
          phone: string | null
          pitch: string
          referrer: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          also_fleet_manager?: boolean
          audience_size?: number | null
          audience_type: string
          channels?: string[]
          created_at?: string
          email: string
          full_name: string
          honeypot?: string | null
          id?: string
          ip_hash?: string | null
          network_description?: string | null
          partner_id?: string | null
          phone?: string | null
          pitch: string
          referrer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          also_fleet_manager?: boolean
          audience_size?: number | null
          audience_type?: string
          channels?: string[]
          created_at?: string
          email?: string
          full_name?: string
          honeypot?: string | null
          id?: string
          ip_hash?: string | null
          network_description?: string | null
          partner_id?: string | null
          phone?: string | null
          pitch?: string
          referrer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_applications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_applications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      affiliate_bounties: {
        Row: {
          amount_ron: number
          cancelled_reason: string | null
          created_at: string
          id: string
          paid_at: string | null
          paid_via: string | null
          partner_id: string
          payable_after: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount_ron: number
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_via?: string | null
          partner_id: string
          payable_after?: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount_ron?: number
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_via?: string | null
          partner_id?: string
          payable_after?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_bounties_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_bounties_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "affiliate_bounties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "affiliate_bounties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "affiliate_bounties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "affiliate_bounties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_bounties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_cost_ledger: {
        Row: {
          agent_name: string
          cost_cents: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          run_id: string | null
          tenant_id: string
        }
        Insert: {
          agent_name: string
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          run_id?: string | null
          tenant_id: string
        }
        Update: {
          agent_name?: string
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          run_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_cost_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_trust_calibration: {
        Row: {
          agent_name: string
          created_at: string
          failed_runs: number
          last_action_at: string | null
          notes: string | null
          rollbacks: number
          successful_runs: number
          trust_level: string
          updated_at: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          failed_runs?: number
          last_action_at?: string | null
          notes?: string | null
          rollbacks?: number
          successful_runs?: number
          trust_level?: string
          updated_at?: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          failed_runs?: number
          last_action_at?: string | null
          notes?: string | null
          rollbacks?: number
          successful_runs?: number
          trust_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      aggregator_email_jobs: {
        Row: {
          applied_order_id: string | null
          created_at: string
          detected_source: string | null
          error_text: string | null
          id: string
          parsed_data: Json | null
          raw_email_path: string | null
          received_at: string
          sender: string | null
          status: string
          subject: string | null
          tenant_id: string
        }
        Insert: {
          applied_order_id?: string | null
          created_at?: string
          detected_source?: string | null
          error_text?: string | null
          id?: string
          parsed_data?: Json | null
          raw_email_path?: string | null
          received_at?: string
          sender?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
        }
        Update: {
          applied_order_id?: string | null
          created_at?: string
          detected_source?: string | null
          error_text?: string | null
          id?: string
          parsed_data?: Json | null
          raw_email_path?: string | null
          received_at?: string
          sender?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aggregator_email_jobs_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_applied_order_id_fkey"
            columns: ["applied_order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aggregator_email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregator_intake_aliases: {
        Row: {
          alias_local: string
          created_at: string
          enabled: boolean
          secret: string
          tenant_id: string
        }
        Insert: {
          alias_local: string
          created_at?: string
          enabled?: boolean
          secret: string
          tenant_id: string
        }
        Update: {
          alias_local?: string
          created_at?: string
          enabled?: boolean
          secret?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aggregator_intake_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_intake_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_intake_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "aggregator_intake_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aggregator_intake_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          completed_at: string | null
          cost_bani: number | null
          created_at: string
          error_text: string | null
          id: string
          input_payload: Json
          input_tokens: number | null
          job_type: string
          metadata: Json
          model_used: string | null
          output_payload: Json | null
          output_tokens: number | null
          partner_id: string | null
          started_at: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          completed_at?: string | null
          cost_bani?: number | null
          created_at?: string
          error_text?: string | null
          id?: string
          input_payload: Json
          input_tokens?: number | null
          job_type: string
          metadata?: Json
          model_used?: string | null
          output_payload?: Json | null
          output_tokens?: number | null
          partner_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          completed_at?: string | null
          cost_bani?: number | null
          created_at?: string
          error_text?: string | null
          id?: string
          input_payload?: Json
          input_tokens?: number | null
          job_type?: string
          metadata?: Json
          model_used?: string | null
          output_payload?: Json | null
          output_tokens?: number | null
          partner_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      analytics_digest_log: {
        Row: {
          created_at: string
          delivery_status: string
          detail: string | null
          digest_kind: string
          id: number
          payload: Json
          recipient_email: string | null
          sent_at: string | null
          tenant_id: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          delivery_status: string
          detail?: string | null
          digest_kind: string
          id?: number
          payload?: Json
          recipient_email?: string | null
          sent_at?: string | null
          tenant_id?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          delivery_status?: string
          detail?: string | null
          digest_kind?: string
          id?: number
          payload?: Json
          recipient_email?: string | null
          sent_at?: string | null
          tenant_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_digest_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "analytics_digest_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "analytics_digest_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "analytics_digest_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_digest_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          prev_hash: string | null
          row_hash: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          prev_hash?: string | null
          row_hash?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          prev_hash?: string | null
          row_hash?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_verifier_runs: {
        Row: {
          finished_at: string | null
          id: string
          mismatches: number
          range_end: string | null
          range_start: string | null
          started_at: string
          triggered_by: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: string
          mismatches?: number
          range_end?: string | null
          range_start?: string | null
          started_at?: string
          triggered_by?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: string
          mismatches?: number
          range_end?: string | null
          range_start?: string | null
          started_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      backup_verify_state: {
        Row: {
          id: string
          last_alerted_at: string | null
          last_checked_at: string | null
          last_kind: string | null
        }
        Insert: {
          id?: string
          last_alerted_at?: string | null
          last_checked_at?: string | null
          last_kind?: string | null
        }
        Update: {
          id?: string
          last_alerted_at?: string | null
          last_checked_at?: string | null
          last_kind?: string | null
        }
        Relationships: []
      }
      champion_referrals: {
        Row: {
          cash_bonus_cents: number
          created_at: string
          free_months_credited: number
          id: string
          notes: string | null
          paid_at: string | null
          referred_at: string
          referred_tenant_id: string
          referrer_tenant_id: string
          reward_status: string
          trial_extended_days: number
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          cash_bonus_cents?: number
          created_at?: string
          free_months_credited?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          referred_at?: string
          referred_tenant_id: string
          referrer_tenant_id: string
          reward_status?: string
          trial_extended_days?: number
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          cash_bonus_cents?: number
          created_at?: string
          free_months_credited?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          referred_at?: string
          referred_tenant_id?: string
          referrer_tenant_id?: string
          reward_status?: string
          trial_extended_days?: number
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "champion_referrals_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champion_referrals_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champion_referrals_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "champion_referrals_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champion_referrals_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_active_tenant: {
        Row: {
          chat_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chat_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          chat_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_active_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "chat_active_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "chat_active_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "chat_active_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_active_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country_code: string
          county: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lon: number | null
          name: string
          slug: string
          sort_order: number
          timezone: string
        }
        Insert: {
          country_code?: string
          county?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lon?: number | null
          name: string
          slug: string
          sort_order?: number
          timezone?: string
        }
        Update: {
          country_code?: string
          county?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lon?: number | null
          name?: string
          slug?: string
          sort_order?: number
          timezone?: string
        }
        Relationships: []
      }
      city_events: {
        Row: {
          city_id: string
          created_at: string
          end_at: string | null
          event_name: string
          event_type: string
          expected_attendance: number | null
          id: string
          raw_payload: Json | null
          source: string
          source_event_id: string
          start_at: string
          updated_at: string
          url: string | null
          venue_lat: number | null
          venue_lon: number | null
          venue_name: string | null
        }
        Insert: {
          city_id: string
          created_at?: string
          end_at?: string | null
          event_name: string
          event_type: string
          expected_attendance?: number | null
          id?: string
          raw_payload?: Json | null
          source: string
          source_event_id: string
          start_at: string
          updated_at?: string
          url?: string | null
          venue_lat?: number | null
          venue_lon?: number | null
          venue_name?: string | null
        }
        Update: {
          city_id?: string
          created_at?: string
          end_at?: string | null
          event_name?: string
          event_type?: string
          expected_attendance?: number | null
          id?: string
          raw_payload?: Json | null
          source?: string
          source_event_id?: string
          start_at?: string
          updated_at?: string
          url?: string | null
          venue_lat?: number | null
          venue_lon?: number | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "city_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      claude_inbox: {
        Row: {
          created_at: string
          from_user: string | null
          id: string
          prompt: string
          result: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user?: string | null
          id?: string
          prompt: string
          result?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user?: string | null
          id?: string
          prompt?: string
          result?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      code_chunks: {
        Row: {
          app: string | null
          chunk_index: number
          chunk_text: string
          committed_sha: string | null
          created_at: string
          embedding: string | null
          file_path: string
          fts: unknown
          id: string
        }
        Insert: {
          app?: string | null
          chunk_index: number
          chunk_text: string
          committed_sha?: string | null
          created_at?: string
          embedding?: string | null
          file_path: string
          fts?: unknown
          id?: string
        }
        Update: {
          app?: string | null
          chunk_index?: number
          chunk_text?: string
          committed_sha?: string | null
          created_at?: string
          embedding?: string | null
          file_path?: string
          fts?: unknown
          id?: string
        }
        Relationships: []
      }
      code_chunks_index_runs: {
        Row: {
          chunks_added: number
          chunks_skipped: number
          chunks_updated: number
          error_text: string | null
          finished_at: string | null
          head_sha: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          chunks_added?: number
          chunks_skipped?: number
          chunks_updated?: number
          error_text?: string | null
          finished_at?: string | null
          head_sha?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          chunks_added?: number
          chunks_skipped?: number
          chunks_updated?: number
          error_text?: string | null
          finished_at?: string | null
          head_sha?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      codex_review_tracking: {
        Row: {
          codex_comment_count: number
          codex_verdict: Json | null
          created_at: string
          final_action: string | null
          fix_attempt_id: string
          id: string
          last_polled_at: string | null
          opened_at: string
          poll_count: number
          pr_number: number
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          codex_comment_count?: number
          codex_verdict?: Json | null
          created_at?: string
          final_action?: string | null
          fix_attempt_id: string
          id?: string
          last_polled_at?: string | null
          opened_at?: string
          poll_count?: number
          pr_number: number
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          codex_comment_count?: number
          codex_verdict?: Json | null
          created_at?: string
          final_action?: string | null
          fix_attempt_id?: string
          id?: string
          last_polled_at?: string | null
          opened_at?: string
          poll_count?: number
          pr_number?: number
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "codex_review_tracking_fix_attempt_id_fkey"
            columns: ["fix_attempt_id"]
            isOneToOne: false
            referencedRelation: "fix_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      command_log: {
        Row: {
          args: string | null
          chat_id: number
          command: string
          cost_usd: number
          created_at: string
          duration_ms: number | null
          id: string
          message_id: number | null
          result_summary: string | null
          status: string
          username: string | null
        }
        Insert: {
          args?: string | null
          chat_id: number
          command: string
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id?: number | null
          result_summary?: string | null
          status: string
          username?: string | null
        }
        Update: {
          args?: string | null
          chat_id?: number
          command?: string
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id?: number | null
          result_summary?: string | null
          status?: string
          username?: string | null
        }
        Relationships: []
      }
      connect_leads: {
        Row: {
          contact_email: string
          contact_phone: string | null
          contacted_at: string | null
          created_at: string
          estimated_orders_per_day: number | null
          id: string
          internal_notes: string | null
          ip: string | null
          notes: string | null
          onboarded_at: string | null
          onboarded_tenant_id: string | null
          restaurant_name: string
          source: string
          status: Database["public"]["Enums"]["connect_lead_status"]
          user_agent: string | null
          website_url: string
        }
        Insert: {
          contact_email: string
          contact_phone?: string | null
          contacted_at?: string | null
          created_at?: string
          estimated_orders_per_day?: number | null
          id?: string
          internal_notes?: string | null
          ip?: string | null
          notes?: string | null
          onboarded_at?: string | null
          onboarded_tenant_id?: string | null
          restaurant_name: string
          source?: string
          status?: Database["public"]["Enums"]["connect_lead_status"]
          user_agent?: string | null
          website_url: string
        }
        Update: {
          contact_email?: string
          contact_phone?: string | null
          contacted_at?: string | null
          created_at?: string
          estimated_orders_per_day?: number | null
          id?: string
          internal_notes?: string | null
          ip?: string | null
          notes?: string | null
          onboarded_at?: string | null
          onboarded_tenant_id?: string | null
          restaurant_name?: string
          source?: string
          status?: Database["public"]["Enums"]["connect_lead_status"]
          user_agent?: string | null
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_leads_onboarded_tenant_id_fkey"
            columns: ["onboarded_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_leads_onboarded_tenant_id_fkey"
            columns: ["onboarded_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_leads_onboarded_tenant_id_fkey"
            columns: ["onboarded_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_leads_onboarded_tenant_id_fkey"
            columns: ["onboarded_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_leads_onboarded_tenant_id_fkey"
            columns: ["onboarded_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_tenant_invoices: {
        Row: {
          breakdown: Json
          created_at: string
          currency: string
          data_fee_cents: number
          delivery_fees_cents: number
          id: string
          is_financial_record: boolean
          issued_at: string | null
          orders_count: number
          paid_at: string | null
          period_end: string
          period_start: string
          smartbill_invoice_id: string | null
          status: string
          tenant_id: string
          total_cents: number | null
        }
        Insert: {
          breakdown?: Json
          created_at?: string
          currency?: string
          data_fee_cents?: number
          delivery_fees_cents?: number
          id?: string
          is_financial_record?: boolean
          issued_at?: string | null
          orders_count?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          smartbill_invoice_id?: string | null
          status?: string
          tenant_id: string
          total_cents?: number | null
        }
        Update: {
          breakdown?: Json
          created_at?: string
          currency?: string
          data_fee_cents?: number
          delivery_fees_cents?: number
          id?: string
          is_financial_record?: boolean
          issued_at?: string | null
          orders_count?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          smartbill_invoice_id?: string | null
          status?: string
          tenant_id?: string
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "connect_tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          dead: boolean
          delivered_at: string | null
          endpoint_id: string
          event_type: string
          id: string
          next_retry_at: string
          order_id: string | null
          request_body: Json
          response_body_truncated: string | null
          response_status: number | null
          tenant_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          dead?: boolean
          delivered_at?: string | null
          endpoint_id: string
          event_type: string
          id?: string
          next_retry_at?: string
          order_id?: string | null
          request_body: Json
          response_body_truncated?: string | null
          response_status?: number | null
          tenant_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          dead?: boolean
          delivered_at?: string | null
          endpoint_id?: string
          event_type?: string
          id?: string
          next_retry_at?: string
          order_id?: string | null
          request_body?: Json
          response_body_truncated?: string | null
          response_status?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "connect_webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_webhook_endpoints: {
        Row: {
          active: boolean
          consecutive_failures: number
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          last_failure_at: string | null
          last_failure_reason: string | null
          last_success_at: string | null
          signing_secret_hash: string
          signing_secret_previous_expires_at: string | null
          signing_secret_previous_hash: string | null
          tenant_id: string
          url: string
        }
        Insert: {
          active?: boolean
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_success_at?: string | null
          signing_secret_hash: string
          signing_secret_previous_expires_at?: string | null
          signing_secret_previous_hash?: string | null
          tenant_id: string
          url: string
        }
        Update: {
          active?: boolean
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_success_at?: string | null
          signing_secret_hash?: string
          signing_secret_previous_expires_at?: string | null
          signing_secret_previous_hash?: string | null
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "connect_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      content_agent_prompts: {
        Row: {
          agent_kind: string
          brand_code: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          performance: Json | null
          persona: string | null
          prompt_text: string
          version: number
        }
        Insert: {
          agent_kind: string
          brand_code: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          performance?: Json | null
          persona?: string | null
          prompt_text: string
          version: number
        }
        Update: {
          agent_kind?: string
          brand_code?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          performance?: Json | null
          persona?: string | null
          prompt_text?: string
          version?: number
        }
        Relationships: []
      }
      content_brand_contexts: {
        Row: {
          brand_code: string
          business_type: string | null
          competitors: string[]
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          kind: string
          legal_json: Json | null
          monthly_budget_cents: number
          preferred_messaging: string
          tenant_id: string | null
          tier: string
          updated_at: string
          visual_json: Json
          voice_json: Json
        }
        Insert: {
          brand_code: string
          business_type?: string | null
          competitors?: string[]
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          kind: string
          legal_json?: Json | null
          monthly_budget_cents?: number
          preferred_messaging?: string
          tenant_id?: string | null
          tier?: string
          updated_at?: string
          visual_json?: Json
          voice_json?: Json
        }
        Update: {
          brand_code?: string
          business_type?: string | null
          competitors?: string[]
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          kind?: string
          legal_json?: Json | null
          monthly_budget_cents?: number
          preferred_messaging?: string
          tenant_id?: string | null
          tier?: string
          updated_at?: string
          visual_json?: Json
          voice_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "content_brand_contexts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "content_brand_contexts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "content_brand_contexts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "content_brand_contexts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_brand_contexts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      content_briefs: {
        Row: {
          brand_id: string
          created_at: string
          goal: string
          id: string
          metadata: Json
          persona: string | null
          pillar: string
          source: string
          source_ref: string | null
          template_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          goal: string
          id?: string
          metadata?: Json
          persona?: string | null
          pillar: string
          source: string
          source_ref?: string | null
          template_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          goal?: string
          id?: string
          metadata?: Json
          persona?: string | null
          pillar?: string
          source?: string
          source_ref?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_briefs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "content_brand_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_briefs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      content_drafts: {
        Row: {
          agent_kind: string
          body_json: Json
          brief_id: string
          cost_cents: number
          created_at: string
          format: string
          id: string
          language: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          variant_of: string | null
        }
        Insert: {
          agent_kind: string
          body_json: Json
          brief_id: string
          cost_cents?: number
          created_at?: string
          format: string
          id?: string
          language?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          variant_of?: string | null
        }
        Update: {
          agent_kind?: string
          body_json?: Json
          brief_id?: string
          cost_cents?: number
          created_at?: string
          format?: string
          id?: string
          language?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          variant_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "content_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_variant_of_fkey"
            columns: ["variant_of"]
            isOneToOne: false
            referencedRelation: "content_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_messaging_channels: {
        Row: {
          brand_id: string
          channel_kind: string
          connected_at: string
          credentials: Json
          external_id: string
          id: string
          is_active: boolean
          last_message_at: string | null
          webhook_secret: string
        }
        Insert: {
          brand_id: string
          channel_kind: string
          connected_at?: string
          credentials: Json
          external_id: string
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          webhook_secret: string
        }
        Update: {
          brand_id?: string
          channel_kind?: string
          connected_at?: string
          credentials?: Json
          external_id?: string
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_messaging_channels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "content_brand_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_metrics: {
        Row: {
          clicks: number
          collected_at: string
          conversions: number
          cost_cents: number
          engagements: number
          id: string
          impressions: number
          publication_id: string
          raw_json: Json | null
          reach: number
        }
        Insert: {
          clicks?: number
          collected_at?: string
          conversions?: number
          cost_cents?: number
          engagements?: number
          id?: string
          impressions?: number
          publication_id: string
          raw_json?: Json | null
          reach?: number
        }
        Update: {
          clicks?: number
          collected_at?: string
          conversions?: number
          cost_cents?: number
          engagements?: number
          id?: string
          impressions?: number
          publication_id?: string
          raw_json?: Json | null
          reach?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_metrics_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "content_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      content_provider_credentials: {
        Row: {
          brand_id: string
          connected_at: string
          credentials: Json
          expires_at: string | null
          id: string
          is_active: boolean
          provider_kind: string
        }
        Insert: {
          brand_id: string
          connected_at?: string
          credentials: Json
          expires_at?: string | null
          id?: string
          is_active?: boolean
          provider_kind: string
        }
        Update: {
          brand_id?: string
          connected_at?: string
          credentials?: Json
          expires_at?: string | null
          id?: string
          is_active?: boolean
          provider_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_provider_credentials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "content_brand_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_publications: {
        Row: {
          channel: string
          channel_account: string
          created_at: string
          draft_id: string
          error_message: string | null
          external_id: string | null
          id: string
          published_at: string | null
          scheduled_for: string
          status: string
          trust_level: string
        }
        Insert: {
          channel: string
          channel_account: string
          created_at?: string
          draft_id: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          published_at?: string | null
          scheduled_for: string
          status?: string
          trust_level?: string
        }
        Update: {
          channel?: string
          channel_account?: string
          created_at?: string
          draft_id?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          published_at?: string | null
          scheduled_for?: string
          status?: string
          trust_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_publications_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "content_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          body_template: Json
          business_type: string
          created_at: string
          created_by: string
          format: string
          goal: string
          id: string
          is_active: boolean
          performance: Json
          persona: string
          pillar: string
        }
        Insert: {
          body_template: Json
          business_type: string
          created_at?: string
          created_by?: string
          format: string
          goal: string
          id?: string
          is_active?: boolean
          performance?: Json
          persona: string
          pillar: string
        }
        Update: {
          body_template?: Json
          business_type?: string
          created_at?: string
          created_by?: string
          format?: string
          goal?: string
          id?: string
          is_active?: boolean
          performance?: Json
          persona?: string
          pillar?: string
        }
        Relationships: []
      }
      copilot_agent_runs: {
        Row: {
          action_type: string | null
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          auto_executed_actions: Json
          cache_create_tokens: number
          cache_read_tokens: number
          cost_usd: number
          created_at: string
          duration_ms: number | null
          error: string | null
          feedback_signal:
            | Database["public"]["Enums"]["copilot_feedback_signal"]
            | null
          id: string
          input: Json
          output: Json | null
          parent_run_id: string | null
          payload: Json | null
          pre_state: Json | null
          quality_score: number | null
          reflection: string | null
          restaurant_id: string | null
          reverted_at: string | null
          reverted_by: string | null
          reverted_reason: string | null
          state: string | null
          suggestion_status: string[]
          thread_id: string | null
          tokens_in: number
          tokens_out: number
          tool_calls: Json
          user_feedback: string | null
          version_id: string
        }
        Insert: {
          action_type?: string | null
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          auto_executed_actions?: Json
          cache_create_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          feedback_signal?:
            | Database["public"]["Enums"]["copilot_feedback_signal"]
            | null
          id?: string
          input?: Json
          output?: Json | null
          parent_run_id?: string | null
          payload?: Json | null
          pre_state?: Json | null
          quality_score?: number | null
          reflection?: string | null
          restaurant_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverted_reason?: string | null
          state?: string | null
          suggestion_status?: string[]
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          tool_calls?: Json
          user_feedback?: string | null
          version_id: string
        }
        Update: {
          action_type?: string | null
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          auto_executed_actions?: Json
          cache_create_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          feedback_signal?:
            | Database["public"]["Enums"]["copilot_feedback_signal"]
            | null
          id?: string
          input?: Json
          output?: Json | null
          parent_run_id?: string | null
          payload?: Json | null
          pre_state?: Json | null
          quality_score?: number | null
          reflection?: string | null
          restaurant_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverted_reason?: string | null
          state?: string | null
          suggestion_status?: string[]
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          tool_calls?: Json
          user_feedback?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "copilot_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "copilot_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agent_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_agent_versions: {
        Row: {
          agent_id: string
          change_reason: string | null
          created_at: string
          created_by: Database["public"]["Enums"]["copilot_version_author"]
          id: string
          model: string
          system_prompt: string
          tools: string[]
          version: number
        }
        Insert: {
          agent_id: string
          change_reason?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["copilot_version_author"]
          id?: string
          model?: string
          system_prompt: string
          tools?: string[]
          version: number
        }
        Update: {
          agent_id?: string
          change_reason?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["copilot_version_author"]
          id?: string
          model?: string
          system_prompt?: string
          tools?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "copilot_agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "copilot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_agents: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          name: string
          parent_agent_id: string | null
          quality_score: number | null
          responsibilities: string
          role: string
          status: Database["public"]["Enums"]["copilot_agent_status"]
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          name: string
          parent_agent_id?: string | null
          quality_score?: number | null
          responsibilities?: string
          role: string
          status?: Database["public"]["Enums"]["copilot_agent_status"]
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          name?: string
          parent_agent_id?: string | null
          quality_score?: number | null
          responsibilities?: string
          role?: string
          status?: Database["public"]["Enums"]["copilot_agent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "copilot_agents_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agents_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "copilot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_brief_schedules: {
        Row: {
          consecutive_skips: number
          created_at: string
          delivery_hour_local: number
          enabled: boolean
          last_sent_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consecutive_skips?: number
          created_at?: string
          delivery_hour_local?: number
          enabled?: boolean
          last_sent_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consecutive_skips?: number
          created_at?: string
          delivery_hour_local?: number
          enabled?: boolean
          last_sent_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_brief_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_brief_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_brief_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_brief_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_brief_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_content_items: {
        Row: {
          body: string
          created_at: string
          format: string
          hook: string | null
          id: string
          platform: string
          publish_at: string | null
          restaurant_id: string
          source_run_id: string | null
          status: Database["public"]["Enums"]["copilot_content_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          format?: string
          hook?: string | null
          id?: string
          platform: string
          publish_at?: string | null
          restaurant_id: string
          source_run_id?: string | null
          status?: Database["public"]["Enums"]["copilot_content_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          format?: string
          hook?: string | null
          id?: string
          platform?: string
          publish_at?: string | null
          restaurant_id?: string
          source_run_id?: string | null
          status?: Database["public"]["Enums"]["copilot_content_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_content_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_content_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_content_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_content_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_content_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_content_items_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_messages: {
        Row: {
          agent_run_id: string | null
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["copilot_message_role"]
          telegram_message_id: number | null
          thread_id: string
        }
        Insert: {
          agent_run_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["copilot_message_role"]
          telegram_message_id?: number | null
          thread_id: string
        }
        Update: {
          agent_run_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["copilot_message_role"]
          telegram_message_id?: number | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_run_fk"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "copilot_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_prompts: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      copilot_revenue_events: {
        Row: {
          amount_eur: number
          created_at: string
          event_type: Database["public"]["Enums"]["copilot_revenue_event_type"]
          id: string
          notes: string | null
          occurred_at: string
          restaurant_id: string
          source_run_id: string | null
        }
        Insert: {
          amount_eur: number
          created_at?: string
          event_type: Database["public"]["Enums"]["copilot_revenue_event_type"]
          id?: string
          notes?: string | null
          occurred_at?: string
          restaurant_id: string
          source_run_id?: string | null
        }
        Update: {
          amount_eur?: number
          created_at?: string
          event_type?: Database["public"]["Enums"]["copilot_revenue_event_type"]
          id?: string
          notes?: string | null
          occurred_at?: string
          restaurant_id?: string
          source_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_revenue_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_revenue_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_revenue_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_revenue_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_revenue_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_revenue_events_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_subscriptions: {
        Row: {
          commission_pct: number | null
          created_at: string
          ended_at: string | null
          id: string
          monthly_fee_eur: number
          notes: string | null
          plan: Database["public"]["Enums"]["copilot_subscription_plan"]
          restaurant_id: string
          started_at: string
        }
        Insert: {
          commission_pct?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          monthly_fee_eur?: number
          notes?: string | null
          plan: Database["public"]["Enums"]["copilot_subscription_plan"]
          restaurant_id: string
          started_at?: string
        }
        Update: {
          commission_pct?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          monthly_fee_eur?: number
          notes?: string | null
          plan?: Database["public"]["Enums"]["copilot_subscription_plan"]
          restaurant_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_telegram_processed_updates: {
        Row: {
          chat_id: number | null
          processed_at: string
          update_id: number
        }
        Insert: {
          chat_id?: number | null
          processed_at?: string
          update_id: number
        }
        Update: {
          chat_id?: number | null
          processed_at?: string
          update_id?: number
        }
        Relationships: []
      }
      copilot_tenant_authorized_users: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          notes: string | null
          restaurant_id: string
          telegram_user_id: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          telegram_user_id: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          telegram_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "copilot_tenant_authorized_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_authorized_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_authorized_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_authorized_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_tenant_authorized_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_tenant_config: {
        Row: {
          baseline_revenue_30d: number | null
          baseline_set_at: string | null
          blocked_topics: string[] | null
          brand_voice: string | null
          brand_voice_locked: boolean
          brand_voice_locked_at: string | null
          created_at: string
          delivery_active: boolean
          enabled_agents: string[]
          linked_channels: Json
          max_messages_per_day: number
          owner_communication_style: string | null
          owner_name: string | null
          owner_role: string | null
          performance_bonus_active: boolean
          preferred_morning_hour: number
          restaurant_id: string
          social_platforms_active: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          baseline_revenue_30d?: number | null
          baseline_set_at?: string | null
          blocked_topics?: string[] | null
          brand_voice?: string | null
          brand_voice_locked?: boolean
          brand_voice_locked_at?: string | null
          created_at?: string
          delivery_active?: boolean
          enabled_agents?: string[]
          linked_channels?: Json
          max_messages_per_day?: number
          owner_communication_style?: string | null
          owner_name?: string | null
          owner_role?: string | null
          performance_bonus_active?: boolean
          preferred_morning_hour?: number
          restaurant_id: string
          social_platforms_active?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          baseline_revenue_30d?: number | null
          baseline_set_at?: string | null
          blocked_topics?: string[] | null
          brand_voice?: string | null
          brand_voice_locked?: boolean
          brand_voice_locked_at?: string | null
          created_at?: string
          delivery_active?: boolean
          enabled_agents?: string[]
          linked_channels?: Json
          max_messages_per_day?: number
          owner_communication_style?: string | null
          owner_name?: string | null
          owner_role?: string | null
          performance_bonus_active?: boolean
          preferred_morning_hour?: number
          restaurant_id?: string
          social_platforms_active?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_tenant_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_tenant_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_tenant_facts: {
        Row: {
          confidence: number
          created_at: string
          fact_text: string
          id: string
          is_active: boolean
          restaurant_id: string
          source_run_id: string | null
          supersedes: string | null
          verified_at: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          fact_text: string
          id?: string
          is_active?: boolean
          restaurant_id: string
          source_run_id?: string | null
          supersedes?: string | null
          verified_at?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          fact_text?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string
          source_run_id?: string | null
          supersedes?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_tenant_facts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_tenant_facts_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "copilot_tenant_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          restaurant_id: string
          telegram_chat_id: number | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          restaurant_id: string
          telegram_chat_id?: number | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          restaurant_id?: string
          telegram_chat_id?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_threads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_threads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_threads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "copilot_threads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_threads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_account_deletion_requests: {
        Row: {
          completed_at: string | null
          courier_user_id: string
          email: string
          fleet_id: string | null
          id: string
          requested_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_purge_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          courier_user_id: string
          email: string
          fleet_id?: string | null
          id?: string
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_purge_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          courier_user_id?: string
          email?: string
          fleet_id?: string | null
          id?: string
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_purge_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_account_deletion_requests_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_agent_runs: {
        Row: {
          agent_name: string
          courier_id: string
          created_at: string
          error: string | null
          id: string
          model: string | null
          prompt: string
          prompt_tokens: number | null
          response: string | null
          response_tokens: number | null
        }
        Insert: {
          agent_name?: string
          courier_id: string
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          prompt: string
          prompt_tokens?: number | null
          response?: string | null
          response_tokens?: number | null
        }
        Update: {
          agent_name?: string
          courier_id?: string
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          prompt?: string
          prompt_tokens?: number | null
          response?: string | null
          response_tokens?: number | null
        }
        Relationships: []
      }
      courier_api_keys: {
        Row: {
          created_at: string
          fleet_id: string
          hir_tenant_id: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string | null
          label: string
          last_used_at: string | null
          owner_user_id: string
          scopes: string[]
        }
        Insert: {
          created_at?: string
          fleet_id: string
          hir_tenant_id?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix?: string | null
          label: string
          last_used_at?: string | null
          owner_user_id: string
          scopes?: string[]
        }
        Update: {
          created_at?: string
          fleet_id?: string
          hir_tenant_id?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string | null
          label?: string
          last_used_at?: string | null
          owner_user_id?: string
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "courier_api_keys_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_api_keys_hir_tenant_id_fkey"
            columns: ["hir_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_api_keys_hir_tenant_id_fkey"
            columns: ["hir_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_api_keys_hir_tenant_id_fkey"
            columns: ["hir_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_api_keys_hir_tenant_id_fkey"
            columns: ["hir_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_api_keys_hir_tenant_id_fkey"
            columns: ["hir_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_call_sessions: {
        Row: {
          client_proxy_number: string | null
          closed_at: string | null
          courier_order_id: string
          courier_proxy_number: string | null
          created_at: string
          expires_at: string | null
          status: string
          twilio_session_sid: string | null
        }
        Insert: {
          client_proxy_number?: string | null
          closed_at?: string | null
          courier_order_id: string
          courier_proxy_number?: string | null
          created_at?: string
          expires_at?: string | null
          status?: string
          twilio_session_sid?: string | null
        }
        Update: {
          client_proxy_number?: string | null
          closed_at?: string | null
          courier_order_id?: string
          courier_proxy_number?: string | null
          created_at?: string
          expires_at?: string | null
          status?: string
          twilio_session_sid?: string | null
        }
        Relationships: []
      }
      courier_combo_pushes: {
        Row: {
          accepted_at: string | null
          accepted_order_id: string | null
          anchor_order_id: string
          combo_order_ids: string[]
          courier_user_id: string
          id: string
          sent_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_order_id?: string | null
          anchor_order_id: string
          combo_order_ids?: string[]
          courier_user_id: string
          id?: string
          sent_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_order_id?: string | null
          anchor_order_id?: string
          combo_order_ids?: string[]
          courier_user_id?: string
          id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_combo_pushes_accepted_order_id_fkey"
            columns: ["accepted_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_combo_pushes_accepted_order_id_fkey"
            columns: ["accepted_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_combo_pushes_anchor_order_id_fkey"
            columns: ["anchor_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_combo_pushes_anchor_order_id_fkey"
            columns: ["anchor_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_daily_kpis: {
        Row: {
          avg_rating: number | null
          combo_pushes_accepted: number
          combo_pushes_sent: number
          courier_user_id: string
          created_at: string
          deliveries_cancelled: number
          deliveries_completed: number
          earnings_ron: number
          kpi_date: string
          online_minutes: number
          ratings_count: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          combo_pushes_accepted?: number
          combo_pushes_sent?: number
          courier_user_id: string
          created_at?: string
          deliveries_cancelled?: number
          deliveries_completed?: number
          earnings_ron?: number
          kpi_date: string
          online_minutes?: number
          ratings_count?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          combo_pushes_accepted?: number
          combo_pushes_sent?: number
          courier_user_id?: string
          created_at?: string
          deliveries_cancelled?: number
          deliveries_completed?: number
          earnings_ron?: number
          kpi_date?: string
          online_minutes?: number
          ratings_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      courier_feedback: {
        Row: {
          app_version: string | null
          courier_user_id: string
          created_at: string
          fleet_id: string | null
          id: string
          kind: string
          message: string
          platform: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          app_version?: string | null
          courier_user_id: string
          created_at?: string
          fleet_id?: string | null
          id?: string
          kind: string
          message: string
          platform?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          app_version?: string | null
          courier_user_id?: string
          created_at?: string
          fleet_id?: string | null
          id?: string
          kind?: string
          message?: string
          platform?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_feedback_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_fleets: {
        Row: {
          allowed_verticals: string[]
          brand_color: string
          can_approve_deletions: boolean
          can_validate_couriers: boolean
          contact_phone: string | null
          created_at: string
          custom_domain: string | null
          deleted_at: string | null
          delivery_app: string
          display_prefix: string | null
          id: string
          is_active: boolean
          is_financial_record: boolean
          is_pfa_solo: boolean
          kyc_required: boolean
          kyf_required: boolean
          logo_url: string | null
          name: string
          owner_user_id: string | null
          pfa_cui: string | null
          pfa_owner_user_id: string | null
          primary_city_id: string | null
          slug: string
          tier: string
          webhook_url: string | null
        }
        Insert: {
          allowed_verticals?: string[]
          brand_color?: string
          can_approve_deletions?: boolean
          can_validate_couriers?: boolean
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          deleted_at?: string | null
          delivery_app?: string
          display_prefix?: string | null
          id?: string
          is_active?: boolean
          is_financial_record?: boolean
          is_pfa_solo?: boolean
          kyc_required?: boolean
          kyf_required?: boolean
          logo_url?: string | null
          name: string
          owner_user_id?: string | null
          pfa_cui?: string | null
          pfa_owner_user_id?: string | null
          primary_city_id?: string | null
          slug: string
          tier?: string
          webhook_url?: string | null
        }
        Update: {
          allowed_verticals?: string[]
          brand_color?: string
          can_approve_deletions?: boolean
          can_validate_couriers?: boolean
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          deleted_at?: string | null
          delivery_app?: string
          display_prefix?: string | null
          id?: string
          is_active?: boolean
          is_financial_record?: boolean
          is_pfa_solo?: boolean
          kyc_required?: boolean
          kyf_required?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string | null
          pfa_cui?: string | null
          pfa_owner_user_id?: string | null
          primary_city_id?: string | null
          slug?: string
          tier?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_fleets_primary_city_id_fkey"
            columns: ["primary_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_fleets_primary_city_id_fkey"
            columns: ["primary_city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      courier_job_applications: {
        Row: {
          applied_at: string
          courier_user_id: string
          cv_doc_url: string | null
          hired_at: string | null
          id: string
          job_listing_id: string
          message: string | null
          reviewed_at: string | null
          status: string
        }
        Insert: {
          applied_at?: string
          courier_user_id: string
          cv_doc_url?: string | null
          hired_at?: string | null
          id?: string
          job_listing_id: string
          message?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          applied_at?: string
          courier_user_id?: string
          cv_doc_url?: string | null
          hired_at?: string | null
          id?: string
          job_listing_id?: string
          message?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_job_applications_job_listing_id_fkey"
            columns: ["job_listing_id"]
            isOneToOne: false
            referencedRelation: "courier_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_job_listings: {
        Row: {
          city_id: string | null
          created_at: string
          description: string
          employment_type: string
          expires_at: string | null
          fleet_id: string
          id: string
          languages_required: string[]
          position_title: string
          requirements: string | null
          salary_range_max_ron: number | null
          salary_range_min_ron: number | null
          shift_pattern: string | null
          status: string
          updated_at: string
          vehicle_required: string | null
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          description: string
          employment_type: string
          expires_at?: string | null
          fleet_id: string
          id?: string
          languages_required?: string[]
          position_title: string
          requirements?: string | null
          salary_range_max_ron?: number | null
          salary_range_min_ron?: number | null
          shift_pattern?: string | null
          status?: string
          updated_at?: string
          vehicle_required?: string | null
        }
        Update: {
          city_id?: string | null
          created_at?: string
          description?: string
          employment_type?: string
          expires_at?: string | null
          fleet_id?: string
          id?: string
          languages_required?: string[]
          position_title?: string
          requirements?: string | null
          salary_range_max_ron?: number | null
          salary_range_min_ron?: number | null
          shift_pattern?: string | null
          status?: string
          updated_at?: string
          vehicle_required?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_job_listings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_job_listings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "courier_job_listings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_kyc: {
        Row: {
          cnp_last4: string | null
          courier_user_id: string
          created_at: string
          cui: string | null
          deleted_at: string | null
          device_fingerprints: string[]
          fleet_id: string | null
          id_doc_url: string | null
          kyc_status: string
          legal_name: string | null
          rejected_reason: string | null
          selfie_url: string | null
          submitted_at: string | null
          updated_at: string
          validated_by: string | null
          validated_by_user_id: string | null
          verified_at: string | null
        }
        Insert: {
          cnp_last4?: string | null
          courier_user_id: string
          created_at?: string
          cui?: string | null
          deleted_at?: string | null
          device_fingerprints?: string[]
          fleet_id?: string | null
          id_doc_url?: string | null
          kyc_status?: string
          legal_name?: string | null
          rejected_reason?: string | null
          selfie_url?: string | null
          submitted_at?: string | null
          updated_at?: string
          validated_by?: string | null
          validated_by_user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          cnp_last4?: string | null
          courier_user_id?: string
          created_at?: string
          cui?: string | null
          deleted_at?: string | null
          device_fingerprints?: string[]
          fleet_id?: string | null
          id_doc_url?: string | null
          kyc_status?: string
          legal_name?: string | null
          rejected_reason?: string | null
          selfie_url?: string | null
          submitted_at?: string | null
          updated_at?: string
          validated_by?: string | null
          validated_by_user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      courier_order_secrets: {
        Row: {
          courier_order_id: string
          created_at: string
          pharma_callback_secret: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          courier_order_id: string
          created_at?: string
          pharma_callback_secret?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          courier_order_id?: string
          created_at?: string
          pharma_callback_secret?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_order_secrets_courier_order_id_fkey"
            columns: ["courier_order_id"]
            isOneToOne: true
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_order_secrets_courier_order_id_fkey"
            columns: ["courier_order_id"]
            isOneToOne: true
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_orders: {
        Row: {
          accepted_at: string | null
          assigned_courier_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          city_id: string | null
          cod_amount_ron: number | null
          courier_push_dispatched_at: string | null
          created_at: string
          customer_first_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivered_proof_id_url: string | null
          delivered_proof_prescription_url: string | null
          delivered_proof_taken_at: string | null
          delivered_proof_url: string | null
          delivery_fee_ron: number | null
          dropoff_lat: number | null
          dropoff_line1: string | null
          dropoff_lng: number | null
          dropoff_notes: string | null
          external_ref: string | null
          fleet_id: string
          id: string
          in_transit_at: string | null
          items: Json
          last_webhook_attempt_at: string | null
          last_webhook_status: string | null
          offer_expires_at: string | null
          offered_at: string | null
          payment_method: string | null
          pharma_callback_secret: string | null
          pharma_callback_url: string | null
          pharma_metadata: Json | null
          pharma_ready_at: string | null
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_line1: string | null
          pickup_lng: number | null
          pickup_name: string | null
          pickup_phone: string | null
          public_track_token: string
          restaurant_order_id: string | null
          restaurant_ready_at: string | null
          source_order_id: string | null
          source_tenant_id: string | null
          source_type: string
          status: string
          total_ron: number | null
          updated_at: string
          vertical: string
          webhook_callback_url: string | null
          webhook_failure_count: number
          webhook_secret: string | null
          zone_id: string | null
          zone_type: string | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_courier_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          city_id?: string | null
          cod_amount_ron?: number | null
          courier_push_dispatched_at?: string | null
          created_at?: string
          customer_first_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_proof_id_url?: string | null
          delivered_proof_prescription_url?: string | null
          delivered_proof_taken_at?: string | null
          delivered_proof_url?: string | null
          delivery_fee_ron?: number | null
          dropoff_lat?: number | null
          dropoff_line1?: string | null
          dropoff_lng?: number | null
          dropoff_notes?: string | null
          external_ref?: string | null
          fleet_id: string
          id?: string
          in_transit_at?: string | null
          items?: Json
          last_webhook_attempt_at?: string | null
          last_webhook_status?: string | null
          offer_expires_at?: string | null
          offered_at?: string | null
          payment_method?: string | null
          pharma_callback_secret?: string | null
          pharma_callback_url?: string | null
          pharma_metadata?: Json | null
          pharma_ready_at?: string | null
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_line1?: string | null
          pickup_lng?: number | null
          pickup_name?: string | null
          pickup_phone?: string | null
          public_track_token: string
          restaurant_order_id?: string | null
          restaurant_ready_at?: string | null
          source_order_id?: string | null
          source_tenant_id?: string | null
          source_type: string
          status?: string
          total_ron?: number | null
          updated_at?: string
          vertical?: string
          webhook_callback_url?: string | null
          webhook_failure_count?: number
          webhook_secret?: string | null
          zone_id?: string | null
          zone_type?: string | null
        }
        Update: {
          accepted_at?: string | null
          assigned_courier_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          city_id?: string | null
          cod_amount_ron?: number | null
          courier_push_dispatched_at?: string | null
          created_at?: string
          customer_first_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_proof_id_url?: string | null
          delivered_proof_prescription_url?: string | null
          delivered_proof_taken_at?: string | null
          delivered_proof_url?: string | null
          delivery_fee_ron?: number | null
          dropoff_lat?: number | null
          dropoff_line1?: string | null
          dropoff_lng?: number | null
          dropoff_notes?: string | null
          external_ref?: string | null
          fleet_id?: string
          id?: string
          in_transit_at?: string | null
          items?: Json
          last_webhook_attempt_at?: string | null
          last_webhook_status?: string | null
          offer_expires_at?: string | null
          offered_at?: string | null
          payment_method?: string | null
          pharma_callback_secret?: string | null
          pharma_callback_url?: string | null
          pharma_metadata?: Json | null
          pharma_ready_at?: string | null
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_line1?: string | null
          pickup_lng?: number | null
          pickup_name?: string | null
          pickup_phone?: string | null
          public_track_token?: string
          restaurant_order_id?: string | null
          restaurant_ready_at?: string | null
          source_order_id?: string | null
          source_tenant_id?: string | null
          source_type?: string
          status?: string
          total_ron?: number | null
          updated_at?: string
          vertical?: string
          webhook_callback_url?: string | null
          webhook_failure_count?: number
          webhook_secret?: string | null
          zone_id?: string | null
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_orders_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "courier_orders_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_restaurant_order_id_fkey"
            columns: ["restaurant_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_restaurant_order_id_fkey"
            columns: ["restaurant_order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_permit_audit_log: {
        Row: {
          actor_user_id: string | null
          courier_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_status: string
          old_status: string | null
          permit_country_iso: string | null
          permit_munca_valid_until: string | null
          reason: string | null
        }
        Insert: {
          actor_user_id?: string | null
          courier_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status: string
          old_status?: string | null
          permit_country_iso?: string | null
          permit_munca_valid_until?: string | null
          reason?: string | null
        }
        Update: {
          actor_user_id?: string | null
          courier_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string
          old_status?: string | null
          permit_country_iso?: string | null
          permit_munca_valid_until?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      courier_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          fleet_id: string
          full_name: string
          is_non_eu_resident: boolean
          manager_note: string | null
          max_parallel_orders: number | null
          permit_country_iso: string | null
          permit_doc_url: string | null
          permit_munca_valid_until: string | null
          permit_status: string
          permit_verified_at: string | null
          permit_verified_by: string | null
          phone: string
          status: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          fleet_id: string
          full_name: string
          is_non_eu_resident?: boolean
          manager_note?: string | null
          max_parallel_orders?: number | null
          permit_country_iso?: string | null
          permit_doc_url?: string | null
          permit_munca_valid_until?: string | null
          permit_status?: string
          permit_verified_at?: string | null
          permit_verified_by?: string | null
          phone: string
          status?: string
          user_id: string
          vehicle_type: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          fleet_id?: string
          full_name?: string
          is_non_eu_resident?: boolean
          manager_note?: string | null
          max_parallel_orders?: number | null
          permit_country_iso?: string | null
          permit_doc_url?: string | null
          permit_munca_valid_until?: string | null
          permit_status?: string
          permit_verified_at?: string | null
          permit_verified_by?: string | null
          phone?: string
          status?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_profiles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      courier_push_tokens: {
        Row: {
          courier_user_id: string
          created_at: string
          fcm_token: string
          id: string
          last_seen_at: string
          platform: string
        }
        Insert: {
          courier_user_id: string
          created_at?: string
          fcm_token: string
          id?: string
          last_seen_at?: string
          platform: string
        }
        Update: {
          courier_user_id?: string
          created_at?: string
          fcm_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_push_tokens_courier_user_id_fkey"
            columns: ["courier_user_id"]
            isOneToOne: false
            referencedRelation: "courier_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      courier_shift_slots: {
        Row: {
          courier_note: string | null
          courier_user_id: string
          created_at: string
          id: string
          prev_slot_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slot_end: string
          slot_start: string
          status: string
          updated_at: string
        }
        Insert: {
          courier_note?: string | null
          courier_user_id: string
          created_at?: string
          id?: string
          prev_slot_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_end: string
          slot_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          courier_note?: string | null
          courier_user_id?: string
          created_at?: string
          id?: string
          prev_slot_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_end?: string
          slot_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_shift_slots_prev_slot_id_fkey"
            columns: ["prev_slot_id"]
            isOneToOne: false
            referencedRelation: "courier_shift_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_shifts: {
        Row: {
          approved_slot_id: string | null
          courier_user_id: string
          ended_at: string | null
          id: string
          last_lat: number | null
          last_lng: number | null
          last_seen_at: string | null
          started_at: string
          status: string
        }
        Insert: {
          approved_slot_id?: string | null
          courier_user_id: string
          ended_at?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          approved_slot_id?: string | null
          courier_user_id?: string
          ended_at?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_shifts_approved_slot_id_fkey"
            columns: ["approved_slot_id"]
            isOneToOne: false
            referencedRelation: "courier_shift_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_tips: {
        Row: {
          amount_ron: number
          courier_user_id: string
          delivery_id: string
          id: string
          recorded_at: string
        }
        Insert: {
          amount_ron: number
          courier_user_id: string
          delivery_id: string
          id?: string
          recorded_at?: string
        }
        Update: {
          amount_ron?: number
          courier_user_id?: string
          delivery_id?: string
          id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_tips_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_tips_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_transfers: {
        Row: {
          courier_user_id: string
          created_at: string
          from_city: string | null
          from_fleet_id: string | null
          id: string
          reason: string | null
          to_city: string | null
          to_fleet_id: string
          transferred_by: string | null
        }
        Insert: {
          courier_user_id: string
          created_at?: string
          from_city?: string | null
          from_fleet_id?: string | null
          id?: string
          reason?: string | null
          to_city?: string | null
          to_fleet_id: string
          transferred_by?: string | null
        }
        Update: {
          courier_user_id?: string
          created_at?: string
          from_city?: string | null
          from_fleet_id?: string | null
          id?: string
          reason?: string | null
          to_city?: string | null
          to_fleet_id?: string
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_transfers_from_fleet_id_fkey"
            columns: ["from_fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_transfers_to_fleet_id_fkey"
            columns: ["to_fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_agent_responses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          intent: string
          posted_at: string | null
          response_options: Json
          selected_option: number | null
          source_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          intent: string
          posted_at?: string | null
          response_options: Json
          selected_option?: number | null
          source_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          intent?: string
          posted_at?: string | null
          response_options?: Json
          selected_option?: number | null
          source_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_agent_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cs_agent_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cs_agent_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "cs_agent_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_agent_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          line1: string
          line2?: string | null
          longitude?: number | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_phone_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      customer_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          order_id: string
          p256dh: string
          tenant_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          order_id: string
          p256dh: string
          tenant_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          order_id?: string
          p256dh?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_push_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reactivation_contacts: {
        Row: {
          channel: string
          contacted_at: string
          customer_phone: string
          id: string
          template_used: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          contacted_at?: string
          customer_phone: string
          id?: string
          template_used?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          contacted_at?: string
          customer_phone?: string
          id?: string
          template_used?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reactivation_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_reactivation_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_reactivation_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_reactivation_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reactivation_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          locale: string
          marketing_consent: boolean
          marketing_consent_given_at: string | null
          marketing_consent_source: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_given_at?: string | null
          marketing_consent_source?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_given_at?: string | null
          marketing_consent_source?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_complaints: {
        Row: {
          canonical_order_id: string | null
          category: string
          courier_order_id: string
          courier_user_id: string | null
          created_at: string
          description: string | null
          id: string
          resolution_note: string | null
          resolved_at: string | null
          source_tenant_id: string | null
          status: string
        }
        Insert: {
          canonical_order_id?: string | null
          category: string
          courier_order_id: string
          courier_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          source_tenant_id?: string | null
          status?: string
        }
        Update: {
          canonical_order_id?: string | null
          category?: string
          courier_order_id?: string
          courier_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          source_tenant_id?: string | null
          status?: string
        }
        Relationships: []
      }
      delivery_dispatch_failures: {
        Row: {
          attempts: number
          created_at: string
          error_message: string
          http_status: number | null
          id: string
          last_error_at: string
          next_attempt_at: string
          order_id: string
          payload: Json
          resolved_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message: string
          http_status?: number | null
          id?: string
          last_error_at?: string
          next_attempt_at?: string
          order_id: string
          payload: Json
          resolved_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string
          http_status?: number | null
          id?: string
          last_error_at?: string
          next_attempt_at?: string
          order_id?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_dispatch_failures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_dispatch_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pricing_tiers: {
        Row: {
          created_at: string
          id: string
          max_km: number
          min_km: number
          price_ron: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_km: number
          min_km: number
          price_ron: number
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_km?: number
          min_km?: number
          price_ron?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pricing_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_pricing_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_pricing_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_pricing_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pricing_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pricings: {
        Row: {
          computed_at: string
          courier_payout_cents: number
          delivery_id: string
          formula_snapshot: Json
          hir_margin_cents: number | null
          id: string
          repriced_from_id: string | null
          restaurant_fee_cents: number
          zone_id: string
        }
        Insert: {
          computed_at?: string
          courier_payout_cents: number
          delivery_id: string
          formula_snapshot: Json
          hir_margin_cents?: number | null
          id?: string
          repriced_from_id?: string | null
          restaurant_fee_cents: number
          zone_id: string
        }
        Update: {
          computed_at?: string
          courier_payout_cents?: number
          delivery_id?: string
          formula_snapshot?: Json
          hir_margin_cents?: number | null
          id?: string
          repriced_from_id?: string | null
          restaurant_fee_cents?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pricings_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pricings_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pricings_repriced_from_id_fkey"
            columns: ["repriced_from_id"]
            isOneToOne: false
            referencedRelation: "delivery_pricings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pricings_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "pricing_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_ratings: {
        Row: {
          canonical_order_id: string | null
          comment: string | null
          courier_order_id: string
          courier_user_id: string | null
          created_at: string
          id: string
          rated_by_role: string
          source_tenant_id: string | null
          stars: number
          tags: string[]
        }
        Insert: {
          canonical_order_id?: string | null
          comment?: string | null
          courier_order_id: string
          courier_user_id?: string | null
          created_at?: string
          id?: string
          rated_by_role?: string
          source_tenant_id?: string | null
          stars: number
          tags?: string[]
        }
        Update: {
          canonical_order_id?: string | null
          comment?: string | null
          courier_order_id?: string
          courier_user_id?: string | null
          created_at?: string
          id?: string
          rated_by_role?: string
          source_tenant_id?: string | null
          stars?: number
          tags?: string[]
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          polygon: Json
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          polygon: Json
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          polygon?: Json
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_forecast_cells: {
        Row: {
          ci_lower: number
          ci_upper: number
          computed_at: string
          day_of_week: number
          forecast_count: number
          hour_of_day: number
          id: string
          mean_count: number
          sample_weeks: number
          std_count: number
          tenant_id: string
          trend_ratio: number
        }
        Insert: {
          ci_lower?: number
          ci_upper?: number
          computed_at?: string
          day_of_week: number
          forecast_count?: number
          hour_of_day: number
          id?: string
          mean_count?: number
          sample_weeks?: number
          std_count?: number
          tenant_id: string
          trend_ratio?: number
        }
        Update: {
          ci_lower?: number
          ci_upper?: number
          computed_at?: string
          day_of_week?: number
          forecast_count?: number
          hour_of_day?: number
          id?: string
          mean_count?: number
          sample_weeks?: number
          std_count?: number
          tenant_id?: string
          trend_ratio?: number
        }
        Relationships: [
          {
            foreignKeyName: "demand_forecast_cells_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "demand_forecast_cells_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "demand_forecast_cells_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "demand_forecast_cells_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_forecast_cells_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_signals: {
        Row: {
          distance_km: number | null
          dropoff_lat_1km: number | null
          dropoff_lng_1km: number | null
          id: string
          occurred_at: string
          payload: Json
          reason: string | null
          signal_type: string
          source_tenant_id: string | null
          vertical: string
          zone_id: string | null
        }
        Insert: {
          distance_km?: number | null
          dropoff_lat_1km?: number | null
          dropoff_lng_1km?: number | null
          id?: string
          occurred_at?: string
          payload?: Json
          reason?: string | null
          signal_type: string
          source_tenant_id?: string | null
          vertical?: string
          zone_id?: string | null
        }
        Update: {
          distance_km?: number | null
          dropoff_lat_1km?: number | null
          dropoff_lng_1km?: number | null
          id?: string
          occurred_at?: string
          payload?: Json
          reason?: string | null
          signal_type?: string
          source_tenant_id?: string | null
          vertical?: string
          zone_id?: string | null
        }
        Relationships: []
      }
      driver_scores: {
        Row: {
          breakdown: Json
          courier_user_id: string
          created_at: string
          id: string
          last_calculated_at: string
          rolling_window_count: number
          score: number
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          courier_user_id: string
          created_at?: string
          id?: string
          last_calculated_at?: string
          rolling_window_count?: number
          score?: number
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          courier_user_id?: string
          created_at?: string
          id?: string
          last_calculated_at?: string
          rolling_window_count?: number
          score?: number
          updated_at?: string
        }
        Relationships: []
      }
      experiments: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          tenant_id: string | null
          updated_at: string
          variants: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          tenant_id?: string | null
          updated_at?: string
          variants?: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          tenant_id?: string | null
          updated_at?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      external_dispatch_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          order_id: string
          request_body_sha256: string
          request_url: string
          response_body_excerpt: string | null
          response_status: number | null
          succeeded: boolean
          tenant_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          order_id: string
          request_body_sha256: string
          request_url: string
          response_body_excerpt?: string | null
          response_status?: number | null
          succeeded?: boolean
          tenant_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          order_id?: string
          request_body_sha256?: string
          request_url?: string
          response_body_excerpt?: string | null
          response_status?: number | null
          succeeded?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_dispatch_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_dispatch_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          category: string
          console_log_excerpt: string | null
          created_at: string
          description: string
          fix_diff_lines: number | null
          fix_files_touched: string[] | null
          fix_pr_number: number | null
          fix_pr_url: string | null
          id: string
          notified_reporter_at: string | null
          reporter_user_id: string | null
          resolved_at: string | null
          screenshot_path: string | null
          severity: string | null
          status: string
          supervisor_decision: string | null
          supervisor_reasoning: string | null
          supervisor_score: number | null
          tenant_id: string | null
          triage_at: string | null
          triage_auto_fix_eligible: boolean | null
          triage_auto_fix_scope: string | null
          triage_category: string | null
          triage_confidence: number | null
          triage_dedupe_of: string | null
          triage_reasoning: string | null
          triage_routed_to_fix: boolean
          updated_at: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          category: string
          console_log_excerpt?: string | null
          created_at?: string
          description: string
          fix_diff_lines?: number | null
          fix_files_touched?: string[] | null
          fix_pr_number?: number | null
          fix_pr_url?: string | null
          id?: string
          notified_reporter_at?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          screenshot_path?: string | null
          severity?: string | null
          status?: string
          supervisor_decision?: string | null
          supervisor_reasoning?: string | null
          supervisor_score?: number | null
          tenant_id?: string | null
          triage_at?: string | null
          triage_auto_fix_eligible?: boolean | null
          triage_auto_fix_scope?: string | null
          triage_category?: string | null
          triage_confidence?: number | null
          triage_dedupe_of?: string | null
          triage_reasoning?: string | null
          triage_routed_to_fix?: boolean
          updated_at?: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          category?: string
          console_log_excerpt?: string | null
          created_at?: string
          description?: string
          fix_diff_lines?: number | null
          fix_files_touched?: string[] | null
          fix_pr_number?: number | null
          fix_pr_url?: string | null
          id?: string
          notified_reporter_at?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          screenshot_path?: string | null
          severity?: string | null
          status?: string
          supervisor_decision?: string | null
          supervisor_reasoning?: string | null
          supervisor_score?: number | null
          tenant_id?: string | null
          triage_at?: string | null
          triage_auto_fix_eligible?: boolean | null
          triage_auto_fix_scope?: string | null
          triage_category?: string | null
          triage_confidence?: number | null
          triage_dedupe_of?: string | null
          triage_reasoning?: string | null
          triage_routed_to_fix?: boolean
          updated_at?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_triage_dedupe_of_fkey"
            columns: ["triage_dedupe_of"]
            isOneToOne: false
            referencedRelation: "feedback_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_attempts: {
        Row: {
          agent_response_raw: Json | null
          branch_name: string | null
          commit_message: string | null
          cost_usd: number | null
          created_at: string
          diff_lines_added: number | null
          diff_lines_removed: number | null
          feedback_id: string | null
          files_touched: string[] | null
          id: string
          pr_number: number | null
          pr_url: string | null
          rejection_reason: string | null
          status: string
          supervisor_cost_usd: number | null
          supervisor_decision: string | null
          supervisor_guardrails_failed: string[] | null
          supervisor_guardrails_passed: string[] | null
          supervisor_reasoning: string | null
          supervisor_response_raw: Json | null
          supervisor_score: number | null
          updated_at: string
        }
        Insert: {
          agent_response_raw?: Json | null
          branch_name?: string | null
          commit_message?: string | null
          cost_usd?: number | null
          created_at?: string
          diff_lines_added?: number | null
          diff_lines_removed?: number | null
          feedback_id?: string | null
          files_touched?: string[] | null
          id?: string
          pr_number?: number | null
          pr_url?: string | null
          rejection_reason?: string | null
          status?: string
          supervisor_cost_usd?: number | null
          supervisor_decision?: string | null
          supervisor_guardrails_failed?: string[] | null
          supervisor_guardrails_passed?: string[] | null
          supervisor_reasoning?: string | null
          supervisor_response_raw?: Json | null
          supervisor_score?: number | null
          updated_at?: string
        }
        Update: {
          agent_response_raw?: Json | null
          branch_name?: string | null
          commit_message?: string | null
          cost_usd?: number | null
          created_at?: string
          diff_lines_added?: number | null
          diff_lines_removed?: number | null
          feedback_id?: string | null
          files_touched?: string[] | null
          id?: string
          pr_number?: number | null
          pr_url?: string | null
          rejection_reason?: string | null
          status?: string
          supervisor_cost_usd?: number | null
          supervisor_decision?: string | null
          supervisor_guardrails_failed?: string[] | null
          supervisor_guardrails_passed?: string[] | null
          supervisor_reasoning?: string | null
          supervisor_response_raw?: Json | null
          supervisor_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_attempts_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_aggregate_scores: {
        Row: {
          auto_pause_reason: string | null
          auto_paused_at: string | null
          avg_rating: number | null
          calculated_at: string
          dispute_count: number
          fleet_id: string
          on_time_pct: number | null
          total_matches: number
        }
        Insert: {
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          avg_rating?: number | null
          calculated_at?: string
          dispute_count?: number
          fleet_id: string
          on_time_pct?: number | null
          total_matches?: number
        }
        Update: {
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          avg_rating?: number | null
          calculated_at?: string
          dispute_count?: number
          fleet_id?: string
          on_time_pct?: number | null
          total_matches?: number
        }
        Relationships: []
      }
      fleet_courier_tariffs: {
        Row: {
          cod_bonus_cents: number
          created_at: string
          created_by: string | null
          fleet_id: string
          id: string
          is_financial_record: boolean
          payout_cents: number
          per_km_cents: number | null
          pickup_fee_cents: number | null
          reason: string | null
          valid_from: string
          valid_until: string | null
          zone_id: string | null
        }
        Insert: {
          cod_bonus_cents?: number
          created_at?: string
          created_by?: string | null
          fleet_id: string
          id?: string
          is_financial_record?: boolean
          payout_cents: number
          per_km_cents?: number | null
          pickup_fee_cents?: number | null
          reason?: string | null
          valid_from?: string
          valid_until?: string | null
          zone_id?: string | null
        }
        Update: {
          cod_bonus_cents?: number
          created_at?: string
          created_by?: string | null
          fleet_id?: string
          id?: string
          is_financial_record?: boolean
          payout_cents?: number
          per_km_cents?: number | null
          pickup_fee_cents?: number | null
          reason?: string | null
          valid_from?: string
          valid_until?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_courier_tariffs_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_courier_tariffs_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "pricing_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_demand_estimates: {
        Row: {
          city_id: string
          created_at: string
          day_of_week: number
          estimated_orders: number
          hour: number
          id: string
          notes: string | null
          source: string
          tenant_id: string | null
          updated_at: string
          zone_polygon: Json | null
        }
        Insert: {
          city_id: string
          created_at?: string
          day_of_week: number
          estimated_orders: number
          hour: number
          id?: string
          notes?: string | null
          source?: string
          tenant_id?: string | null
          updated_at?: string
          zone_polygon?: Json | null
        }
        Update: {
          city_id?: string
          created_at?: string
          day_of_week?: number
          estimated_orders?: number
          hour?: number
          id?: string
          notes?: string | null
          source?: string
          tenant_id?: string | null
          updated_at?: string
          zone_polygon?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_demand_estimates_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_demand_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_kyf: {
        Row: {
          act_constitutiv_url: string | null
          address: string | null
          anaf_active: boolean | null
          anaf_checked_at: string | null
          caen_code: string | null
          certificat_inreg_url: string | null
          company_name: string | null
          created_at: string
          cui: string | null
          deleted_at: string | null
          extras_cont_url: string | null
          fleet_id: string
          iban: string | null
          kyf_status: string
          reg_com: string | null
          rejected_reason: string | null
          submitted_at: string | null
          updated_at: string
          vat_payer: boolean | null
          verified_at: string | null
        }
        Insert: {
          act_constitutiv_url?: string | null
          address?: string | null
          anaf_active?: boolean | null
          anaf_checked_at?: string | null
          caen_code?: string | null
          certificat_inreg_url?: string | null
          company_name?: string | null
          created_at?: string
          cui?: string | null
          deleted_at?: string | null
          extras_cont_url?: string | null
          fleet_id: string
          iban?: string | null
          kyf_status?: string
          reg_com?: string | null
          rejected_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          vat_payer?: boolean | null
          verified_at?: string | null
        }
        Update: {
          act_constitutiv_url?: string | null
          address?: string | null
          anaf_active?: boolean | null
          anaf_checked_at?: string | null
          caen_code?: string | null
          certificat_inreg_url?: string | null
          company_name?: string | null
          created_at?: string
          cui?: string | null
          deleted_at?: string | null
          extras_cont_url?: string | null
          fleet_id?: string
          iban?: string | null
          kyf_status?: string
          reg_com?: string | null
          rejected_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          vat_payer?: boolean | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_kyf_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: true
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_restaurant_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          fleet_id: string
          id: string
          last_strike_at: string | null
          notes: string | null
          paused_at: string | null
          restaurant_tenant_id: string
          role: string
          status: string
          terminated_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          fleet_id: string
          id?: string
          last_strike_at?: string | null
          notes?: string | null
          paused_at?: string | null
          restaurant_tenant_id: string
          role: string
          status?: string
          terminated_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          fleet_id?: string
          id?: string
          last_strike_at?: string | null
          notes?: string | null
          paused_at?: string | null
          restaurant_tenant_id?: string
          role?: string
          status?: string
          terminated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_restaurant_assignments_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_restaurant_assignments_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_restaurant_assignments_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_restaurant_assignments_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_restaurant_assignments_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_restaurant_assignments_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_sla_daily: {
        Row: {
          accept_p50_sec: number | null
          accept_p90_sec: number | null
          cancelled: number
          computed_at: string
          day: string
          delivered: number
          delivery_rate: number | null
          dropoff_p50_sec: number | null
          dropoff_p90_sec: number | null
          fleet_id: string
          orders_total: number
          pickup_p50_sec: number | null
          pickup_p90_sec: number | null
          total_p50_sec: number | null
          total_p90_sec: number | null
          vertical: string
        }
        Insert: {
          accept_p50_sec?: number | null
          accept_p90_sec?: number | null
          cancelled?: number
          computed_at?: string
          day: string
          delivered?: number
          delivery_rate?: number | null
          dropoff_p50_sec?: number | null
          dropoff_p90_sec?: number | null
          fleet_id: string
          orders_total?: number
          pickup_p50_sec?: number | null
          pickup_p90_sec?: number | null
          total_p50_sec?: number | null
          total_p90_sec?: number | null
          vertical: string
        }
        Update: {
          accept_p50_sec?: number | null
          accept_p90_sec?: number | null
          cancelled?: number
          computed_at?: string
          day?: string
          delivered?: number
          delivery_rate?: number | null
          dropoff_p50_sec?: number | null
          dropoff_p90_sec?: number | null
          fleet_id?: string
          orders_total?: number
          pickup_p50_sec?: number | null
          pickup_p90_sec?: number | null
          total_p50_sec?: number | null
          total_p90_sec?: number | null
          vertical?: string
        }
        Relationships: []
      }
      fleet_strikes: {
        Row: {
          assignment_id: string | null
          created_at: string
          fleet_id: string
          id: string
          notes: string | null
          occurred_at: string
          reason: string
          reported_by: string | null
          restaurant_tenant_id: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          fleet_id: string
          id?: string
          notes?: string | null
          occurred_at?: string
          reason: string
          reported_by?: string | null
          restaurant_tenant_id: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          fleet_id?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          reason?: string
          reported_by?: string | null
          restaurant_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_strikes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "fleet_restaurant_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_strikes_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_strikes_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_strikes_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_strikes_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fleet_strikes_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_strikes_restaurant_tenant_id_fkey"
            columns: ["restaurant_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vendor_tariffs: {
        Row: {
          cod_bonus_cents: number
          created_at: string
          created_by: string | null
          fleet_id: string
          id: string
          per_km_cents: number
          pickup_fee_cents: number
          reason: string | null
          valid_from: string
          valid_until: string | null
          zone_id: string | null
        }
        Insert: {
          cod_bonus_cents?: number
          created_at?: string
          created_by?: string | null
          fleet_id: string
          id?: string
          per_km_cents?: number
          pickup_fee_cents?: number
          reason?: string | null
          valid_from?: string
          valid_until?: string | null
          zone_id?: string | null
        }
        Update: {
          cod_bonus_cents?: number
          created_at?: string
          created_by?: string | null
          fleet_id?: string
          id?: string
          per_km_cents?: number
          pickup_fee_cents?: number
          reason?: string | null
          valid_from?: string
          valid_until?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vendor_tariffs_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vendor_tariffs_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "pricing_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_webhook_secrets: {
        Row: {
          created_at: string
          fleet_id: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          created_at?: string
          fleet_id: string
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          created_at?: string
          fleet_id?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_webhook_secrets_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: true
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_zones: {
        Row: {
          capacity_courier_count: number
          city_id: string | null
          created_at: string
          fleet_id: string
          id: string
          is_active: boolean
          name: string
          polygon: Json
          target_orders_per_hour: number
          updated_at: string
        }
        Insert: {
          capacity_courier_count?: number
          city_id?: string | null
          created_at?: string
          fleet_id: string
          id?: string
          is_active?: boolean
          name: string
          polygon: Json
          target_orders_per_hour?: number
          updated_at?: string
        }
        Update: {
          capacity_courier_count?: number
          city_id?: string | null
          created_at?: string
          fleet_id?: string
          id?: string
          is_active?: boolean
          name?: string
          polygon?: Json
          target_orders_per_hour?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "fleet_zones_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fm_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fm_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fm_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fm_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      function_runs: {
        Row: {
          duration_ms: number | null
          ended_at: string | null
          error_text: string | null
          function_name: string
          id: string
          metadata: Json
          started_at: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          duration_ms?: number | null
          ended_at?: string | null
          error_text?: string | null
          function_name: string
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          duration_ms?: number | null
          ended_at?: string | null
          error_text?: string | null
          function_name?: string
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          cache_key: string
          created_at: string
          display_name: string
          lat: number
          lng: number
        }
        Insert: {
          cache_key: string
          created_at?: string
          display_name: string
          lat: number
          lng: number
        }
        Update: {
          cache_key?: string
          created_at?: string
          display_name?: string
          lat?: number
          lng?: number
        }
        Relationships: []
      }
      github_pr_events: {
        Row: {
          actor: string | null
          created_at: string
          delivery_id: string | null
          event_type: string
          id: string
          notified_telegram: boolean
          pr_head_sha: string | null
          pr_number: number | null
          pr_title: string | null
          raw_payload: Json | null
          repo: string
          severity: string
          summary: string | null
          triage_at: string | null
          triage_decision: Json | null
          triage_routed_to_fix: boolean
        }
        Insert: {
          actor?: string | null
          created_at?: string
          delivery_id?: string | null
          event_type: string
          id?: string
          notified_telegram?: boolean
          pr_head_sha?: string | null
          pr_number?: number | null
          pr_title?: string | null
          raw_payload?: Json | null
          repo: string
          severity: string
          summary?: string | null
          triage_at?: string | null
          triage_decision?: Json | null
          triage_routed_to_fix?: boolean
        }
        Update: {
          actor?: string | null
          created_at?: string
          delivery_id?: string | null
          event_type?: string
          id?: string
          notified_telegram?: boolean
          pr_head_sha?: string | null
          pr_number?: number | null
          pr_title?: string | null
          raw_payload?: Json | null
          repo?: string
          severity?: string
          summary?: string | null
          triage_at?: string | null
          triage_decision?: Json | null
          triage_routed_to_fix?: boolean
        }
        Relationships: []
      }
      gloriafood_import_runs: {
        Row: {
          categories_inserted: number
          categories_seen: number
          error_message: string | null
          finished_at: string | null
          id: string
          items_inserted: number
          items_seen: number
          items_skipped: number
          master_key_hash: string
          raw_preview: Json | null
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          categories_inserted?: number
          categories_seen?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_inserted?: number
          items_seen?: number
          items_skipped?: number
          master_key_hash: string
          raw_preview?: Json | null
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          categories_inserted?: number
          categories_seen?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_inserted?: number
          items_seen?: number
          items_skipped?: number
          master_key_hash?: string
          raw_preview?: Json | null
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gloriafood_import_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "gloriafood_import_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "gloriafood_import_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "gloriafood_import_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gloriafood_import_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_recommendations: {
        Row: {
          auto_action_available: boolean
          category: string
          cost_usd: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          generated_at: string
          id: string
          model: string
          payload: Json
          priority: string
          rationale_ro: string
          status: string
          suggested_action_ro: string
          tenant_id: string
          title_ro: string
        }
        Insert: {
          auto_action_available?: boolean
          category: string
          cost_usd?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          generated_at?: string
          id?: string
          model?: string
          payload?: Json
          priority?: string
          rationale_ro: string
          status?: string
          suggested_action_ro: string
          tenant_id: string
          title_ro: string
        }
        Update: {
          auto_action_available?: boolean
          category?: string
          cost_usd?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          generated_at?: string
          id?: string
          model?: string
          payload?: Json
          priority?: string
          rationale_ro?: string
          status?: string
          suggested_action_ro?: string
          tenant_id?: string
          title_ro?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "growth_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "growth_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "growth_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check_pings: {
        Row: {
          app: string
          checked_at: string
          id: number
          latency_ms: number | null
          ok: boolean
          payload: Json | null
          status_code: number | null
        }
        Insert: {
          app: string
          checked_at?: string
          id?: number
          latency_ms?: number | null
          ok: boolean
          payload?: Json | null
          status_code?: number | null
        }
        Update: {
          app?: string
          checked_at?: string
          id?: number
          latency_ms?: number | null
          ok?: boolean
          payload?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      health_monitor_state: {
        Row: {
          app: string
          failed_since: string | null
          last_checked_at: string
          last_ok: boolean
        }
        Insert: {
          app: string
          failed_since?: string | null
          last_checked_at?: string
          last_ok: boolean
        }
        Update: {
          app?: string
          failed_since?: string | null
          last_checked_at?: string
          last_ok?: boolean
        }
        Relationships: []
      }
      hepi_settings: {
        Row: {
          id: string
          mode: string
          per_action_mode: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          mode?: string
          per_action_mode?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          mode?: string
          per_action_mode?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      hepy_connect_nonces: {
        Row: {
          consumed_at: string | null
          consumed_by_tg: number | null
          created_at: string
          nonce: string
          owner_user_id: string
          tenant_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_tg?: number | null
          created_at?: string
          nonce: string
          owner_user_id: string
          tenant_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by_tg?: number | null
          created_at?: string
          nonce?: string
          owner_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hepy_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hepy_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      hepy_conversation_state: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          intent: string
          payload: Json
          telegram_user_id: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          intent: string
          payload?: Json
          telegram_user_id: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          intent?: string
          payload?: Json
          telegram_user_id?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hepy_conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hepy_conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      hepy_owner_bindings: {
        Row: {
          bound_at: string
          id: string
          last_active_at: string | null
          owner_user_id: string
          telegram_user_id: number
          telegram_username: string | null
          tenant_id: string
          unbound_at: string | null
        }
        Insert: {
          bound_at?: string
          id?: string
          last_active_at?: string | null
          owner_user_id: string
          telegram_user_id: number
          telegram_username?: string | null
          tenant_id: string
          unbound_at?: string | null
        }
        Update: {
          bound_at?: string
          id?: string
          last_active_at?: string | null
          owner_user_id?: string
          telegram_user_id?: number
          telegram_username?: string | null
          tenant_id?: string
          unbound_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hepy_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "hepy_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hepy_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          idempotency_key: string
          request_hash: string
          response: Json | null
          status_code: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          request_hash: string
          response?: Json | null
          status_code?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          request_hash?: string
          response?: Json | null
          status_code?: number | null
          tenant_id?: string
        }
        Relationships: []
      }
      integration_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: number
          last_error: string | null
          payload: Json
          provider_key: string
          scheduled_for: string
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: number
          last_error?: string | null
          payload: Json
          provider_key: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: number
          last_error?: string | null
          payload?: Json
          provider_key?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          provider_key: string
          tenant_id: string
          webhook_secret: string
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          provider_key: string
          tenant_id: string
          webhook_secret: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          provider_key?: string
          tenant_id?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          name: string
          notes: string | null
          reorder_quantity: number
          reorder_threshold: number
          supplier_id: string | null
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          notes?: string | null
          reorder_quantity?: number
          reorder_threshold?: number
          supplier_id?: string | null
          tenant_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          notes?: string | null
          reorder_quantity?: number
          reorder_threshold?: number
          supplier_id?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_supplier_tenant_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delta: number
          id: string
          inventory_item_id: string
          metadata: Json
          order_id: string | null
          reason: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delta: number
          id?: string
          inventory_item_id: string
          metadata?: Json
          order_id?: string | null
          reason: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          inventory_item_id?: string
          metadata?: Json
          order_id?: string | null
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_tenant_fkey"
            columns: ["tenant_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      ladder_milestones: {
        Row: {
          awarded_at: string
          bonus_amount_cents: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_via: string | null
          partner_id: string
          perks_text: string | null
          restaurants_count_at_award: number
          status: string
          tier_reached: string
        }
        Insert: {
          awarded_at?: string
          bonus_amount_cents: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_via?: string | null
          partner_id: string
          perks_text?: string | null
          restaurants_count_at_award: number
          status?: string
          tier_reached: string
        }
        Update: {
          awarded_at?: string
          bonus_amount_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_via?: string | null
          partner_id?: string
          perks_text?: string | null
          restaurants_count_at_award?: number
          status?: string
          tier_reached?: string
        }
        Relationships: [
          {
            foreignKeyName: "ladder_milestones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ladder_milestones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      ladder_tiers: {
        Row: {
          bonus_amount_cents: number
          created_at: string
          perks_text: string | null
          rank_order: number
          threshold_count: number
          tier_reached: string
        }
        Insert: {
          bonus_amount_cents: number
          created_at?: string
          perks_text?: string | null
          rank_order: number
          threshold_count: number
          tier_reached: string
        }
        Update: {
          bonus_amount_cents?: number
          created_at?: string
          perks_text?: string | null
          rank_order?: number
          threshold_count?: number
          tier_reached?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          balance_points: number
          created_at: string
          customer_id: string
          id: string
          last_activity_at: string
          lifetime_earned_points: number
          lifetime_redeemed_points: number
          tenant_id: string
        }
        Insert: {
          balance_points?: number
          created_at?: string
          customer_id: string
          id?: string
          last_activity_at?: string
          lifetime_earned_points?: number
          lifetime_redeemed_points?: number
          tenant_id: string
        }
        Update: {
          balance_points?: number
          created_at?: string
          customer_id?: string
          id?: string
          last_activity_at?: string
          lifetime_earned_points?: number
          lifetime_redeemed_points?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          account_id: string
          created_at: string
          customer_id: string
          id: number
          kind: string
          note: string | null
          points: number
          related_order_id: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          customer_id: string
          id?: number
          kind: string
          note?: string | null
          points: number
          related_order_id?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          customer_id?: string
          id?: number
          kind?: string
          note?: string | null
          points?: number
          related_order_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          created_at: string
          expiry_days: number
          is_enabled: boolean
          max_redemption_pct: number
          min_points_to_redeem: number
          points_per_ron: number
          ron_per_point: number
          tenant_id: string
          updated_at: string
          welcome_bonus_points: number
        }
        Insert: {
          created_at?: string
          expiry_days?: number
          is_enabled?: boolean
          max_redemption_pct?: number
          min_points_to_redeem?: number
          points_per_ron?: number
          ron_per_point?: number
          tenant_id: string
          updated_at?: string
          welcome_bonus_points?: number
        }
        Update: {
          created_at?: string
          expiry_days?: number
          is_enabled?: boolean
          max_redemption_pct?: number
          min_points_to_redeem?: number
          points_per_ron?: number
          ron_per_point?: number
          tenant_id?: string
          updated_at?: string
          welcome_bonus_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      magic_link_tokens: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          ip: string | null
          tenant_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          ip?: string | null
          tenant_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          ip?: string | null
          tenant_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "magic_link_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magic_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "magic_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "magic_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "magic_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magic_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_assets: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          file_url: string
          format: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          size_bytes: number | null
          sort_order: number
          thumb_url: string | null
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          file_url: string
          format?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
          size_bytes?: number | null
          sort_order?: number
          thumb_url?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          file_url?: string
          format?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          size_bytes?: number | null
          sort_order?: number
          thumb_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_calculator_leads: {
        Row: {
          aov_lei: number | null
          city: string | null
          comenzi_per_zi: number | null
          created_at: string | null
          estimated_savings_monthly_lei: number | null
          id: string
          phone: string
          restaurant_name: string | null
        }
        Insert: {
          aov_lei?: number | null
          city?: string | null
          comenzi_per_zi?: number | null
          created_at?: string | null
          estimated_savings_monthly_lei?: number | null
          id?: string
          phone: string
          restaurant_name?: string | null
        }
        Update: {
          aov_lei?: number | null
          city?: string | null
          comenzi_per_zi?: number | null
          created_at?: string | null
          estimated_savings_monthly_lei?: number | null
          id?: string
          phone?: string
          restaurant_name?: string | null
        }
        Relationships: []
      }
      marketing_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_ro: string
          cost_usd: number | null
          created_at: string
          cta_ro: string | null
          discarded_at: string | null
          discarded_by: string | null
          hashtags: string | null
          headline_ro: string | null
          id: string
          model: string | null
          platform: string
          post_type: string
          restaurant_id: string
          source_run_id: string | null
          source_signals: Json | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_ro: string
          cost_usd?: number | null
          created_at?: string
          cta_ro?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          hashtags?: string | null
          headline_ro?: string | null
          id?: string
          model?: string | null
          platform?: string
          post_type?: string
          restaurant_id: string
          source_run_id?: string | null
          source_signals?: Json | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_ro?: string
          cost_usd?: number | null
          created_at?: string
          cta_ro?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          hashtags?: string | null
          headline_ro?: string | null
          id?: string
          model?: string | null
          platform?: string
          post_type?: string
          restaurant_id?: string
          source_run_id?: string | null
          source_signals?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_drafts_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          city_id: string | null
          created_at: string
          customer_phone_redacted: string | null
          delivery_window_end: string
          delivery_window_start: string
          dropoff_address: Json
          id: string
          is_financial_record: boolean
          metadata: Json
          package_description: string | null
          package_temperature: string | null
          package_weight_grams: number | null
          pickup_address: Json
          requested_at: string
          status: string
          updated_at: string
          vendor_tenant_id: string
          vertical: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          customer_phone_redacted?: string | null
          delivery_window_end: string
          delivery_window_start: string
          dropoff_address: Json
          id?: string
          is_financial_record?: boolean
          metadata?: Json
          package_description?: string | null
          package_temperature?: string | null
          package_weight_grams?: number | null
          pickup_address: Json
          requested_at?: string
          status?: string
          updated_at?: string
          vendor_tenant_id: string
          vertical?: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          customer_phone_redacted?: string | null
          delivery_window_end?: string
          delivery_window_start?: string
          dropoff_address?: Json
          id?: string
          is_financial_record?: boolean
          metadata?: Json
          package_description?: string | null
          package_temperature?: string | null
          package_weight_grams?: number | null
          pickup_address?: Json
          requested_at?: string
          status?: string
          updated_at?: string
          vendor_tenant_id?: string
          vertical?: string
        }
        Relationships: []
      }
      marketplace_matches: {
        Row: {
          courier_order_id: string | null
          created_at: string
          dispute_reason: string | null
          final_price_cents: number
          fleet_id: string
          hir_fee_cents: number
          id: string
          is_financial_record: boolean
          listing_id: string
          matched_at: string
          offer_id: string
          status: string
          updated_at: string
        }
        Insert: {
          courier_order_id?: string | null
          created_at?: string
          dispute_reason?: string | null
          final_price_cents: number
          fleet_id: string
          hir_fee_cents?: number
          id?: string
          is_financial_record?: boolean
          listing_id: string
          matched_at?: string
          offer_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          courier_order_id?: string | null
          created_at?: string
          dispute_reason?: string | null
          final_price_cents?: number
          fleet_id?: string
          hir_fee_cents?: number
          id?: string
          is_financial_record?: boolean
          listing_id?: string
          matched_at?: string
          offer_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_matches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_matches_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_offers: {
        Row: {
          ai_match_score: number | null
          ai_match_score_at: string | null
          created_at: string
          eta_minutes: number
          expires_at: string
          fleet_id: string
          fleet_rating: number | null
          id: string
          is_financial_record: boolean
          listing_id: string
          notes: string | null
          offered_price_cents: number
          status: string
          updated_at: string
        }
        Insert: {
          ai_match_score?: number | null
          ai_match_score_at?: string | null
          created_at?: string
          eta_minutes: number
          expires_at: string
          fleet_id: string
          fleet_rating?: number | null
          id?: string
          is_financial_record?: boolean
          listing_id: string
          notes?: string | null
          offered_price_cents: number
          status?: string
          updated_at?: string
        }
        Update: {
          ai_match_score?: number | null
          ai_match_score_at?: string | null
          created_at?: string
          eta_minutes?: number
          expires_at?: string
          fleet_id?: string
          fleet_rating?: number | null
          id?: string
          is_financial_record?: boolean
          listing_id?: string
          notes?: string | null
          offered_price_cents?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_access_logs: {
        Row: {
          accessed_at: string
          actor_user_id: string
          entity_id: string
          entity_type: string
          id: number
          ip: unknown
          metadata: Json | null
          purpose: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          actor_user_id: string
          entity_id: string
          entity_type: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          purpose: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          actor_user_id?: string
          entity_id?: string
          entity_type?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          purpose?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      menu_agent_invocations: {
        Row: {
          cost_micro_usd: number | null
          created_at: string
          id: string
          intent: string
          outcome: string
          tenant_id: string
        }
        Insert: {
          cost_micro_usd?: number | null
          created_at?: string
          id?: string
          intent: string
          outcome: string
          tenant_id: string
        }
        Update: {
          cost_micro_usd?: number | null
          created_at?: string
          id?: string
          intent?: string
          outcome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_agent_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_agent_invocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_agent_proposals: {
        Row: {
          agent_run_id: string | null
          channel: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          input_tokens: number | null
          kind: string
          model: string | null
          output_tokens: number | null
          payload: Json
          rationale: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_run_id?: string | null
          channel?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          input_tokens?: number | null
          kind: string
          model?: string | null
          output_tokens?: number | null
          payload: Json
          rationale?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          agent_run_id?: string | null
          channel?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          input_tokens?: number | null
          kind?: string
          model?: string | null
          output_tokens?: number | null
          payload?: Json
          rationale?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_agent_proposals_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_agent_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_agent_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_agent_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_events: {
        Row: {
          at: string
          id: number
          is_available: boolean
          item_id: string
          tenant_id: string
        }
        Insert: {
          at?: string
          id?: number
          is_available: boolean
          item_id: string
          tenant_id: string
        }
        Update: {
          at?: string
          id?: number
          is_available?: boolean
          item_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_recipes: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          menu_item_id: string
          qty_per_serving: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          menu_item_id: string
          qty_per_serving: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          qty_per_serving?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_recipes_inventory_item_tenant_fkey"
            columns: ["tenant_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_item_recipes_menu_item_tenant_fkey"
            columns: ["tenant_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_item_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_item_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_item_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "menu_item_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      migrate_leads: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string
          gloriafood_url: string | null
          id: string
          ip: string | null
          kind: string
          message: string | null
          name: string | null
          phone: string | null
          ref_partner_code: string | null
          restaurants_count: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          gloriafood_url?: string | null
          id?: string
          ip?: string | null
          kind: string
          message?: string | null
          name?: string | null
          phone?: string | null
          ref_partner_code?: string | null
          restaurants_count?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          gloriafood_url?: string | null
          id?: string
          ip?: string | null
          kind?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          ref_partner_code?: string | null
          restaurants_count?: number | null
        }
        Relationships: []
      }
      mv_refresh_log: {
        Row: {
          concurrent: boolean
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: number
          mv_name: string
          mv_schema: string
          row_count_after: number | null
          started_at: string
        }
        Insert: {
          concurrent?: boolean
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          mv_name: string
          mv_schema?: string
          row_count_after?: number | null
          started_at?: string
        }
        Update: {
          concurrent?: boolean
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          mv_name?: string
          mv_schema?: string
          row_count_after?: number | null
          started_at?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirmation_token: string
          consent_at: string | null
          created_at: string
          email: string
          id: string
          metadata: Json
          source: string
          status: string
          tenant_id: string
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          confirmation_token: string
          consent_at?: string | null
          created_at?: string
          email: string
          id?: string
          metadata?: Json
          source?: string
          status?: string
          tenant_id: string
          unsubscribe_token: string
          updated_at?: string
        }
        Update: {
          confirmation_token?: string
          consent_at?: string | null
          created_at?: string
          email?: string
          id?: string
          metadata?: Json
          source?: string
          status?: string
          tenant_id?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          message: string
          metadata: Json
          resolved_at: string | null
          severity: string
          tenant_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          resolved_at?: string | null
          severity: string
          tenant_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ops_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ops_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ops_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string
          channel: string
          courier_order_id: string
          courier_read_at: string | null
          created_at: string
          from_role: string
          from_user_id: string | null
          id: string
          tenant_id: string | null
        }
        Insert: {
          body: string
          channel?: string
          courier_order_id: string
          courier_read_at?: string | null
          created_at?: string
          from_role: string
          from_user_id?: string | null
          id?: string
          tenant_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          courier_order_id?: string
          courier_read_at?: string | null
          created_at?: string
          from_role?: string
          from_user_id?: string | null
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_courier_order_id_fkey"
            columns: ["courier_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_courier_order_id_fkey"
            columns: ["courier_order_id"]
            isOneToOne: false
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "order_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "order_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "order_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_activity_bonuses: {
        Row: {
          amount_cents: number
          awarded_at: string
          bonus_type: string
          context: Json
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_via: string | null
          partner_id: string
          period_end: string | null
          period_start: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          awarded_at?: string
          bonus_type: string
          context?: Json
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_via?: string | null
          partner_id: string
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          awarded_at?: string
          bonus_type?: string
          context?: Json
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_via?: string | null
          partner_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_activity_bonuses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_activity_bonuses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_commissions: {
        Row: {
          amount_cents: number
          commission_type: string
          created_at: string
          id: string
          is_financial_record: boolean
          notes: string | null
          order_count: number
          paid_at: string | null
          paid_via: string | null
          partner_id: string
          pct_applied: number | null
          period_end: string
          period_start: string
          referral_id: string
          source_partner_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          commission_type?: string
          created_at?: string
          id?: string
          is_financial_record?: boolean
          notes?: string | null
          order_count?: number
          paid_at?: string | null
          paid_via?: string | null
          partner_id: string
          pct_applied?: number | null
          period_end: string
          period_start: string
          referral_id: string
          source_partner_id?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          commission_type?: string
          created_at?: string
          id?: string
          is_financial_record?: boolean
          notes?: string | null
          order_count?: number
          paid_at?: string | null
          paid_via?: string | null
          partner_id?: string
          pct_applied?: number | null
          period_end?: string
          period_start?: string
          referral_id?: string
          source_partner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "partner_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          created_at: string
          gross_cents: number
          id: string
          is_financial_record: boolean
          net_cents: number
          notes: string | null
          paid_at: string
          paid_by_user_id: string
          partner_id: string
          period_month: string
          platform_fee_cents: number
          proof_url: string | null
          voided_at: string | null
          voided_by_user_id: string | null
          voided_reason: string | null
        }
        Insert: {
          created_at?: string
          gross_cents: number
          id?: string
          is_financial_record?: boolean
          net_cents: number
          notes?: string | null
          paid_at?: string
          paid_by_user_id: string
          partner_id: string
          period_month: string
          platform_fee_cents?: number
          proof_url?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
          voided_reason?: string | null
        }
        Update: {
          created_at?: string
          gross_cents?: number
          id?: string
          is_financial_record?: boolean
          net_cents?: number
          notes?: string | null
          paid_at?: string
          paid_by_user_id?: string
          partner_id?: string
          period_month?: string
          platform_fee_cents?: number
          proof_url?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_referral_states: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          reason: string | null
          referral_id: string
          state: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          referral_id: string
          state: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          referral_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_referral_states_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "partner_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_referrals: {
        Row: {
          commission_pct: number | null
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          partner_id: string
          referred_at: string
          tenant_id: string
        }
        Insert: {
          commission_pct?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          partner_id: string
          referred_at?: string
          tenant_id: string
        }
        Update: {
          commission_pct?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          partner_id?: string
          referred_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "partner_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "partner_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "partner_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_sponsors: {
        Row: {
          created_at: string
          id: string
          override_pct_recurring: number
          override_pct_y1: number
          sponsor_partner_id: string
          sub_partner_id: string
          sunset_at: string
          total_paid_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          override_pct_recurring?: number
          override_pct_y1?: number
          sponsor_partner_id: string
          sub_partner_id: string
          sunset_at?: string
          total_paid_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          override_pct_recurring?: number
          override_pct_y1?: number
          sponsor_partner_id?: string
          sub_partner_id?: string
          sunset_at?: string
          total_paid_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_sponsors_sponsor_partner_id_fkey"
            columns: ["sponsor_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_sponsors_sponsor_partner_id_fkey"
            columns: ["sponsor_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_sponsors_sub_partner_id_fkey"
            columns: ["sub_partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_sponsors_sub_partner_id_fkey"
            columns: ["sub_partner_id"]
            isOneToOne: true
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_visits: {
        Row: {
          country: string | null
          id: string
          ip_hash: string | null
          partner_id: string
          referer: string | null
          user_agent: string | null
          visited_at: string
        }
        Insert: {
          country?: string | null
          id?: string
          ip_hash?: string | null
          partner_id: string
          referer?: string | null
          user_agent?: string | null
          visited_at?: string
        }
        Update: {
          country?: string | null
          id?: string
          ip_hash?: string | null
          partner_id?: string
          referer?: string | null
          user_agent?: string | null
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          bounty_one_shot_ron: number | null
          cnp_hash: string | null
          code: string | null
          created_at: string
          cui: string | null
          default_commission_pct: number
          email: string
          iban: string | null
          id: string
          kyc_notes: string | null
          kyc_status: string
          kyc_verified_at: string | null
          landing_settings: Json
          min_vendors_threshold: number
          name: string
          notification_settings: Json
          phone: string | null
          public_testimonial_optin: boolean
          slug: string | null
          status: string
          tier: string
          updated_at: string
          user_id: string | null
          wave_joined_at: string | null
          wave_label: string
        }
        Insert: {
          address?: string | null
          bounty_one_shot_ron?: number | null
          cnp_hash?: string | null
          code?: string | null
          created_at?: string
          cui?: string | null
          default_commission_pct?: number
          email: string
          iban?: string | null
          id?: string
          kyc_notes?: string | null
          kyc_status?: string
          kyc_verified_at?: string | null
          landing_settings?: Json
          min_vendors_threshold?: number
          name: string
          notification_settings?: Json
          phone?: string | null
          public_testimonial_optin?: boolean
          slug?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string | null
          wave_joined_at?: string | null
          wave_label?: string
        }
        Update: {
          address?: string | null
          bounty_one_shot_ron?: number | null
          cnp_hash?: string | null
          code?: string | null
          created_at?: string
          cui?: string | null
          default_commission_pct?: number
          email?: string
          iban?: string | null
          id?: string
          kyc_notes?: string | null
          kyc_status?: string
          kyc_verified_at?: string | null
          landing_settings?: Json
          min_vendors_threshold?: number
          name?: string
          notification_settings?: Json
          phone?: string | null
          public_testimonial_optin?: boolean
          slug?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string | null
          wave_joined_at?: string | null
          wave_label?: string
        }
        Relationships: []
      }
      payment_disputes: {
        Row: {
          amount_bani: number | null
          created_at: string
          evidence_due_by: string | null
          id: string
          order_id: string | null
          raw_payload: Json | null
          reason: string | null
          status: string | null
          stripe_dispute_id: string | null
          updated_at: string
        }
        Insert: {
          amount_bani?: number | null
          created_at?: string
          evidence_due_by?: string | null
          id?: string
          order_id?: string | null
          raw_payload?: Json | null
          reason?: string | null
          status?: string | null
          stripe_dispute_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_bani?: number | null
          created_at?: string
          evidence_due_by?: string | null
          id?: string
          order_id?: string | null
          raw_payload?: Json | null
          reason?: string | null
          status?: string | null
          stripe_dispute_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount_cents: number
          delivery_id: string | null
          delivery_pricing_id: string | null
          formula_snapshot: Json
          id: string
          is_financial_record: boolean
          payout_period_id: string
          source: string | null
        }
        Insert: {
          amount_cents: number
          delivery_id?: string | null
          delivery_pricing_id?: string | null
          formula_snapshot: Json
          id?: string
          is_financial_record?: boolean
          payout_period_id: string
          source?: string | null
        }
        Update: {
          amount_cents?: number
          delivery_id?: string | null
          delivery_pricing_id?: string | null
          formula_snapshot?: Json
          id?: string
          is_financial_record?: boolean
          payout_period_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "courier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "courier_orders_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_delivery_pricing_id_fkey"
            columns: ["delivery_pricing_id"]
            isOneToOne: false
            referencedRelation: "delivery_pricings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_period_id_fkey"
            columns: ["payout_period_id"]
            isOneToOne: false
            referencedRelation: "payout_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_periods: {
        Row: {
          city_id: string
          courier_user_id: string
          created_at: string
          deliveries_count: number
          id: string
          is_financial_record: boolean
          paid_at: string | null
          paid_method: string | null
          payment_ref: string | null
          period_end: string
          period_start: string
          status: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          city_id: string
          courier_user_id: string
          created_at?: string
          deliveries_count?: number
          id?: string
          is_financial_record?: boolean
          paid_at?: string | null
          paid_method?: string | null
          payment_ref?: string | null
          period_end: string
          period_start: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          city_id?: string
          courier_user_id?: string
          created_at?: string
          deliveries_count?: number
          id?: string
          is_financial_record?: boolean
          paid_at?: string | null
          paid_method?: string | null
          payment_ref?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_periods_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_periods_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      pending_confirmations: {
        Row: {
          args: Json
          chat_id: number
          command: string
          confirm_code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          outcome: string | null
        }
        Insert: {
          args?: Json
          chat_id: number
          command: string
          confirm_code: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          outcome?: string | null
        }
        Update: {
          args?: Json
          chat_id?: number
          command?: string
          confirm_code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          outcome?: string | null
        }
        Relationships: []
      }
      pharma_courier_links: {
        Row: {
          created_at: string
          id: string
          pharma_user_id: string
          supabase_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pharma_user_id: string
          supabase_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pharma_user_id?: string
          supabase_user_id?: string
        }
        Relationships: []
      }
      pharma_webhook_secrets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          rotated_at: string | null
          secret: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rotated_at?: string | null
          secret: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rotated_at?: string | null
          secret?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_order_events: {
        Row: {
          actor_role: string
          canonical_order_id: string
          courier_order_id: string | null
          courier_user_id: string | null
          event_id: string
          event_type: string
          fleet_id: string | null
          native_order_id: string | null
          occurred_at: string
          payload: Json
          reason_code: string | null
          recorded_at: string
          source_system: string
          status: string | null
          vertical: string | null
          zone_id: string | null
        }
        Insert: {
          actor_role?: string
          canonical_order_id: string
          courier_order_id?: string | null
          courier_user_id?: string | null
          event_id?: string
          event_type: string
          fleet_id?: string | null
          native_order_id?: string | null
          occurred_at: string
          payload?: Json
          reason_code?: string | null
          recorded_at?: string
          source_system: string
          status?: string | null
          vertical?: string | null
          zone_id?: string | null
        }
        Update: {
          actor_role?: string
          canonical_order_id?: string
          courier_order_id?: string | null
          courier_user_id?: string | null
          event_id?: string
          event_type?: string
          fleet_id?: string | null
          native_order_id?: string | null
          occurred_at?: string
          payload?: Json
          reason_code?: string | null
          recorded_at?: string
          source_system?: string
          status?: string | null
          vertical?: string | null
          zone_id?: string | null
        }
        Relationships: []
      }
      pricing_zones: {
        Row: {
          active: boolean
          city_id: string
          courier_payout_cents: number
          created_at: string
          geometry: Json | null
          id: string
          localities: string[]
          max_distance_km: number | null
          name: string
          restaurant_fee_cents: number
          updated_at: string
          zone_type: string
        }
        Insert: {
          active?: boolean
          city_id: string
          courier_payout_cents: number
          created_at?: string
          geometry?: Json | null
          id?: string
          localities?: string[]
          max_distance_km?: number | null
          name: string
          restaurant_fee_cents: number
          updated_at?: string
          zone_type: string
        }
        Update: {
          active?: boolean
          city_id?: string
          courier_payout_cents?: number
          created_at?: string
          geometry?: Json | null
          id?: string
          localities?: string[]
          max_distance_km?: number | null
          name?: string
          restaurant_fee_cents?: number
          updated_at?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          customer_email: string | null
          id: string
          is_active: boolean
          kind: string
          max_uses: number | null
          min_order_ron: number
          source_run_id: string | null
          tenant_id: string
          usage_limit: number | null
          used_count: number
          valid_from: string | null
          valid_until: string | null
          value_int: number
        }
        Insert: {
          code: string
          created_at?: string
          customer_email?: string | null
          id?: string
          is_active?: boolean
          kind: string
          max_uses?: number | null
          min_order_ron?: number
          source_run_id?: string | null
          tenant_id: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value_int?: number
        }
        Update: {
          code?: string
          created_at?: string
          customer_email?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_uses?: number | null
          min_order_ron?: number
          source_run_id?: string | null
          tenant_id?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value_int?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          customer_id: string | null
          id: string
          order_id: string
          promo_code_id: string
          redeemed_at: string
          source_run_id: string | null
        }
        Insert: {
          customer_id?: string | null
          id?: string
          order_id: string
          promo_code_id: string
          redeemed_at?: string
          source_run_id?: string | null
        }
        Update: {
          customer_id?: string | null
          id?: string
          order_id?: string
          promo_code_id?: string
          redeemed_at?: string
          source_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "copilot_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      psp_credentials: {
        Row: {
          active: boolean
          api_key_vault_name: string | null
          created_at: string
          id: string
          live: boolean
          metadata: Json
          mode: string
          provider: string
          signature: string | null
          sub_merchant_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key_vault_name?: string | null
          created_at?: string
          id?: string
          live?: boolean
          metadata?: Json
          mode: string
          provider: string
          signature?: string | null
          sub_merchant_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key_vault_name?: string | null
          created_at?: string
          id?: string
          live?: boolean
          metadata?: Json
          mode?: string
          provider?: string
          signature?: string | null
          sub_merchant_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psp_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psp_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      psp_payments: {
        Row: {
          amount_bani: number
          created_at: string
          currency: string
          hir_fee_bani: number | null
          id: string
          is_financial_record: boolean
          mode: string
          order_id: string | null
          provider: string
          provider_ref: string | null
          raw_request: Json | null
          raw_response: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_bani: number
          created_at?: string
          currency?: string
          hir_fee_bani?: number | null
          id?: string
          is_financial_record?: boolean
          mode: string
          order_id?: string | null
          provider: string
          provider_ref?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_bani?: number
          created_at?: string
          currency?: string
          hir_fee_bani?: number | null
          id?: string
          is_financial_record?: boolean
          mode?: string
          order_id?: string | null
          provider?: string
          provider_ref?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psp_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psp_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "psp_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "psp_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psp_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      psp_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          payment_id: string | null
          processed_at: string
          provider: string
          raw_payload: Json
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          payment_id?: string | null
          processed_at?: string
          provider: string
          raw_payload: Json
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          payment_id?: string | null
          processed_at?: string
          provider?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "psp_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "psp_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_incident_status_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          incident_id: string
          note: string | null
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          incident_id: string
          note?: string | null
          status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          incident_id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_incident_status_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      public_incidents: {
        Row: {
          affected_services: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          postmortem_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          started_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_services?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          postmortem_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          started_at?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_services?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          postmortem_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          items: Json
          notes: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_tenant_fkey"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_leads: {
        Row: {
          closed_at: string | null
          closed_tenant_id: string | null
          contact_hash: string
          created_at: string
          expected_close_at: string | null
          extended: boolean
          id: string
          locked_at: string
          notes: string | null
          partner_id: string
          restaurant_name: string
          status: string
          unlocks_at: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_tenant_id?: string | null
          contact_hash: string
          created_at?: string
          expected_close_at?: string | null
          extended?: boolean
          id?: string
          locked_at?: string
          notes?: string | null
          partner_id: string
          restaurant_name: string
          status?: string
          unlocks_at: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_tenant_id?: string | null
          contact_hash?: string
          created_at?: string
          expected_close_at?: string | null
          extended?: boolean
          id?: string
          locked_at?: string
          notes?: string | null
          partner_id?: string
          restaurant_name?: string
          status?: string
          unlocks_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_leads_closed_tenant_id_fkey"
            columns: ["closed_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reseller_leads_closed_tenant_id_fkey"
            columns: ["closed_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reseller_leads_closed_tenant_id_fkey"
            columns: ["closed_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reseller_leads_closed_tenant_id_fkey"
            columns: ["closed_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_leads_closed_tenant_id_fkey"
            columns: ["closed_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_kpis"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      reservation_settings: {
        Row: {
          advance_max_days: number
          advance_min_minutes: number
          capacity_per_slot: number
          created_at: string
          is_enabled: boolean
          notify_email: string | null
          party_size_max: number
          show_table_plan_to_customers: boolean
          slot_duration_min: number
          table_plan: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          advance_max_days?: number
          advance_min_minutes?: number
          capacity_per_slot?: number
          created_at?: string
          is_enabled?: boolean
          notify_email?: string | null
          party_size_max?: number
          show_table_plan_to_customers?: boolean
          slot_duration_min?: number
          table_plan?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          advance_max_days?: number
          advance_min_minutes?: number
          capacity_per_slot?: number
          created_at?: string
          is_enabled?: boolean
          notify_email?: string | null
          party_size_max?: number
          show_table_plan_to_customers?: boolean
          slot_duration_min?: number
          table_plan?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_first_name: string
          customer_id: string | null
          customer_phone: string
          id: string
          notes: string | null
          party_size: number
          public_track_token: string
          rejection_reason: string | null
          requested_at: string
          status: string
          table_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_first_name: string
          customer_id?: string | null
          customer_phone: string
          id?: string
          notes?: string | null
          party_size: number
          public_track_token?: string
          rejection_reason?: string | null
          requested_at: string
          status?: string
          table_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_first_name?: string
          customer_id?: string | null
          customer_phone?: string
          id?: string
          notes?: string | null
          party_size?: number
          public_track_token?: string
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          table_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_brands: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          tagline: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number
          tagline?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          tagline?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          menu_brand_id: string | null
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_brand_id?: string | null
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_brand_id?: string | null
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_categories_menu_brand_id_fkey"
            columns: ["menu_brand_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_items: {
        Row: {
          allergens: string[]
          category_id: string
          created_at: string
          description: string | null
          external_id: string | null
          external_source: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          prep_minutes: number | null
          price_ron: number
          serving_size_grams: number | null
          serving_size_label: string | null
          sold_out_until: string | null
          sort_order: number
          tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allergens?: string[]
          category_id: string
          created_at?: string
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          prep_minutes?: number | null
          price_ron: number
          serving_size_grams?: number | null
          serving_size_label?: string | null
          sold_out_until?: string | null
          sort_order?: number
          tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allergens?: string[]
          category_id?: string
          created_at?: string
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          prep_minutes?: number | null
          price_ron?: number
          serving_size_grams?: number | null
          serving_size_label?: string | null
          sold_out_until?: string | null
          sort_order?: number
          tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_modifier_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          item_id: string
          name: string
          select_max: number | null
          select_min: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          item_id: string
          name: string
          select_max?: number | null
          select_min?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          item_id?: string
          name?: string
          select_max?: number | null
          select_min?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_modifiers: {
        Row: {
          group_id: string | null
          id: string
          item_id: string
          name: string
          price_delta_ron: number
          sort_order: number
        }
        Insert: {
          group_id?: string | null
          id?: string
          item_id: string
          name: string
          price_delta_ron?: number
          sort_order?: number
        }
        Update: {
          group_id?: string | null
          id?: string
          item_id?: string
          name?: string
          price_delta_ron?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_modifiers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          courier_user_id: string | null
          created_at: string
          customer_id: string | null
          delivery_address_id: string | null
          delivery_fee_ron: number
          delivery_tier_id: string | null
          delivery_zone_id: string | null
          discount_ron: number
          disputed: boolean
          hir_delivery_id: string | null
          id: string
          is_financial_record: boolean
          is_pre_order: boolean
          items: Json
          notes: string | null
          payment_method: string
          payment_status: string
          prep_time_minutes: number | null
          promo_code_id: string | null
          public_track_token: string
          ready_at: string | null
          refund_amount_bani: number | null
          refund_reason: string | null
          refunded_at: string | null
          review_reminder_sent_at: string | null
          scheduled_for: string | null
          scheduled_pickup_at: string | null
          source: Database["public"]["Enums"]["order_source"]
          status: string
          stripe_payment_intent_id: string | null
          subtotal_ron: number
          tenant_id: string
          total_ron: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          courier_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_address_id?: string | null
          delivery_fee_ron?: number
          delivery_tier_id?: string | null
          delivery_zone_id?: string | null
          discount_ron?: number
          disputed?: boolean
          hir_delivery_id?: string | null
          id?: string
          is_financial_record?: boolean
          is_pre_order?: boolean
          items: Json
          notes?: string | null
          payment_method?: string
          payment_status?: string
          prep_time_minutes?: number | null
          promo_code_id?: string | null
          public_track_token?: string
          ready_at?: string | null
          refund_amount_bani?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          review_reminder_sent_at?: string | null
          scheduled_for?: string | null
          scheduled_pickup_at?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_ron: number
          tenant_id: string
          total_ron: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          courier_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_address_id?: string | null
          delivery_fee_ron?: number
          delivery_tier_id?: string | null
          delivery_zone_id?: string | null
          discount_ron?: number
          disputed?: boolean
          hir_delivery_id?: string | null
          id?: string
          is_financial_record?: boolean
          is_pre_order?: boolean
          items?: Json
          notes?: string | null
          payment_method?: string
          payment_status?: string
          prep_time_minutes?: number | null
          promo_code_id?: string | null
          public_track_token?: string
          ready_at?: string | null
          refund_amount_bani?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          review_reminder_sent_at?: string | null
          scheduled_for?: string | null
          scheduled_pickup_at?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_ron?: number
          tenant_id?: string
          total_ron?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_delivery_tier_id_fkey"
            columns: ["delivery_tier_id"]
            isOneToOne: false
            referencedRelation: "delivery_pricing_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_reviews: {
        Row: {
          comment: string | null
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          order_id: string
          rating: number
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          order_id: string
          rating: number
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          order_id?: string
          rating?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_events: {
        Row: {
          app: string | null
          created_at: string
          dedup_key: string | null
          environment: string | null
          event_count: number | null
          id: string
          issue_level: string | null
          issue_title: string | null
          issue_url: string | null
          notified_telegram: boolean
          project_slug: string | null
          raw_payload: Json | null
          release: string | null
          rule_id: string | null
          rule_name: string | null
          sentry_event_id: string | null
          sentry_issue_id: string | null
          severity: string
          summary: string | null
          user_count: number | null
        }
        Insert: {
          app?: string | null
          created_at?: string
          dedup_key?: string | null
          environment?: string | null
          event_count?: number | null
          id?: string
          issue_level?: string | null
          issue_title?: string | null
          issue_url?: string | null
          notified_telegram?: boolean
          project_slug?: string | null
          raw_payload?: Json | null
          release?: string | null
          rule_id?: string | null
          rule_name?: string | null
          sentry_event_id?: string | null
          sentry_issue_id?: string | null
          severity: string
          summary?: string | null
          user_count?: number | null
        }
        Update: {
          app?: string | null
          created_at?: string
          dedup_key?: string | null
          environment?: string | null
          event_count?: number | null
          id?: string
          issue_level?: string | null
          issue_title?: string | null
          issue_url?: string | null
          notified_telegram?: boolean
          project_slug?: string | null
          raw_payload?: Json | null
          release?: string | null
          rule_id?: string | null
          rule_name?: string | null
          sentry_event_id?: string | null
          sentry_issue_id?: string | null
          severity?: string
          summary?: string | null
          user_count?: number | null
        }
        Relationships: []
      }
      smartbill_invoice_jobs: {
        Row: {
          attempts: number
          created_at: string
          error_text: string | null
          id: string
          is_financial_record: boolean
          order_id: string
          smartbill_invoice_id: string | null
          smartbill_invoice_number: string | null
          smartbill_invoice_series: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_text?: string | null
          id?: string
          is_financial_record?: boolean
          order_id: string
          smartbill_invoice_id?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_text?: string | null
          id?: string
          is_financial_record?: boolean
          order_id?: string
          smartbill_invoice_id?: string | null
          smartbill_invoice_number?: string | null
          smartbill_invoice_series?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smartbill_invoice_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_copilot_attributed_revenue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartbill_invoice_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_notify_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          ip: string | null
          source: string | null
          tenant_slug: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          source?: string | null
          tenant_slug?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          source?: string | null
          tenant_slug?: string | null
        }
        Relationships: []
      }
      stripe_events_processed: {
        Row: {
          event_type: string
          id: string
          payment_intent_id: string | null
          processed_at: string
        }
        Insert: {
          event_type: string
          id: string
          payment_intent_id?: string | null
          processed_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          payment_intent_id?: string | null
          processed_at?: string
        }
        Relationships: []
      }
      stripe_onboarding_requests: {
        Row: {
          business_name: string
          created_at: string | null
          id: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string | null
          vat_number: string | null
        }
        Insert: {
          business_name: string
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string | null
          vat_number?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          features: Json
          id: string
          max_listings_per_month: number | null
          max_offers_per_month: number | null
          monthly_price_ron: number
          tier_code: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          features?: Json
          id?: string
          max_listings_per_month?: number | null
          max_offers_per_month?: number | null
          monthly_price_ron: number
          tier_code: string
        }
        Update: {
          active?: boolean
          created_at?: string
          features?: Json
          id?: string
          max_listings_per_month?: number | null
          max_offers_per_month?: number | null
          monthly_price_ron?: number
          tier_code?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          admin_note: string | null
          auth_user_id: string | null
          category: string | null
          created_at: string
          email: string | null
          id: string
          ip: string | null
          message: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          admin_note?: string | null
          auth_user_id?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          admin_note?: string | null
          auth_user_id?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      support_replies: {
        Row: {
          delivery_error: string | null
          delivery_status: string
          id: string
          message_id: string
          reply_html: string | null
          reply_text: string
          resend_id: string | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          delivery_error?: string | null
          delivery_status?: string
          id?: string
          message_id: string
          reply_html?: string | null
          reply_text: string
          resend_id?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          delivery_error?: string | null
          delivery_status?: string
          id?: string
          message_id?: string
          reply_html?: string | null
          reply_text?: string
          resend_id?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_agent_trust: {
        Row: {
          action_category: string
          agent_name: string
          approval_count: number
          created_at: string
          id: string
          is_destructive: boolean
          last_recalibrated_at: string | null
          rejection_count: number
          restaurant_id: string
          trust_level: string
        }
        Insert: {
          action_category: string
          agent_name: string
          approval_count?: number
          created_at?: string
          id?: string
          is_destructive?: boolean
          last_recalibrated_at?: string | null
          rejection_count?: number
          restaurant_id: string
          trust_level?: string
        }
        Update: {
          action_category?: string
          agent_name?: string
          approval_count?: number
          created_at?: string
          id?: string
          is_destructive?: boolean
          last_recalibrated_at?: string | null
          rejection_count?: number
          restaurant_id?: string
          trust_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_agent_trust_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_agent_trust_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_agent_trust_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_agent_trust_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_agent_trust_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_display_pins: {
        Row: {
          active: boolean
          created_at: string
          label: string | null
          last_used_at: string | null
          pin_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          label?: string | null
          last_used_at?: string | null
          pin_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          label?: string | null
          last_used_at?: string | null
          pin_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_display_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_display_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_display_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_display_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_display_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          can_manage_fleet: boolean
          can_manage_zones: boolean
          created_at: string
          fm_phone: string | null
          id: string
          note_from_fleet: string | null
          note_from_fleet_updated_at: string | null
          note_from_owner: string | null
          note_from_owner_updated_at: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          can_manage_fleet?: boolean
          can_manage_zones?: boolean
          created_at?: string
          fm_phone?: string | null
          id?: string
          note_from_fleet?: string | null
          note_from_fleet_updated_at?: string | null
          note_from_owner?: string | null
          note_from_owner_updated_at?: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          can_manage_fleet?: boolean
          can_manage_zones?: boolean
          created_at?: string
          fm_phone?: string | null
          id?: string
          note_from_fleet?: string | null
          note_from_fleet_updated_at?: string | null
          note_from_owner?: string | null
          note_from_owner_updated_at?: string | null
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_drafts: {
        Row: {
          created_at: string
          data: Json
          id: string
          step: number
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          step?: number
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          step?: number
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_onboarding_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_onboarding_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_onboarding_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pricing_overrides: {
        Row: {
          courier_payout_cents: number
          created_at: string
          created_by: string
          id: string
          reason: string
          restaurant_fee_cents: number
          tenant_id: string
          valid_from: string
          valid_until: string | null
          zone_id: string
        }
        Insert: {
          courier_payout_cents: number
          created_at?: string
          created_by: string
          id?: string
          reason: string
          restaurant_fee_cents: number
          tenant_id: string
          valid_from?: string
          valid_until?: string | null
          zone_id: string
        }
        Update: {
          courier_payout_cents?: number
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          restaurant_fee_cents?: number
          tenant_id?: string
          valid_from?: string
          valid_until?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_pricing_overrides_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "pricing_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          active_until: string
          created_at: string
          id: string
          is_financial_record: boolean
          last_payment_at: string | null
          payment_status: string | null
          plan_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          active_until: string
          created_at?: string
          id?: string
          is_financial_record?: boolean
          last_payment_at?: string | null
          payment_status?: string | null
          plan_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          active_until?: string
          created_at?: string
          id?: string
          is_financial_record?: boolean
          last_payment_at?: string | null
          payment_status?: string | null
          plan_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage_counters: {
        Row: {
          cap_count: number
          created_at: string
          id: string
          last_reset_at: string | null
          period_kind: string
          period_start: string
          resource_kind: string
          tenant_id: string
          updated_at: string
          used_count: number
        }
        Insert: {
          cap_count: number
          created_at?: string
          id?: string
          last_reset_at?: string | null
          period_kind: string
          period_start: string
          resource_kind: string
          tenant_id: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          cap_count?: number
          created_at?: string
          id?: string
          last_reset_at?: string | null
          period_kind?: string
          period_start?: string
          resource_kind?: string
          tenant_id?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_zone_pauses: {
        Row: {
          id: string
          notes: string | null
          paused_at: string
          paused_by: string
          paused_until: string | null
          paused_via: string
          reason: string
          resumed_at: string | null
          resumed_by: string | null
          resumed_via: string | null
          tenant_id: string
          zone_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          paused_at?: string
          paused_by: string
          paused_until?: string | null
          paused_via: string
          reason: string
          resumed_at?: string | null
          resumed_by?: string | null
          resumed_via?: string | null
          tenant_id: string
          zone_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          paused_at?: string
          paused_by?: string
          paused_until?: string | null
          paused_via?: string
          reason?: string
          resumed_at?: string | null
          resumed_by?: string | null
          resumed_via?: string | null
          tenant_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          champion_code: string | null
          city_id: string | null
          country_code: string
          created_at: string
          currency_code: string
          custom_domain: string | null
          delivery_mode: Database["public"]["Enums"]["tenant_delivery_mode"]
          dispatch_mode: Database["public"]["Enums"]["dispatch_mode_enum"]
          domain_status: string
          domain_verified_at: string | null
          external_dispatch_enabled: boolean
          external_dispatch_secret: string | null
          external_dispatch_webhook_url: string | null
          feature_flags: Json
          id: string
          integration_mode: Database["public"]["Enums"]["integration_mode"]
          name: string
          parent_brand_id: string | null
          powered_by_hir_badge: boolean
          referral_code: string | null
          settings: Json
          slug: string
          status: string
          template_slug: string | null
          tenant_kind: string
          updated_at: string
          vertical: string
        }
        Insert: {
          champion_code?: string | null
          city_id?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          custom_domain?: string | null
          delivery_mode?: Database["public"]["Enums"]["tenant_delivery_mode"]
          dispatch_mode?: Database["public"]["Enums"]["dispatch_mode_enum"]
          domain_status?: string
          domain_verified_at?: string | null
          external_dispatch_enabled?: boolean
          external_dispatch_secret?: string | null
          external_dispatch_webhook_url?: string | null
          feature_flags?: Json
          id?: string
          integration_mode?: Database["public"]["Enums"]["integration_mode"]
          name: string
          parent_brand_id?: string | null
          powered_by_hir_badge?: boolean
          referral_code?: string | null
          settings?: Json
          slug: string
          status?: string
          template_slug?: string | null
          tenant_kind?: string
          updated_at?: string
          vertical?: string
        }
        Update: {
          champion_code?: string | null
          city_id?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          custom_domain?: string | null
          delivery_mode?: Database["public"]["Enums"]["tenant_delivery_mode"]
          dispatch_mode?: Database["public"]["Enums"]["dispatch_mode_enum"]
          domain_status?: string
          domain_verified_at?: string | null
          external_dispatch_enabled?: boolean
          external_dispatch_secret?: string | null
          external_dispatch_webhook_url?: string | null
          feature_flags?: Json
          id?: string
          integration_mode?: Database["public"]["Enums"]["integration_mode"]
          name?: string
          parent_brand_id?: string | null
          powered_by_hir_badge?: boolean
          referral_code?: string | null
          settings?: Json
          slug?: string
          status?: string
          template_slug?: string | null
          tenant_kind?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "tenants_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenants_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenants_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenants_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_nps_ratings: {
        Row: {
          comment: string | null
          created_at: string
          flagged_at: string | null
          flagged_cluster: boolean
          flagged_reason: string | null
          fleet_id: string
          id: string
          listing_id: string | null
          match_id: string | null
          random_sampled: boolean
          rater_device_hash: string | null
          rater_ip_hash: string | null
          score: number
          vendor_tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          flagged_at?: string | null
          flagged_cluster?: boolean
          flagged_reason?: string | null
          fleet_id: string
          id?: string
          listing_id?: string | null
          match_id?: string | null
          random_sampled?: boolean
          rater_device_hash?: string | null
          rater_ip_hash?: string | null
          score: number
          vendor_tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          flagged_at?: string | null
          flagged_cluster?: boolean
          flagged_reason?: string | null
          fleet_id?: string
          id?: string
          listing_id?: string | null
          match_id?: string | null
          random_sampled?: boolean
          rater_device_hash?: string | null
          rater_ip_hash?: string | null
          score?: number
          vendor_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_nps_ratings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nps_ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "marketplace_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          created_at: string
          duration_seconds: number | null
          from_number: string | null
          id: string
          intent: string | null
          metadata: Json | null
          response: string | null
          status: string
          tenant_id: string
          to_number: string | null
          transcript: string | null
          twilio_call_sid: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          from_number?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          response?: string | null
          status?: string
          tenant_id: string
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          from_number?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          response?: string | null
          status?: string
          tenant_id?: string
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      wave_bonuses: {
        Row: {
          created_at: string
          description: string | null
          direct_pct_recurring_bonus: number
          direct_pct_y1_bonus: number
          override_pct_recurring_bonus: number
          override_pct_y1_bonus: number
          slot_cap: number
          wave_label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          direct_pct_recurring_bonus?: number
          direct_pct_y1_bonus?: number
          override_pct_recurring_bonus?: number
          override_pct_y1_bonus?: number
          slot_cap: number
          wave_label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          direct_pct_recurring_bonus?: number
          direct_pct_y1_bonus?: number
          override_pct_recurring_bonus?: number
          override_pct_y1_bonus?: number
          slot_cap?: number
          wave_label?: string
        }
        Relationships: []
      }
      weather_snapshots: {
        Row: {
          city_id: string
          created_at: string
          feels_like_c: number | null
          humidity_pct: number | null
          id: string
          precipitation_1h_mm: number | null
          raw_payload: Json | null
          snapshot_at: string
          temp_c: number | null
          weather_code: number | null
          weather_desc: string | null
          weather_main: string | null
          wind_speed_ms: number | null
        }
        Insert: {
          city_id: string
          created_at?: string
          feels_like_c?: number | null
          humidity_pct?: number | null
          id?: string
          precipitation_1h_mm?: number | null
          raw_payload?: Json | null
          snapshot_at?: string
          temp_c?: number | null
          weather_code?: number | null
          weather_desc?: string | null
          weather_main?: string | null
          wind_speed_ms?: number | null
        }
        Update: {
          city_id?: string
          created_at?: string
          feels_like_c?: number | null
          humidity_pct?: number | null
          id?: string
          precipitation_1h_mm?: number | null
          raw_payload?: Json | null
          snapshot_at?: string
          temp_c?: number | null
          weather_code?: number | null
          weather_desc?: string | null
          weather_main?: string | null
          wind_speed_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_snapshots_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      whatsapp_connect_nonces: {
        Row: {
          consumed_at: string | null
          consumed_by_wa: string | null
          created_at: string
          nonce: string
          owner_user_id: string
          tenant_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_wa?: string | null
          created_at?: string
          nonce: string
          owner_user_id: string
          tenant_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by_wa?: string | null
          created_at?: string
          nonce?: string
          owner_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connect_nonces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          binding_id: string | null
          body: string | null
          direction: string
          error_text: string | null
          id: string
          intent: string | null
          message_type: string
          raw_payload: Json | null
          sent_at: string
          tenant_id: string | null
          wa_message_id: string | null
          wa_phone_number: string
        }
        Insert: {
          binding_id?: string | null
          body?: string | null
          direction: string
          error_text?: string | null
          id?: string
          intent?: string | null
          message_type: string
          raw_payload?: Json | null
          sent_at?: string
          tenant_id?: string | null
          wa_message_id?: string | null
          wa_phone_number: string
        }
        Update: {
          binding_id?: string | null
          body?: string | null
          direction?: string
          error_text?: string | null
          id?: string
          intent?: string | null
          message_type?: string
          raw_payload?: Json | null
          sent_at?: string
          tenant_id?: string | null
          wa_message_id?: string | null
          wa_phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_owner_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_owner_bindings: {
        Row: {
          bound_at: string
          id: string
          last_active_at: string | null
          owner_user_id: string
          tenant_id: string
          unbound_at: string | null
          wa_display_name: string | null
          wa_phone_number: string
        }
        Insert: {
          bound_at?: string
          id?: string
          last_active_at?: string | null
          owner_user_id: string
          tenant_id: string
          unbound_at?: string | null
          wa_display_name?: string | null
          wa_phone_number: string
        }
        Update: {
          bound_at?: string
          id?: string
          last_active_at?: string | null
          owner_user_id?: string
          tenant_id?: string
          unbound_at?: string | null
          wa_display_name?: string | null
          wa_phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "whatsapp_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_owner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      courier_orders_feed: {
        Row: {
          assigned_courier_user_id: string | null
          created_at: string | null
          customer_first_name: string | null
          customer_phone: string | null
          delivered_proof_taken_at: string | null
          delivered_proof_url: string | null
          delivery_fee_ron: number | null
          dropoff_lat: number | null
          dropoff_line1: string | null
          dropoff_lng: number | null
          fleet_brand_color: string | null
          fleet_id: string | null
          fleet_name: string | null
          fleet_slug: string | null
          fleet_tier: string | null
          id: string | null
          items: Json | null
          last_webhook_attempt_at: string | null
          last_webhook_status: string | null
          payment_method: string | null
          pickup_lat: number | null
          pickup_line1: string | null
          pickup_lng: number | null
          public_track_token: string | null
          source_order_id: string | null
          source_tenant_id: string | null
          source_type: string | null
          status: string | null
          total_ron: number | null
          updated_at: string | null
          vertical: string | null
          webhook_callback_url: string | null
          webhook_failure_count: number | null
          webhook_secret: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_orders_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "courier_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_orders_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_rating_summary: {
        Row: {
          avg_stars: number | null
          cold_chain_ok_count: number | null
          courier_user_id: string | null
          left_without_call_count: number | null
          ratings_count: number | null
        }
        Relationships: []
      }
      live_ops_telemetry: {
        Row: {
          city_id: string | null
          delivered_24h: number | null
          delivery_mode:
            | Database["public"]["Enums"]["tenant_delivery_mode"]
            | null
          dispatched_unpicked_over_5m: number | null
          in_courier_flow: number | null
          kitchen_overdue_over_15m: number | null
          kitchen_queue: number | null
          last_order_at: string | null
          revenue_24h_ron: number | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      mv_growth_tenant_metrics_30d: {
        Row: {
          active_zones: number | null
          aov_30d: number | null
          avg_delivery_fee: number | null
          avg_rating_30d: number | null
          cancels_30d: number | null
          cuisine_types: Json | null
          low_ratings_30d: number | null
          menu_item_count: number | null
          menu_items_available: number | null
          menu_items_no_image: number | null
          orders_30d: number | null
          orders_growth_pct: number | null
          peak_hour: number | null
          prior_orders_30d: number | null
          prior_revenue_30d: number | null
          repeat_customers_30d: number | null
          revenue_30d: number | null
          revenue_growth_pct: number | null
          reviews_count_30d: number | null
          snapshot_at: string | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_slug: string | null
          tenant_status: string | null
          tenant_vertical: string | null
          top_items: Json | null
          unique_customers_30d: number | null
        }
        Relationships: []
      }
      restaurant_review_summary: {
        Row: {
          average_rating: number | null
          review_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_brand_family: {
        Row: {
          brand_root_id: string | null
          city_id: string | null
          created_at: string | null
          delivery_mode:
            | Database["public"]["Enums"]["tenant_delivery_mode"]
            | null
          name: string | null
          role_in_brand: string | null
          slug: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          brand_root_id?: never
          city_id?: string | null
          created_at?: string | null
          delivery_mode?:
            | Database["public"]["Enums"]["tenant_delivery_mode"]
            | null
          name?: string | null
          role_in_brand?: never
          slug?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          brand_root_id?: never
          city_id?: string | null
          created_at?: string | null
          delivery_mode?:
            | Database["public"]["Enums"]["tenant_delivery_mode"]
            | null
          name?: string | null
          role_in_brand?: never
          slug?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      tenant_zone_active_pauses: {
        Row: {
          id: string | null
          notes: string | null
          paused_at: string | null
          paused_by: string | null
          paused_until: string | null
          paused_via: string | null
          reason: string | null
          tenant_id: string | null
          zone_id: string | null
          zone_is_active: boolean | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_zone_pauses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      v_city_delivery_rollup: {
        Row: {
          city_id: string | null
          county: string | null
          is_active: boolean | null
          name: string | null
          orders_30d: number | null
          orders_in_progress: number | null
          orders_total: number | null
          slug: string | null
          sort_order: number | null
          vendor_count: number | null
        }
        Relationships: []
      }
      v_copilot_attributed_revenue: {
        Row: {
          order_id: string | null
          order_total_ron: number | null
          promo_code: string | null
          promo_kind: string | null
          promo_value: number | null
          redeemed_at: string | null
          restaurant_id: string | null
          source_run_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_copilot_revenue_by_run: {
        Row: {
          first_redemption: string | null
          last_redemption: string | null
          redemption_count: number | null
          restaurant_id: string | null
          source_run_id: string | null
          total_revenue_ron: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_courier_kpi_7d: {
        Row: {
          avg_rating_7d: number | null
          cancelled_7d: number | null
          combo_accepted_7d: number | null
          combo_sent_7d: number | null
          completion_rate_7d: number | null
          courier_user_id: string | null
          deliveries_7d: number | null
          earnings_7d: number | null
          online_minutes_7d: number | null
        }
        Relationships: []
      }
      v_delivery_addresses_30d: {
        Row: {
          lat: number | null
          lng: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_growth_cuisine_benchmark: {
        Row: {
          avg_aov_30d: number | null
          avg_orders_30d: number | null
          avg_rating_30d: number | null
          avg_repeat_rate_pct: number | null
          avg_revenue_30d: number | null
          cuisine: string | null
          tenant_count: number | null
        }
        Relationships: []
      }
      v_last_order_per_tenant: {
        Row: {
          last_order_at: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lost_customers: {
        Row: {
          customer_first_name: string | null
          customer_phone: string | null
          last_order_at: string | null
          last_order_total_cents: number | null
          order_count: number | null
          tenant_id: string | null
          top_item_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_marketplace_summary: {
        Row: {
          entity: string | null
          n: number | null
          status: string | null
        }
        Relationships: []
      }
      v_mv_refresh_status: {
        Row: {
          avg_duration_ms_7d: number | null
          errors_7d: number | null
          has_unique_index: boolean | null
          last_duration_ms: number | null
          last_error: string | null
          last_finished_at: string | null
          last_row_count: number | null
          last_started_at: string | null
          max_duration_ms_7d: number | null
          mv_name: unknown
          mv_schema: unknown
          runs_7d: number | null
          size_bytes: number | null
          size_pretty: string | null
        }
        Relationships: []
      }
      v_orders_daily: {
        Row: {
          avg_value: number | null
          day: string | null
          order_count: number | null
          revenue: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_partner_kpis: {
        Row: {
          commission_pending_cents: number | null
          commission_recurring_cents: number | null
          commission_y1_cents: number | null
          mrr_generated_30d_cents: number | null
          partner_id: string | null
          tenants_attributed: number | null
          tenants_live_30d: number | null
          tenants_pending: number | null
        }
        Relationships: []
      }
      v_peak_hours: {
        Row: {
          dow: number | null
          hour: number | null
          order_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tenant_monthly_ai_spend: {
        Row: {
          agent_name: string | null
          call_count: number | null
          cost_cents: number | null
          input_tokens: number | null
          month: string | null
          output_tokens: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_cost_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tenants_storefront: {
        Row: {
          city_id: string | null
          created_at: string | null
          custom_domain: string | null
          dispatch_mode:
            | Database["public"]["Enums"]["dispatch_mode_enum"]
            | null
          domain_status: string | null
          domain_verified_at: string | null
          feature_flags: Json | null
          id: string | null
          integration_mode:
            | Database["public"]["Enums"]["integration_mode"]
            | null
          name: string | null
          settings: Json | null
          slug: string | null
          status: string | null
          template_slug: string | null
          updated_at: string | null
          vertical: string | null
        }
        Insert: {
          city_id?: string | null
          created_at?: string | null
          custom_domain?: string | null
          dispatch_mode?:
            | Database["public"]["Enums"]["dispatch_mode_enum"]
            | null
          domain_status?: string | null
          domain_verified_at?: string | null
          feature_flags?: Json | null
          id?: string | null
          integration_mode?:
            | Database["public"]["Enums"]["integration_mode"]
            | null
          name?: string | null
          settings?: never
          slug?: string | null
          status?: string | null
          template_slug?: string | null
          updated_at?: string | null
          vertical?: string | null
        }
        Update: {
          city_id?: string | null
          created_at?: string | null
          custom_domain?: string | null
          dispatch_mode?:
            | Database["public"]["Enums"]["dispatch_mode_enum"]
            | null
          domain_status?: string | null
          domain_verified_at?: string | null
          feature_flags?: Json | null
          id?: string | null
          integration_mode?:
            | Database["public"]["Enums"]["integration_mode"]
            | null
          name?: string | null
          settings?: never
          slug?: string | null
          status?: string | null
          template_slug?: string | null
          updated_at?: string | null
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "v_city_delivery_rollup"
            referencedColumns: ["city_id"]
          },
        ]
      }
      v_top_items: {
        Row: {
          item_id: string | null
          item_name: string | null
          order_count: number | null
          revenue: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "live_ops_telemetry"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "mv_growth_tenant_metrics_30d"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_brand_family"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenants_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_active_roles: {
        Row: {
          is_fleet_manager: boolean | null
          is_platform_admin: boolean | null
          is_reseller: boolean | null
          is_tenant_owner: boolean | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_aggregator_order: {
        Args: {
          p_delivery_fee_ron: number
          p_external_order_id: string
          p_items: Json
          p_notes: string
          p_source: string
          p_subtotal_ron: number
          p_tenant_id: string
          p_total_ron: number
        }
        Returns: {
          deduped: boolean
          order_id: string
        }[]
      }
      approve_slot_change: {
        Args: { p_change_slot_id: string }
        Returns: undefined
      }
      audit_log_canonical_payload: {
        Args: {
          p_action: string
          p_actor: string
          p_created_at: string
          p_entity_id: string
          p_entity_type: string
          p_id: string
          p_metadata: Json
          p_tenant_id: string
        }
        Returns: string
      }
      audit_log_verify_chain: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          created_at: string
          expected_hash: string
          prev_hash: string
          row_id: string
          stored_hash: string
        }[]
      }
      brand_root_id: { Args: { p_tenant_id: string }; Returns: string }
      check_and_increment_usage: {
        Args: {
          p_amount?: number
          p_cap_override?: number
          p_resource_kind: string
          p_tenant_id: string
        }
        Returns: Json
      }
      claim_promo_redemption: {
        Args: { p_customer_id: string; p_order_id: string; p_promo_id: string }
        Returns: boolean
      }
      cleanup_integration_events: { Args: never; Returns: number }
      compute_fleet_sla: { Args: { p_day: string }; Returns: number }
      connect_get_endpoint_secrets: {
        Args: { endpoint_ids: string[] }
        Returns: {
          endpoint_id: string
          secret: string
        }[]
      }
      courier_can_take_orders: { Args: { p_user_id: string }; Returns: boolean }
      courier_is_kyc_verified: { Args: { p_user_id: string }; Returns: boolean }
      current_courier_fleet_id: { Args: never; Returns: string }
      fleet_is_kyf_verified: { Args: { p_fleet_id: string }; Returns: boolean }
      fn_audit_financial_purge_protection: {
        Args: never
        Returns: {
          function_name: string
          has_financial_filter: boolean
        }[]
      }
      fn_audit_secdef_search_path: {
        Args: never
        Returns: {
          function_name: string
          search_path_config: string
        }[]
      }
      fn_check_permit_valid: {
        Args: { p_courier_user_id: string }
        Returns: boolean
      }
      fn_compute_delivery_pricing: {
        Args: { p_delivery_id: string }
        Returns: undefined
      }
      fn_courier_application_count: {
        Args: { p_courier_user_id: string }
        Returns: number
      }
      fn_expire_courier_job_listings: { Args: never; Returns: number }
      fn_expire_courier_permits: { Args: never; Returns: number }
      fn_fleet_tier: { Args: { p_fleet_id: string }; Returns: string }
      fn_generate_connect_weekly_invoices: {
        Args: { p_period_start?: string }
        Returns: number
      }
      fn_generate_courier_payout_periods: {
        Args: {
          p_fleet_id?: string
          p_period_end: string
          p_period_start: string
        }
        Returns: number
      }
      fn_generate_courier_payouts_current_week_for_fleet: {
        Args: { p_fleet_id: string }
        Returns: number
      }
      fn_generate_courier_payouts_prior_week: { Args: never; Returns: number }
      fn_get_fleet_webhook_secret: {
        Args: { p_fleet_id: string }
        Returns: string
      }
      fn_inventory_manual_adjust: {
        Args: {
          p_actor_user: string
          p_delta: number
          p_item_id: string
          p_note: string
          p_tenant_id: string
        }
        Returns: {
          movement_id: string
          new_stock: number
        }[]
      }
      fn_loyalty_earn: {
        Args: {
          p_customer_id: string
          p_note?: string
          p_order_id: string
          p_points: number
          p_tenant_id: string
        }
        Returns: number
      }
      fn_loyalty_redeem: {
        Args: {
          p_customer_id: string
          p_note?: string
          p_order_id: string
          p_points: number
          p_tenant_id: string
        }
        Returns: number
      }
      fn_purge_30day_retention: { Args: never; Returns: Json }
      fn_recalc_driver_score: {
        Args: { p_courier_user_id: string }
        Returns: undefined
      }
      fn_recalc_fleet_aggregate: {
        Args: { p_fleet_id: string }
        Returns: undefined
      }
      fn_reservation_request: {
        Args: {
          p_email: string
          p_first_name: string
          p_notes?: string
          p_party_size: number
          p_phone: string
          p_requested_at: string
          p_table_id?: string
          p_tenant_id: string
        }
        Returns: {
          message: string
          public_track_token: string
          reservation_id: string
          status: string
        }[]
      }
      fn_reserved_table_ids: {
        Args: { p_requested_at: string; p_tenant_id: string }
        Returns: {
          table_id: string
        }[]
      }
      fn_set_fleet_flat_tariff: {
        Args: {
          p_cod_bonus_cents: number
          p_created_by: string
          p_fleet_id: string
          p_payout_cents: number
        }
        Returns: undefined
      }
      fn_set_fleet_pickup_km_tariff: {
        Args: {
          p_cod_bonus_cents: number
          p_created_by: string
          p_fleet_id: string
          p_per_km_cents: number
          p_pickup_fee_cents: number
          p_table_name: string
        }
        Returns: string
      }
      gdpr_redact_customer: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      get_courier_track: { Args: { p_track_token: string }; Returns: Json }
      get_courier_track_messages: {
        Args: { p_limit?: number; p_track_token: string }
        Returns: Json
      }
      get_linked_courier_track_token: {
        Args: { p_restaurant_token: string }
        Returns: string
      }
      get_public_order: { Args: { p_token: string }; Returns: Json }
      hir_delete_tenant_rollback: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      hir_delete_vault_secret: {
        Args: { secret_name: string }
        Returns: undefined
      }
      hir_read_vault_secret: { Args: { secret_name: string }; Returns: string }
      hir_write_vault_secret: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
        }
        Returns: undefined
      }
      is_fleet_owner_of: { Args: { p_fleet_id: string }; Returns: boolean }
      is_tenant_member: { Args: { t_id: string }; Returns: boolean }
      is_tenant_member_of: { Args: { p_tenant_id: string }; Returns: boolean }
      is_tenant_owner: { Args: { t_id: string }; Returns: boolean }
      is_tenant_zone_paused: {
        Args: { p_tenant_id: string; p_zone_id: string }
        Returns: Json
      }
      offer_courier_order: {
        Args: {
          p_courier_user_id: string
          p_fleet_id: string
          p_order_id: string
          p_timeout_seconds?: number
        }
        Returns: Json
      }
      post_courier_track_message: {
        Args: { p_body: string; p_track_token: string }
        Returns: Json
      }
      purge_due_courier_deletions: { Args: never; Returns: number }
      record_unmet_demand: {
        Args: {
          p_distance_km?: number
          p_lat: number
          p_lng: number
          p_reason?: string
          p_signal_type: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      refresh_mv_logged: {
        Args: { p_concurrent?: boolean; p_name: string; p_schema: string }
        Returns: undefined
      }
      reject_slot_change: {
        Args: { p_change_slot_id: string; p_reason?: string }
        Returns: undefined
      }
      request_slot_change: {
        Args: {
          p_new_end: string
          p_new_start: string
          p_reason?: string
          p_slot_id: string
        }
        Returns: string
      }
      reseller_leads_expire_stale: { Args: never; Returns: number }
      revoke_expired_courier_offers: { Args: never; Returns: number }
      rollup_courier_daily_kpis: {
        Args: { target_date: string }
        Returns: number
      }
      search_code_chunks: {
        Args: {
          p_app_filter?: string
          p_limit?: number
          p_query_embedding: string
          p_query_text: string
        }
        Returns: {
          app: string
          chunk_index: number
          chunk_text: string
          file_path: string
          id: string
          score: number
        }[]
      }
      set_display_pin: {
        Args: { p_new_pin: string; p_tenant_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_courier_kyc: {
        Args: {
          p_cui?: string
          p_device_fingerprint?: string
          p_id_doc_url?: string
          p_legal_name: string
          p_selfie_url?: string
        }
        Returns: Json
      }
      submit_delivery_rating: {
        Args: {
          p_comment?: string
          p_stars: number
          p_tags?: string[]
          p_track_token: string
        }
        Returns: Json
      }
      submit_fleet_kyf: {
        Args: {
          p_act_constitutiv_url?: string
          p_address?: string
          p_anaf_active?: boolean
          p_caen_code?: string
          p_certificat_inreg_url?: string
          p_company_name?: string
          p_cui: string
          p_extras_cont_url?: string
          p_fleet_id: string
          p_iban?: string
          p_reg_com?: string
          p_vat_payer?: boolean
        }
        Returns: Json
      }
      submit_order_review: {
        Args: { p_comment: string; p_rating: number; p_token: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      vault_create_or_update_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: undefined
      }
      verify_display_pin: {
        Args: { p_pin: string; p_tenant_slug: string }
        Returns: boolean
      }
    }
    Enums: {
      connect_lead_status: "NEW" | "CONTACTED" | "ONBOARDED" | "REJECTED"
      copilot_agent_status: "ACTIVE" | "INACTIVE" | "DRAFT"
      copilot_content_status: "DRAFT" | "APPROVED" | "PUBLISHED" | "REJECTED"
      copilot_feedback_signal: "THUMBS_UP" | "THUMBS_DOWN"
      copilot_message_role: "OWNER" | "COPILOT" | "SYSTEM"
      copilot_revenue_event_type:
        | "CAMPAIGN_ATTRIBUTED_ORDER"
        | "MONTHLY_FEE"
        | "OTHER"
      copilot_subscription_plan:
        | "CONSULTANCY"
        | "STARTER"
        | "GROWTH"
        | "PREMIUM"
      copilot_version_author: "USER" | "AGENT"
      dispatch_mode_enum: "MANUAL_PUSH" | "SELF_PICKUP" | "HYBRID"
      integration_mode: "STANDALONE" | "POS_PUSH" | "POS_PULL" | "BIDIRECTIONAL"
      order_source:
        | "INTERNAL_STOREFRONT"
        | "EXTERNAL_API"
        | "POS_PUSH"
        | "MANUAL_ADMIN"
        | "GLOVO"
        | "WOLT"
        | "TAZZ"
        | "FOODPANDA"
        | "BOLT_FOOD"
        | "VOICE"
      tenant_delivery_mode: "full_saas" | "headless"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      connect_lead_status: ["NEW", "CONTACTED", "ONBOARDED", "REJECTED"],
      copilot_agent_status: ["ACTIVE", "INACTIVE", "DRAFT"],
      copilot_content_status: ["DRAFT", "APPROVED", "PUBLISHED", "REJECTED"],
      copilot_feedback_signal: ["THUMBS_UP", "THUMBS_DOWN"],
      copilot_message_role: ["OWNER", "COPILOT", "SYSTEM"],
      copilot_revenue_event_type: [
        "CAMPAIGN_ATTRIBUTED_ORDER",
        "MONTHLY_FEE",
        "OTHER",
      ],
      copilot_subscription_plan: [
        "CONSULTANCY",
        "STARTER",
        "GROWTH",
        "PREMIUM",
      ],
      copilot_version_author: ["USER", "AGENT"],
      dispatch_mode_enum: ["MANUAL_PUSH", "SELF_PICKUP", "HYBRID"],
      integration_mode: ["STANDALONE", "POS_PUSH", "POS_PULL", "BIDIRECTIONAL"],
      order_source: [
        "INTERNAL_STOREFRONT",
        "EXTERNAL_API",
        "POS_PUSH",
        "MANUAL_ADMIN",
        "GLOVO",
        "WOLT",
        "TAZZ",
        "FOODPANDA",
        "BOLT_FOOD",
        "VOICE",
      ],
      tenant_delivery_mode: ["full_saas", "headless"],
    },
  },
} as const
