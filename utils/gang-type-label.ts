type ParentGangTypeJoin =
  | { parent_gang_type_name?: string | null }
  | { parent_gang_type_name?: string | null }[]
  | null
  | undefined;

/** Parent house name from a gang_types embed, whether PostgREST returns an object or a row. */
export function joinedParentGangTypeName(gangTypes: ParentGangTypeJoin): string | null {
  const row = Array.isArray(gangTypes) ? gangTypes[0] : gangTypes;
  const name = row?.parent_gang_type_name?.trim();
  return name || null;
}

/** House name in compact lists. Root and custom gangs have no parent, so they show the list name. */
export function compactGangTypeLabel(
  listName: string | null | undefined,
  parentGangTypeName: string | null | undefined
): string {
  const parent = parentGangTypeName?.trim();
  if (parent) return parent;
  return listName?.trim() || '';
}

/** "House Escher: Wyld Cult" on the gang page and print view. */
export function detailGangTypeLabel(
  listName: string | null | undefined,
  parentGangTypeName: string | null | undefined
): string {
  const list = listName?.trim() || '';
  const parent = parentGangTypeName?.trim();
  if (parent && list) return `${parent}: ${list}`;
  return list;
}
