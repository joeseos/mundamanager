export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      campaigns: {
        Row: {
          id: string
          campaign_name: string
          campaign_type_id: string
          created_at: string
          updated_at: string | null
          status: string | null
        }
        Insert: {
          id?: string
          campaign_name: string
          campaign_type_id: string
          created_at?: string
          updated_at?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          campaign_name?: string
          campaign_type_id?: string
          created_at?: string
          updated_at?: string | null
          status?: string | null
        }
      }
      fighters: {
        Row: {
          id: string
          fighter_name: string
          fighter_type_id: string
          gang_id: string
          credits: number
          xp: number | null
          total_xp: number | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          fighter_name: string
          fighter_type_id: string
          gang_id: string
          credits?: number
          xp?: number | null
          total_xp?: number | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          fighter_name?: string
          fighter_type_id?: string
          gang_id?: string
          credits?: number
          xp?: number | null
          total_xp?: number | null
          created_at?: string
          updated_at?: string | null
        }
      }
      gangs: {
        Row: {
          id: string
          name: string
          gang_type_id: string
          credits: number
          reputation: number
          user_id: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          gang_type_id: string
          credits?: number
          reputation?: number
          user_id: string
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          gang_type_id?: string
          credits?: number
          reputation?: number
          user_id?: string
          created_at?: string
          updated_at?: string | null
        }
      }
      campaign_gangs: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          role: string | null
          status: string | null
          invited_at: string | null
          joined_at: string | null
          invited_by: string | null
          gang_id: string | null
          created_at: string | null
          updated_at: string | null
          campaign_member_id: string | null
          campaign_type_allegiance_id: string | null
          campaign_allegiance_id: string | null
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          role?: string | null
          status?: string | null
          invited_at?: string | null
          joined_at?: string | null
          invited_by?: string | null
          gang_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          campaign_member_id?: string | null
          campaign_type_allegiance_id?: string | null
          campaign_allegiance_id?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          user_id?: string
          role?: string | null
          status?: string | null
          invited_at?: string | null
          joined_at?: string | null
          invited_by?: string | null
          gang_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          campaign_member_id?: string | null
          campaign_type_allegiance_id?: string | null
          campaign_allegiance_id?: string | null
        }
      }
      campaign_type_allegiances: {
        Row: {
          id: string
          campaign_type_id: string
          allegiance_name: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          campaign_type_id: string
          allegiance_name: string
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          campaign_type_id?: string
          allegiance_name?: string
          created_at?: string
          updated_at?: string | null
        }
      }
      campaign_allegiances: {
        Row: {
          id: string
          campaign_id: string
          allegiance_name: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          campaign_id: string
          allegiance_name: string
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          allegiance_name?: string
          created_at?: string
          updated_at?: string | null
        }
      }
      equipment: {
        Row: {
          id: string
          equipment_name: string
          cost: number
          created_at: string
        }
        Insert: {
          id?: string
          equipment_name: string
          cost: number
          created_at?: string
        }
        Update: {
          id?: string
          equipment_name?: string
          cost?: number
          created_at?: string
        }
      }
      fighter_equipment: {
        Row: {
          id: string
          fighter_id: string
          equipment_id: string
          created_at: string
        }
        Insert: {
          id?: string
          fighter_id: string
          equipment_id: string
          created_at?: string
        }
        Update: {
          id?: string
          fighter_id?: string
          equipment_id?: string
          created_at?: string
        }
      }
      gang_types: {
        Row: {
          id: string
          gang_type_name: string
          created_at: string
        }
        Insert: {
          id?: string
          gang_type_name: string
          created_at?: string
        }
        Update: {
          id?: string
          gang_type_name?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_fighter_and_equipment: {
        Args: {
          fighter_id: string
          operations: Json[]
        }
        Returns: Json
      }
      get_fighter_details: {
        Args: {
          input_fighter_id: string
        }
        Returns: Json[]
      }
      sell_equipment_from_fighter: {
        Args: {
          fighter_equipment_id: string
        }
        Returns: {
          equipment_sold: {
            id: string
            sell_value: number
          }
          gang: {
            id: string
            credits: number
          }
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
} 