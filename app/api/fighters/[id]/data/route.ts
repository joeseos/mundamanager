import { getFighterBasic } from "@/app/lib/shared/fighter-data";
import { getGangCore, getGangFightersList } from "@/app/lib/shared/gang-data";
import type { GangFighter } from "@/types/gang";
import type { FighterProps } from "@/types/fighter";
import { applySpecialRulesModifiers, calculateAdjustedStats, calculateVehicleStats } from "@/utils/effect-modifiers";
import { publicDataOptions, publicDataResponse, transformFighterSummaryForData } from "@/utils/public-data-response";

export const OPTIONS = publicDataOptions;

/**
 * Flatten effects into { category, name } rows for data endpoint
 */
function transformEffectsForData(effects: GangFighter['effects']) {
  return Object.entries(effects ?? {}).flatMap(([category, rows]) =>
    (rows ?? []).map(effect => ({ category, name: effect.effect_name }))
  );
}

/**
 * Transform a fighter weapon, or any vehicle item, with its profiles as the
 * gang page shows them for data endpoint
 */
function transformWeaponForData(weapon: any) {
  return {
    id: weapon.fighter_weapon_id ?? weapon.vehicle_weapon_id,
    name: weapon.weapon_name ?? weapon.equipment_name,
    cost: weapon.cost ?? weapon.purchase_cost ?? 0,
    // Vehicle weapons carry the flag on their profiles
    master_crafted: weapon.is_master_crafted ?? weapon.weapon_profiles?.[0]?.is_master_crafted ?? false,
    profiles: (weapon.weapon_profiles ?? []).map((profile: any) => ({
      name: profile.profile_name || null,
      range_short: profile.range_short ?? null,
      range_long: profile.range_long ?? null,
      acc_short: profile.acc_short ?? null,
      acc_long: profile.acc_long ?? null,
      strength: profile.strength ?? null,
      ap: profile.ap ?? null,
      damage: profile.damage ?? null,
      lethality: profile.lethality ?? null,
      ammo: profile.ammo ?? null,
      traits: profile.traits ?? null
    }))
  };
}

/**
 * Transform a crew fighter's vehicle for data endpoint, with its profile as the
 * fighter card shows it (lasting damage and upgrades applied)
 */
function transformVehicleForData(vehicle: any) {
  const effects = vehicle.effects ?? {};
  const stats = calculateVehicleStats(vehicle);
  return {
    id: vehicle.id,
    name: vehicle.vehicle_name,
    type: vehicle.vehicle_type,
    stats: stats && {
      movement: stats.movement,
      front: stats.front,
      side: stats.side,
      rear: stats.rear,
      hull_points: stats.hull_points,
      handling: stats.handling,
      save: stats.save
    },
    special_rules: applySpecialRulesModifiers(Array.isArray(vehicle.special_rules) ? vehicle.special_rules : [], Object.values(effects).flat() as any[]),
    equipment_items: (vehicle.equipment ?? []).map((item: any) => ({
      ...transformWeaponForData(item),
      type: item.equipment_type
    })),
    effects: transformEffectsForData(effects)
  };
}

/**
 * Transform an assembled gang page fighter in full for data endpoint
 */
function transformFighterForData(fighter: GangFighter, gang: { id: string; name: string }) {
  // The fighter card shows stats and special rules with every effect applied
  const stats = calculateAdjustedStats(fighter as unknown as FighterProps);
  const allEffects = Object.values(fighter.effects ?? {}).flat();

  const { id, ...summary } = transformFighterSummaryForData(fighter);

  return {
    id,
    gang_id: gang.id,
    gang_name: gang.name,
    ...summary,
    label: fighter.label ?? null,
    specialisation: fighter.fighter_specialisation?.fighter_specialisation ?? null,
    stats: {
      movement: stats.movement,
      weapon_skill: stats.weapon_skill,
      ballistic_skill: stats.ballistic_skill,
      strength: stats.strength,
      toughness: stats.toughness,
      wounds: stats.wounds,
      initiative: stats.initiative,
      attacks: stats.attacks,
      leadership: stats.leadership,
      cool: stats.cool,
      willpower: stats.willpower,
      intelligence: stats.intelligence,
      save: stats.save ?? null
    },
    special_rules: applySpecialRulesModifiers(fighter.special_rules ?? [], allEffects),
    skills: Object.keys(fighter.skills ?? {}),
    weapons: (fighter.weapons ?? []).map(transformWeaponForData),
    wargear_items: (fighter.wargear ?? []).map(item => ({
      id: item.fighter_weapon_id,
      name: item.wargear_name,
      cost: item.cost ?? 0,
      master_crafted: item.is_master_crafted ?? false
    })),
    effects: transformEffectsForData(fighter.effects),
    vehicles: (fighter.vehicles ?? []).map(transformVehicleForData)
  };
}

/**
 * One fighter in full, read from the gang page's caches. Fighters of hidden
 * gangs are not published.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  return publicDataResponse(request, params.id, 'Fighter', async (fighterId) => {
    const fighterBasic = await getFighterBasic(fighterId);
    if (!fighterBasic?.gang_id) return null;

    // The same cache entries the fighter and gang pages read
    const gang = await getGangCore(fighterBasic.gang_id);
    if (!gang || gang.hidden) return null;

    const fighters = await getGangFightersList(gang.id, {
      gangEditionSlug: gang.edition_slug ?? null,
      gangTypeId: gang.gang_type_id,
      gangOriginId: gang.gang_origin_id ?? null,
      gangSubtypeIds: gang.gang_subtypes ?? []
    });

    const fighter = fighters.find(f => f.id === fighterId);
    if (!fighter) return null;

    return { fighter: transformFighterForData(fighter, gang) };
  });
}
