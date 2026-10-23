/** Pure costing shared by server reads, roster assembly, and local fixtures. */
export interface FighterCostParts {
  base: number;
  equipment: number;
  skills: number;
  effects: number;
  vehicles: number;
  adjustment: number;
  beasts: number;
}

export function totalFighterValue(parts: FighterCostParts): number {
  return parts.base + parts.equipment + parts.skills + parts.effects + parts.vehicles + parts.adjustment + parts.beasts;
}

type EquipmentCost = { purchase_cost: number | null };
type SkillCost = { credits_increase: number | null };
type EffectCost = { type_specific_data: unknown };
interface AssetCosts {
  fighter_equipment: EquipmentCost[];
  fighter_skills: SkillCost[];
  fighter_effects: EffectCost[];
}
export interface FighterCostData extends AssetCosts {
  credits: number | null;
  cost_adjustment: number | null;
  beast_link: unknown;
  vehicles: { cost: number | null; fighter_equipment: EquipmentCost[]; fighter_effects: EffectCost[] }[];
  fighter_exotic_beasts: {
    fighter_pet_id: string | null;
    fighter_equipment: { gang_stash: boolean | null } | null;
    pet: (AssetCosts & {
      id: string;
      cost_adjustment: number | null;
      killed: boolean;
      retired: boolean;
      enslaved: boolean;
      captured: boolean | null;
      fighter_types: { cost: number | null } | null;
    }) | null;
  }[];
}

const equipmentCost = (rows: EquipmentCost[]) => rows.reduce((sum, row) => sum + (row.purchase_cost || 0), 0);
const skillsCost = (rows: SkillCost[]) => rows.reduce((sum, row) => sum + (row.credits_increase || 0), 0);
const effectsCost = (rows: EffectCost[]) => rows.reduce((sum, row) =>
  sum + ((row.type_specific_data as { credits_increase?: number } | null)?.credits_increase || 0), 0);

export function calculateVehicleCost(vehicle: FighterCostData['vehicles'][number]): number {
  return (vehicle.cost || 0) + equipmentCost(vehicle.fighter_equipment) + effectsCost(vehicle.fighter_effects);
}

export function calculateFighterCost(fighter: FighterCostData): number {
  if (fighter.beast_link) return 0;
  const stashedBeastIds = new Set(fighter.fighter_exotic_beasts
    .filter(link => link.fighter_equipment?.gang_stash).map(link => link.fighter_pet_id));
  const beasts = new Map(fighter.fighter_exotic_beasts.flatMap(({ pet }) =>
    pet?.fighter_types && pet.killed === false && pet.retired === false &&
    pet.enslaved === false && pet.captured === false ? [[pet.id, pet] as const] : []));
  const beastsValue = [...beasts.values()].reduce((sum, beast) => sum + totalFighterValue({
    base: beast.fighter_types?.cost || 0,
    equipment: stashedBeastIds.has(beast.id) ? 0 : equipmentCost(beast.fighter_equipment),
    skills: skillsCost(beast.fighter_skills), effects: effectsCost(beast.fighter_effects),
    adjustment: beast.cost_adjustment || 0, vehicles: 0, beasts: 0,
  }), 0);
  return totalFighterValue({
    base: fighter.credits || 0, equipment: equipmentCost(fighter.fighter_equipment),
    skills: skillsCost(fighter.fighter_skills), effects: effectsCost(fighter.fighter_effects),
    adjustment: fighter.cost_adjustment || 0, beasts: beastsValue,
    vehicles: fighter.vehicles.reduce((sum, vehicle) => sum + calculateVehicleCost(vehicle), 0),
  });
}
