import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .single();

    const isAdmin = profile?.user_role === 'admin';

    // Check for includeAll parameter
    const url = new URL(request.url);
    const includeAll = url.searchParams.get('includeAll') === 'true';

    // Build query - include gang origin data
    let query = supabase
      .from('gang_types')
      .select('gang_type_id, gang_type, alignment, image_url, default_image_urls, affiliation, gang_origin_category_id')
      .order('gang_type');

    // Only filter out hidden types if user is not admin
    if (!isAdmin) {
      if (includeAll) {
        // Include "All" gang type even if hidden, but exclude other hidden types
        query = query.or('is_hidden.eq.false,gang_type_id.eq.b181b2f7-59f9-452c-84fc-89f183fb8221');
      } else {
        query = query.eq('is_hidden', false);
      }
    }
    // Admin users see all gang types (including hidden) by default

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

    // Get unique origin category IDs from gang types that have them
    const originCategoryIds = Array.from(new Set(
      gangTypes
        .filter(type => type.gang_origin_category_id)
        .map(type => type.gang_origin_category_id)
    ));

    // Only fetch origins for categories that are actually used by gang types
    let originsByCategory: Record<string, any[]> = {};

    if (originCategoryIds.length > 0) {
      const { data: origins, error: originError } = await supabase
        .from('gang_origins')
        .select(`
          id,
          origin_name,
          gang_origin_category_id,
          gang_origin_categories!gang_origin_category_id (
            category_name
          )
        `)
        .in('gang_origin_category_id', originCategoryIds);

      if (!originError && origins) {
        // Group origins by category ID for efficient lookup
        originsByCategory = origins.reduce((acc, origin) => {
          const categoryId = origin.gang_origin_category_id;
          if (!acc[categoryId]) {
            acc[categoryId] = [];
          }
          acc[categoryId].push({
            id: origin.id,
            origin_name: origin.origin_name,
            category_name: (origin.gang_origin_categories as any)?.category_name || 'Unknown'
          });
          return acc;
        }, {} as Record<string, any[]>);
      }
    }

    // Add affiliations and origins to gang types that require them
    const gangTypesWithAffiliationsAndOrigins = gangTypes.map((gangType) => {
      const availableOrigins = gangType.gang_origin_category_id
        ? (originsByCategory[gangType.gang_origin_category_id] || [])
        : [];

      return {
        ...gangType,
        available_affiliations: gangType.affiliation ? allAffiliations : [],
        available_origins: availableOrigins
      };
    });

    return NextResponse.json(gangTypesWithAffiliationsAndOrigins)
  } catch (error) {
    console.error('Error fetching gang types:', error)
    return NextResponse.json({ error: 'Error fetching gang types' }, { status: 500 })
  }
}