import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.user_role === 'admin';

    // Check for includeAll parameter
    const url = new URL(request.url);
    const includeAll = url.searchParams.get('includeAll') === 'true';

    // Build query - include hidden gang types if user is admin
    let query = supabase
      .from('gang_types')
      .select('gang_type_id, gang_type, alignment, image_url, affiliation')
      .order('gang_type');

    // Apply filtering logic based on user role and parameters
    if (isAdmin && !includeAll) {
      // Admin users still get hidden types filtered out unless they specifically need all types
      query = query.eq('is_hidden', false);
    } else if (!isAdmin) {
      if (includeAll) {
        // Include "All" gang type even if hidden, but exclude other hidden types
        query = query.or('is_hidden.eq.false,gang_type_id.eq.b181b2f7-59f9-452c-84fc-89f183fb8221');
      } else {
        query = query.eq('is_hidden', false);
      }
    }
    // If admin and includeAll is true, no filtering is applied (they get everything)

    const { data: gangTypes, error } = await query;

    if (error) throw error;

    // Fetch all available affiliations once (since they're not gang-type specific)
    let allAffiliations: any[] = [];
    const { data: affiliations, error: affiliationError } = await supabase
      .from('gang_affiliation')
      .select('id, name')
      .order('name');

    if (!affiliationError && affiliations) {
      allAffiliations = affiliations;
    }

    // Add affiliations to gang types that require them
    const gangTypesWithAffiliations = gangTypes.map((gangType) => {
      return {
        ...gangType,
        available_affiliations: gangType.affiliation ? allAffiliations : []
      };
    });

    return NextResponse.json(gangTypesWithAffiliations)
  } catch (error) {
    console.error('Error fetching gang types:', error)
    return NextResponse.json({ error: 'Error fetching gang types' }, { status: 500 })
  }
}