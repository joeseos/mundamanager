import { getEditionIdBySlug } from '@/utils/editions';
import {
  getArchetypeCatalogSubtype,
  isArchetypeEligible,
  isArchetypeInCatalog,
} from '@/utils/archetypeEligibility';

export type AssertArchetypeAssignableResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side gate for assigning a skill archetype to a fighter.
 * Checks Outcasts eligibility, that the archetype exists, and that its
 * fighter_subtype_id matches the edition-scoped catalog subtype
 * (Leader → Champion → Ganger priority).
 */
export async function assertArchetypeAssignable(
  supabase: {
    from: (table: string) => any;
  },
  params: {
    gangTypeId: string | null | undefined;
    fighterSubtypes: string[];
    archetypeId: string;
    editionSlug: string | null | undefined;
  }
): Promise<AssertArchetypeAssignableResult> {
  if (
    !isArchetypeEligible({
      gangTypeId: params.gangTypeId,
      fighterSubtypes: params.fighterSubtypes,
    })
  ) {
    return {
      ok: false,
      error: 'This fighter type cannot be assigned an archetype for this gang.',
    };
  }

  const { data: archetypeRow, error: archetypeLookupError } = await supabase
    .from('skill_access_archetypes')
    .select('id, fighter_subtype_id')
    .eq('id', params.archetypeId)
    .single();

  if (archetypeLookupError || !archetypeRow) {
    return {
      ok: false,
      error: 'Selected archetype was not found.',
    };
  }

  // Legacy / unrestricted rows with no subtype FK
  if (!archetypeRow.fighter_subtype_id) {
    return { ok: true };
  }

  const catalogSubtypeName = getArchetypeCatalogSubtype(params.fighterSubtypes, {
    gangTypeId: params.gangTypeId,
  });
  if (!catalogSubtypeName) {
    return {
      ok: false,
      error: 'This fighter type cannot be assigned an archetype for this gang.',
    };
  }

  if (!params.editionSlug) {
    return {
      ok: false,
      error: 'Could not resolve edition for archetype validation.',
    };
  }

  const editionId = await getEditionIdBySlug(params.editionSlug);
  if (!editionId) {
    return {
      ok: false,
      error: 'Could not resolve edition for archetype validation.',
    };
  }

  const { data: catalogSubtype, error: catalogSubtypeError } = await supabase
    .from('fighter_subtypes')
    .select('id')
    .eq('edition_id', editionId)
    .eq('subtype_name', catalogSubtypeName)
    .maybeSingle();

  if (catalogSubtypeError || !catalogSubtype?.id) {
    return {
      ok: false,
      error: 'Could not resolve subtype catalog for this edition.',
    };
  }

  if (
    !isArchetypeInCatalog({
      catalogSubtypeId: catalogSubtype.id,
      archetypeSubtypeId: archetypeRow.fighter_subtype_id,
    })
  ) {
    return {
      ok: false,
      error: "Selected archetype does not match this fighter's subtype catalog.",
    };
  }

  return { ok: true };
}
