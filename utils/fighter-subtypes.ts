/**
 * Add or remove a fighter subtype, keeping the reference list's order so the
 * stored array doesn't depend on the order the boxes happened to be ticked in.
 *
 * Shared by every form that offers the N26 multi-subtype picker (admin create,
 * admin edit, and the custom fighter form), which otherwise each carry their own
 * copy of the same four lines.
 */
export function toggleFighterSubtype(
  selected: string[],
  reference: { subtype_name: string }[],
  subtypeName: string,
  checked: boolean
): string[] {
  const next = new Set(selected);
  if (checked) next.add(subtypeName); else next.delete(subtypeName);
  return reference.map(s => s.subtype_name).filter(name => next.has(name));
}
