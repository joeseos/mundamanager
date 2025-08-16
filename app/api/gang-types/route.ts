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

    const { data: gangTypes, error } = await supabase
      .from('gang_types')
      .select('gang_type_id, gang_type, alignment, image_url, affiliation')
      .eq('is_hidden', false)
      .order('gang_type')

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