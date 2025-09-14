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

    // Build query - include hidden gang types if user is admin
    let query = supabase
      .from('gang_types')
      .select('gang_type_id, gang_type, alignment, image_url, affiliation')
      .order('gang_type');

    // Only filter out hidden types if user is not admin
    if (!isAdmin) {
      query = query.eq('is_hidden', false);
    }

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