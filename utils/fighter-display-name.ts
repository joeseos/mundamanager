/**
 * The one place a fighter's type line is composed.
 *
 * A fighter carries up to four facts that belong on that line, and they were
 * previously concatenated inline at each call site — which is how the variant and
 * the specialisation came to be treated as one thing in the first place:
 *
 *   Haunt (Ganger, Specialist, Wyrd), Bonecrusher, Heavy
 *   ^type  ^subtypes                   ^variant     ^specialisation
 *
 * The variant follows the fighter's type; the specialisation follows the fighter.
 * Both can be present at once, which is the whole point of the split.
 */

export type FighterTypeLineParts = {
  fighter_type?: string | null;
  alliance_crew_name?: string | null;
  fighter_subtypes?: string[] | null;
  fighter_variant?: string | null;
  /** Already narrowed to a real specialisation by the fetchers. */
  fighter_specialisation?: { fighter_specialisation?: string | null } | string | null;
};

/**
 * `full` is the on-screen form; `print` is the denser one the gang printout uses,
 * which has no room for parentheses and drops the alliance crew name. They differ
 * on purpose — everything else about the line is shared.
 */
export type FighterTypeLineStyle = 'full' | 'print';

function specialisationName(
  value: FighterTypeLineParts['fighter_specialisation']
): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value || null;
  return value.fighter_specialisation || null;
}

export function formatFighterTypeLine(
  fighter: FighterTypeLineParts,
  style: FighterTypeLineStyle = 'full'
): string {
  const subtypes = (fighter.fighter_subtypes ?? []).filter(Boolean);
  // Variant before specialisation: it is the more permanent of the two, and it
  // reads as part of who the fighter is rather than what they trained as.
  const trailing = [fighter.fighter_variant, specialisationName(fighter.fighter_specialisation)]
    .filter((part): part is string => !!part && !!part.trim());

  if (style === 'print') {
    return [fighter.fighter_type, subtypes.join(', '), ...trailing]
      .filter((part): part is string => !!part && !!part.trim())
      .join(' • ');
  }

  let line = fighter.fighter_type ?? '';
  if (fighter.alliance_crew_name) line += ` - ${fighter.alliance_crew_name}`;
  if (subtypes.length > 0) line += ` (${subtypes.join(', ')})`;
  for (const part of trailing) line += `, ${part}`;
  return line;
}
