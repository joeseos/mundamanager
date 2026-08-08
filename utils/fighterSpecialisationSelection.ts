export interface SpecialisedFighterType {
  id: string;
  total_cost: number;
  edition_slug?: string | null;
  specialisation?: { id?: string; specialisation_name?: string } | null;
}

/** Select the row that represents a fighter-type group in the type combobox. */
export function representativeFighterType<T extends SpecialisedFighterType>(
  group: T[],
  fallbackEnabled: boolean
): T | undefined {
  const defaultType = group.find(type =>
    !type.specialisation || type.specialisation.specialisation_name === 'Default'
  );
  if (defaultType) return defaultType;

  const firstType = group[0];
  if (!firstType || !fallbackEnabled) {
    return firstType;
  }

  return group.reduce((lowest, current) =>
    current.total_cost < lowest.total_cost ? current : lowest
  );
}

/** Resolve an automatic specialisation, while always preferring a true default row. */
export function automaticFighterSpecialisation<T extends SpecialisedFighterType>(
  group: T[],
  fallbackEnabled: boolean
): T | undefined {
  const defaultType = group.find(type =>
    !type.specialisation || type.specialisation.specialisation_name === 'Default'
  );
  if (defaultType) return defaultType;
  if (!fallbackEnabled) return undefined;

  return group.reduce((lowest, current) =>
    current.total_cost < lowest.total_cost ? current : lowest
  );
}
