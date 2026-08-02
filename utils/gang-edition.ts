/**
 * Shared helpers for resolving a gang's edition slug from its gang type.
 * Gangs have no edition_id column — edition is always derived via
 * gang_type_id / custom_gang_type_id → editions.slug.
 */

/**
 * Flatten an edition slug from embedded join shapes (official and/or custom
 * gang type). Official takes precedence when both are somehow present.
 */
export function resolveGangEditionSlug(sources: {
  gangTypeEditionSlug?: string | null;
  customGangTypeEditionSlug?: string | null;
}): string | null {
  return sources.gangTypeEditionSlug ?? sources.customGangTypeEditionSlug ?? null;
}

/**
 * Look up a gang's edition slug by querying its gang type (official or custom).
 * Prefer this for write-path gates that already have type FKs but not a cached
 * edition_slug from getGangBasic.
 */
export async function fetchGangEditionSlug(
  supabase: any,
  gang: { gang_type_id?: string | null; custom_gang_type_id?: string | null }
): Promise<string | null> {
  if (gang.custom_gang_type_id) {
    const { data } = await supabase
      .from('custom_gang_types')
      .select('editions:edition_id ( slug )')
      .eq('id', gang.custom_gang_type_id)
      .maybeSingle();
    return resolveGangEditionSlug({
      customGangTypeEditionSlug: data?.editions?.slug ?? null
    });
  }
  if (gang.gang_type_id) {
    const { data } = await supabase
      .from('gang_types')
      .select('editions:edition_id ( slug )')
      .eq('gang_type_id', gang.gang_type_id)
      .maybeSingle();
    return resolveGangEditionSlug({
      gangTypeEditionSlug: data?.editions?.slug ?? null
    });
  }
  return null;
}
