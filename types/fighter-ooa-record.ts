/**
 * Shared types for fighter OOA / vehicle-wreck history records. Kept in a
 * plain (non-'use server') module so both server actions/route handlers and
 * client components can import them without pulling in server-action-only
 * export restrictions.
 */

export interface FighterOoaRecord {
  id: string;
  created_at: string;
  causing_fighter_id: string | null;
  causing_gang_id: string | null;
  causing_fighter_name: string | null;
  causing_fighter_type: string | null;
  causing_fighter_class: string | null;
  causing_fighter_gang_name: string | null;
  injured_fighter_id: string | null;
  injured_gang_id: string | null;
  injured_fighter_name: string | null;
  injured_fighter_type: string | null;
  injured_fighter_class: string | null;
  injured_gang_name: string | null;
  event_type: 'out_of_action' | 'vehicle_wrecked';
  vehicle_type: string | null;
  vehicle_name: string | null;
  campaign_id: string | null;
}

export interface CampaignGangWithFighters {
  gang_id: string;
  name: string;
  gang_colour: string | null;
  owner_username: string | null;
  fighters: Array<{
    id: string;
    fighter_name: string;
    fighter_type: string | null;
    fighter_class: string | null;
    gang_id: string;
  }>;
}
