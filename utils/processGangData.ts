import { FighterProps } from '@/types/fighter';
import { FighterType } from '@/types/fighter-type';

interface GangData {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  rating: number;
  alignment: string;
  created_at: string;
  last_updated: string;
  user_id: string;
  fighters: FighterProps[];
  fighter_types: FighterType[];
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
  }[];
}

interface ProcessedGangData {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  rating: number;
  alignment: string;
  created_at: string;
  last_updated: string;
  user_id: string;
  fighters: FighterProps[];
  fighterTypes: FighterType[];
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
  }[];
}

export async function processGangData(gangData: GangData): Promise<ProcessedGangData> {
  // Transform the data as needed
  return {
    ...gangData,
    fighterTypes: gangData.fighter_types || [], // Convert snake_case to camelCase
    fighters: gangData.fighters.map(fighter => ({
      ...fighter,
      // Add any fighter-specific transformations here if needed
    }))
  };
} 