/**
 * A fighter's total cost: base credits + equipment + skills + effects +
 * vehicles + owned exotic beasts + cost adjustment. Pure, so the pages (fed
 * from the cached gang bundle) and the server actions (fed from fresh rows)
 * add up the same way.
 */

type Credits = number | null | undefined;

interface EquipmentCostRow { purchase_cost?: Credits }
interface SkillCostRow { credits_increase?: Credits }
interface EffectCostRow { type_specific_data?: unknown }

export interface VehicleCostRows {
  cost?: Credits;
  equipment: EquipmentCostRow[];
  effects: EffectCostRow[];
}

export interface BeastCostRows {
  /** The beast's fighter type cost; a beast with no fighter type has a base cost of 0. */
  base_cost?: Credits;
  cost_adjustment?: Credits;
  killed?: boolean | null;
  retired?: boolean | null;
  enslaved?: boolean | null;
  captured?: boolean | null;
  /** The beast-granting item is in the stash, which already holds its equipment's cost. */
  equipment_stashed: boolean;
  equipment: EquipmentCostRow[];
  skills: SkillCostRow[];
  effects: EffectCostRow[];
}

export interface FighterCostRows {
  credits?: Credits;
  cost_adjustment?: Credits;
  equipment: EquipmentCostRow[];
  skills: SkillCostRow[];
  effects: EffectCostRow[];
  vehicles: VehicleCostRows[];
  /** One entry per owned-beast link. */
  beasts: BeastCostRows[];
}

export const equipmentCost = (rows: EquipmentCostRow[]) =>
  rows.reduce((sum, row) => sum + (row.purchase_cost || 0), 0);

export const skillsCost = (rows: SkillCostRow[]) =>
  rows.reduce((sum, row) => sum + (row.credits_increase || 0), 0);

/** The credits the effects add (type_specific_data.credits_increase). */
export const effectsCost = (rows: EffectCostRow[]) =>
  rows.reduce(
    (sum, row) => sum + ((row.type_specific_data as { credits_increase?: number } | null)?.credits_increase || 0),
    0
  );

export const vehicleCost = (vehicle: VehicleCostRows) =>
  (vehicle.cost || 0) + equipmentCost(vehicle.equipment) + effectsCost(vehicle.effects);

/**
 * What an owned beast adds to its owner, or null when it adds nothing
 * (killed, retired, enslaved or captured).
 */
export function beastCost(beast: BeastCostRows): { equipment: number; advancements: number; total: number } | null {
  if (beast.killed || beast.retired || beast.enslaved || beast.captured) return null;
  const equipment = beast.equipment_stashed ? 0 : equipmentCost(beast.equipment);
  // Advancements stay with the beast even when its equipment is stashed
  const advancements = skillsCost(beast.skills) + effectsCost(beast.effects) + (beast.cost_adjustment || 0);
  return { equipment, advancements, total: (beast.base_cost || 0) + equipment + advancements };
}

export function fighterTotalCost(fighter: FighterCostRows): number {
  return (fighter.credits || 0)
    + equipmentCost(fighter.equipment)
    + skillsCost(fighter.skills)
    + effectsCost(fighter.effects)
    + fighter.vehicles.reduce((sum, vehicle) => sum + vehicleCost(vehicle), 0)
    + fighter.beasts.reduce((sum, beast) => sum + (beastCost(beast)?.total || 0), 0)
    + (fighter.cost_adjustment || 0);
}
