import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * Lists fighter classes.
 *
 * fighter_classes holds one row per class per edition (matched across editions
 * on slug), so class_name alone is not unique. Callers that resolve a class by
 * name — e.g. to find the fighter_class_id for the skill-archetype lookup —
 * must scope the request to an edition via `edition_slug` or `edition_id`,
 * otherwise two editions' rows with the same class_name are indistinguishable.
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
      .from('fighter_classes')
      .select('id, class_name, slug, edition_id');

    if (resolvedEditionId) {
      query = query.eq('edition_id', resolvedEditionId);
    }

    const { data: fighterClasses, error } = await query.order('class_name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        error: 'Database error',
        details: error.message
      }, { status: 500 });
    }

    // An empty list is a valid answer, not an error: an edition may legitimately
    // have no classes defined yet.
    return NextResponse.json(fighterClasses ?? []);

  } catch (error) {
    console.error('Error in GET fighter classes:', error);
    return NextResponse.json(
      {
        error: 'Error fetching fighter classes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
