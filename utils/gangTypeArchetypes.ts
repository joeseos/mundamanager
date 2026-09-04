/**
 * Alternate gang archetypes (Chymist Cult, Wyld Hunt, Furnace Brutes, …) are
 * their own gang_types rows linked by parent_gang_type_id. Roots have a null
 * parent; an archetype points at its parent gang type. Created gangs store the
 * archetype's own id.
 */

export type GangTypeWithParent = {
  gang_type_id: string;
  gang_type: string;
  parent_gang_type_id?: string | null;
};

/** True when this row is an alternate list of another gang type (has a parent). */
export function hasParentGangType(type: GangTypeWithParent): boolean {
  return type.parent_gang_type_id != null;
}

/** Archetypes whose parent_gang_type_id is this root's gang_type_id. */
export function gangArchetypesFor<T extends GangTypeWithParent>(
  parent: T,
  types: T[]
): T[] {
  return types
    .filter((type) => type.parent_gang_type_id === parent.gang_type_id)
    .sort((a, b) => a.gang_type.localeCompare(b.gang_type));
}
