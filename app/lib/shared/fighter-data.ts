import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

// =============================================================================
// TYPES - Shared interfaces for fighter data
// =============================================================================

export interface FighterBasic {
  id: string;
  fighter_name: string;
  label?: string;
  note?: string;
  note_backstory?: string;
  credits: number;
  cost_adjustment?: number;
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
  special_rules?: string[];
  fighter_class?: string;
  fighter_class_id?: string;
  fighter_type?: string;
  fighter_type_id: string;
  custom_fighter_type_id?: string | null;
  custom_fighter_type?: {
    gang_type_id: string | null;
    custom_gang_type_id: string | null;
  } | null;
  fighter_gang_legacy_id?: string | null;
  fighter_gang_legacy?: {
    id: string;
    fighter_type_id: string;
    name?: string;
  } | null;
  fighter_sub_type_id?: string;
  killed?: boolean;
  starved?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  captured_by_gang_id?: string | null;
  free_skill?: boolean;
  kills?: number;
  kill_count?: number;
  gang_id: string;
  fighter_pet_id?: string;
  image_url?: string;
  position?: string;
  active_loadout_id?: string | null;
  selected_archetype_id?: string | null;
  selected_archetype?: {
    id: string;
    name: string;
  } | null;
}

// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with proper cache tags
// =============================================================================

/**
 * Get fighter basic information (stats, name, type, etc.)
 * Cache: BASE_FIGHTER_BASIC
 */
export const getFighterBasic = async (fighterId: string, supabase: any): Promise<FighterBasic | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighters')
        .select(`
          id,
          fighter_name,
          label,
          note,
          note_backstory,
          credits,
          cost_adjustment,
          movement,
          weapon_skill,
          ballistic_skill,
          strength,
          toughness,
          wounds,
          initiative,
          attacks,
          leadership,
          cool,
          willpower,
          intelligence,
          xp,
          special_rules,
          fighter_class,
          fighter_class_id,
          fighter_type,
          fighter_type_id,
          custom_fighter_type_id,
          custom_fighter_type:custom_fighter_type_id (
            gang_type_id,
            custom_gang_type_id
          ),
          fighter_gang_legacy_id,
          fighter_gang_legacy:fighter_gang_legacy_id (
            id,
            fighter_type_id,
            name
          ),
          fighter_sub_type_id,
          killed,
          starved,
          retired,
          enslaved,
          recovery,
          captured,
          captured_by_gang_id,
          free_skill,
          kills,
          kill_count,
          gang_id,
          fighter_pet_id,
          image_url,
          position,
          active_loadout_id,
          selected_archetype_id,
          selected_archetype:selected_archetype_id (
            id,
            name
          )
        `)
        .eq('id', fighterId)
        .single();

      if (error) {
        // Return null for not found errors or invalid UUID format
        if (error.code === 'PGRST116' || error.code === '22P02') return null;
        throw error;
      }
      return data;
    },
    [`fighter-basic-v3-${fighterId}`],
    {
      tags: [TAGS.fighter(fighterId)],
      revalidate: false
    }
  )();
};

/**
 * Calculate fighter's total cost (base + equipment + skills + effects +
 * vehicles + owned beasts).
 *
 * Deliberately UNCACHED: every consumer is a mutation computing a rating
 * delta or refund, and reading a cache entry mid-write risks stale values
 * (this bit us before — see the pre-write cost comments in fighter-injury).
 * Page rendering derives the same figure from the gang fighters bundle.
 */
export const getFighterTotalCost = async (fighterId: string, supabase: any): Promise<number> => {
  const { data: fighter } = await supabase
    .from('fighters')
    .select('id, credits, cost_adjustment, fighter_pet_id')
    .eq('id', fighterId)
    .maybeSingle();

  if (!fighter) return 0;

  // Fighters owned by another fighter (exotic beasts) always cost 0
  if (fighter.fighter_pet_id) {
    const { data: ownershipData } = await supabase
      .from('fighter_exotic_beasts')
      .select('fighter_owner_id')
      .eq('id', fighter.fighter_pet_id)
      .maybeSingle();
    if (ownershipData) return 0;
  }

  const [equipmentRes, skillsRes, effectsRes, vehiclesRes, beastLinksRes] = await Promise.all([
    supabase
      .from('fighter_equipment')
      .select('purchase_cost')
      .eq('fighter_id', fighterId)
      .is('vehicle_id', null),
    supabase
      .from('fighter_skills')
      .select('credits_increase')
      .eq('fighter_id', fighterId),
    supabase
      .from('fighter_effects')
      .select('type_specific_data')
      .eq('fighter_id', fighterId)
      .is('vehicle_id', null),
    supabase
      .from('vehicles')
      .select(`
        id,
        cost,
        fighter_equipment!vehicle_id (purchase_cost),
        fighter_effects!vehicle_id (type_specific_data)
      `)
      .eq('fighter_id', fighterId),
    supabase
      .from('fighter_exotic_beasts')
      .select('fighter_pet_id')
      .eq('fighter_owner_id', fighterId)
  ]);

  const equipmentCost = (equipmentRes.data || []).reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
  const skillsCost = (skillsRes.data || []).reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
  const effectsCost = (effectsRes.data || []).reduce((sum: number, effect: any) => {
    const data = effect.type_specific_data;
    return sum + (typeof data === 'object' && data?.credits_increase ? data.credits_increase : 0);
  }, 0);

  const vehicleCost = (vehiclesRes.data || []).reduce((sum: number, vehicle: any) => {
    let vehicleTotal = vehicle.cost || 0;
    vehicleTotal += ((vehicle.fighter_equipment as any[]) || []).reduce(
      (s: number, eq: any) => s + (eq.purchase_cost || 0), 0
    );
    vehicleTotal += ((vehicle.fighter_effects as any[]) || []).reduce(
      (s: number, effect: any) => s + (effect.type_specific_data?.credits_increase || 0), 0
    );
    return sum + vehicleTotal;
  }, 0);

  // Owned exotic beasts roll their cost into the owner
  let beastsCost = 0;
  const beastIds = (beastLinksRes.data || []).map((b: any) => b.fighter_pet_id);
  if (beastIds.length > 0) {
    const { data: beastData } = await supabase
      .from('fighters')
      .select(`
        id,
        credits,
        cost_adjustment,
        fighter_equipment!fighter_id (purchase_cost),
        fighter_skills!fighter_id (credits_increase),
        fighter_effects!fighter_id (type_specific_data),
        fighter_types!inner (cost)
      `)
      .in('id', beastIds)
      .eq('killed', false)
      .eq('retired', false)
      .eq('enslaved', false)
      .eq('captured', false);

    beastsCost = (beastData || []).reduce((sum: number, beast: any) => {
      const beastEquipment = ((beast.fighter_equipment as any[]) || []).reduce((s, eq) => s + (eq.purchase_cost || 0), 0);
      const beastSkills = ((beast.fighter_skills as any[]) || []).reduce((s, skill) => s + (skill.credits_increase || 0), 0);
      const beastEffects = ((beast.fighter_effects as any[]) || []).reduce(
        (s, effect) => s + (effect.type_specific_data?.credits_increase || 0), 0
      );
      const baseBeastCost = (beast.fighter_types as any)?.cost || 0;
      return sum + baseBeastCost + beastEquipment + beastSkills + beastEffects + (beast.cost_adjustment || 0);
    }, 0);
  }

  return fighter.credits + equipmentCost + skillsCost + effectsCost + vehicleCost +
         (fighter.cost_adjustment || 0) + beastsCost;
};
