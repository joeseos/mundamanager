const hasSubtype = (subtypes: string[] | undefined, names: string[]) =>
  subtypes?.some((s) => names.includes(s.toLowerCase())) ?? false;

/** Beasts follow their owner into a battle crew and don't count toward its size. */
export const isCrewBeast = (subtypes?: string[]) =>
  hasSubtype(subtypes, ['exotic beast', 'exotic beast specialist', 'pet']);

/** Support fighters join a battle crew on top of it and don't count toward its size. */
export const isSupportFighter = (subtypes?: string[]) => hasSubtype(subtypes, ['support']);
