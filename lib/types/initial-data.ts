import { Equipment } from '@/types/equipment';
import { FighterSkills, FighterEffect, Vehicle } from '@/types/fighter';

export interface InitialFighterData {
  fighter: {
    id: string;
    fighter_name: string;
    fighter_type_id: string;
    fighter_sub_type_id?: string | null;
    gang_id: string;
    credits: number;
    movement: number;
    weapon_skill: number;
    ballistic_skill: number;
    strength: number;
    toughness: number;
    wounds: number;
    initiative: number;
    attacks: number;
    leadership: number;
    cool: number;
    willpower: number;
    intelligence: number;
    xp: number;
    total_xp?: number;
    killed?: boolean;
    retired?: boolean;
    enslaved?: boolean;
    starved?: boolean;
    recovery?: boolean;
    captured?: boolean;
    free_skill?: boolean;
    kills?: number;
    fighter_class?: string;
    label?: string;
    note?: string;
    note_backstory?: string;
    special_rules?: string[];
    cost_adjustment?: number;
    injury_advances?: number;
    fighter_pet_id?: string | null;
    image_url?: string;
  };
  gang: {
    id: string;
    credits: number;
    gang_type_id: string;
    gang_affiliation_id?: string | null;
    gang_affiliation_name?: string;
    rating?: number;
    positioning?: Record<number, string>;
  };
  equipment: Equipment[];
  skills: FighterSkills;
  effects: {
    injuries: FighterEffect[];
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cyberteknika: FighterEffect[];
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
  };
  vehicles: Vehicle[];
  totalCost: number;
  fighterType?: {
    id: string;
    fighter_type: string;
    alliance_crew_name?: string;
  };
  fighterSubType?: {
    id: string;
    sub_type_name: string;
  };
  campaigns?: any[];
  ownedBeasts?: any[];
  ownerName?: string;
  gangFighters?: {
    id: string;
    fighter_name: string;
    fighter_type: string;
    xp: number | null;
  }[];
  gangPositioning?: Record<number, string>;
}