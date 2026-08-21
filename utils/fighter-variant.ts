import { getN26ProspectSpecialisation } from '@/utils/keepTypePromotionN26';

/**
 * The two facts that used to share `fighter_specialisation_id`:
 *
 *   variant        -- Bonecrusher, Natborn. A label distinguishing sibling
 *                     fighter_types rows. Lives in `fighter_variant`.
 *   specialisation -- Heavy, Gunner, Medic. The Specialist pick. Stays in
 *                     `fighter_specialisation_id`.
 *
 * The variant follows the type; the specialisation follows the fighter.
 */

/**
 * True when a catalog id is one of the eight Specialist specialisations rather
 * than a variant label.
 *
 * `fighter_specialisation_id` still holds variant ids on rows written before the
 * split, and the previously deployed build keeps writing them until this ships,
 * so every read has to ask. Backed by the same catalog map promotion uses, which
 * returns undefined for anything that is not one of the eight.
 */
export function isSpecialistSpecialisationId(id?: string | null): boolean {
  return !!id && !!getN26ProspectSpecialisation(id);
}

/**
 * A specialisation id that is safe to surface or store, or null when the value
 * is a leftover variant reference. Use at every read and write boundary rather
 * than trusting the column.
 */
export function specialisationIdOrNull(id?: string | null): string | null {
  return isSpecialistSpecialisationId(id) ? id! : null;
}

export type TypeDerivedIdentity = {
  fighter_variant: string | null;
  fighter_specialisation_id: string | null;
};

/**
 * What a fighter inherits from its catalog row. Resolved server-side from the
 * type id rather than accepted from the browser, so the invariant holds no
 * matter which form did the writing.
 *
 * Both facts are re-derived on a type change, which is what the app already did
 * when both lived in one column: picking "Gunner" for a Tek selects the cloned
 * Tek-Gunner row, and that row is where the pick comes from. The difference is
 * that a *variant* row's specialisation (Haunt/Psyrender) no longer follows into
 * `fighter_specialisation_id` -- it lands in `fighter_variant` instead, which is
 * what stops the column being re-polluted.
 *
 * Once the cloned specialist rows are collapsed, the specialisation will stop
 * coming from the type row at all and this can return the variant alone.
 */
export async function deriveIdentityFromType(
  supabase: any,
  fighterTypeId?: string | null,
  customFighterTypeId?: string | null
): Promise<TypeDerivedIdentity> {
  if (customFighterTypeId) {
    const { data } = await supabase
      .from('custom_fighter_types')
      .select('fighter_variant')
      .eq('id', customFighterTypeId)
      .maybeSingle();
    // Custom types carry no specialisation column, so a custom fighter's pick is
    // whatever the fighter itself holds -- never overwritten from the type.
    return { fighter_variant: data?.fighter_variant ?? null, fighter_specialisation_id: null };
  }

  if (fighterTypeId) {
    const { data } = await supabase
      .from('fighter_types')
      .select('fighter_variant, fighter_specialisation_id')
      .eq('id', fighterTypeId)
      .maybeSingle();
    return {
      fighter_variant: data?.fighter_variant ?? null,
      fighter_specialisation_id: specialisationIdOrNull(data?.fighter_specialisation_id),
    };
  }

  return { fighter_variant: null, fighter_specialisation_id: null };
}
