import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * Lists fighter subtypes.
 *
 * fighter_subtypes holds one row per subtype per edition, so subtype_name is unique
 * only within an edition (enforced by fighter_subtypes_edition_subtype_name_idx).
 * Callers that resolve a subtype by name — e.g. to find the fighter_subtype_id for
 * the skill-archetype lookup — must scope the request to an edition via
 * `edition_slug` or `edition_id`, otherwise two editions' rows with the same
 * subtype_name are indistinguishable.
 *
 * Both filters are optional; omitting them returns every edition's rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const editionSlug = searchParams.get('edition_slug');
  const editionId = searchParams.get('edition_id');

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let resolvedEditionId = editionId;

    if (!resolvedEditionId && editionSlug) {
      const { data: edition, error: editionError } = await supabase
        .from('editions')
        .select('id')
        .eq('slug', editionSlug)
        .maybeSingle();

      if (editionError) {
        console.error('Database error:', editionError);
        return NextResponse.json({
          error: 'Database error',
          details: editionError.message
        }, { status: 500 });
      }

      if (!edition) {
        return NextResponse.json({
          error: 'Unknown edition',
          details: `No edition with slug '${editionSlug}'`
        }, { status: 400 });
      }

      resolvedEditionId = edition.id;
    }

    let query = supabase
      .from('fighter_subtypes')
      .select('id, subtype_name, edition_id');

    if (resolvedEditionId) {
      query = query.eq('edition_id', resolvedEditionId);
    }

    const { data: fighterSubtypes, error } = await query.order('subtype_name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        error: 'Database error',
        details: error.message
      }, { status: 500 });
    }

    // An empty list is a valid answer, not an error: an edition may legitimately
    // have no subtypes defined yet.
    return NextResponse.json(fighterSubtypes ?? []);

  } catch (error) {
    console.error('Error in GET fighter subtypes:', error);
    return NextResponse.json(
      {
        error: 'Error fetching fighter subtypes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
