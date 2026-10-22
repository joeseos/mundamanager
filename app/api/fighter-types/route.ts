import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserCustomFighterTypes } from '@/app/lib/customise/custom-fighters';
import { getUserIdFromClaims } from "@/utils/auth";
import { withEditionSlug } from '@/types/edition';
import { withVariantGroups } from '@/utils/variantFamily';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Fetch the user's own custom fighters plus any shared with them through campaigns,
// de-duplicated by id.
async function getCombinedCustomFighters(supabase: SupabaseServerClient, userId: string) {
  const customFighters = await getUserCustomFighterTypes(userId);

  // Fetch shared custom fighters from campaigns the user is a member of
  const { data: campaignMembers } = await supabase
    .from('campaign_members')
    .select('campaign_id')
    .eq('user_id', userId);

  const campaignIds = campaignMembers?.map(cm => cm.campaign_id) || [];

  let sharedCustomFighters: any[] = [];
  if (campaignIds.length > 0) {
    const { data: sharedFighterIds } = await supabase
      .from('custom_shared')
      .select('custom_fighter_type_id')
      .in('campaign_id', campaignIds);

    const fighterIds = sharedFighterIds?.map(sf => sf.custom_fighter_type_id).filter(Boolean) || [];

    if (fighterIds.length > 0) {
      // Same edition embed as getUserCustomFighterTypes, so shared fighters
      // carry an edition_slug rather than losing their edition features.
      const { data: sharedFighters } = await supabase
        .from('custom_fighter_types')
        .select('*, editions:edition_id (slug)')
        .in('id', fighterIds);

      sharedCustomFighters = (sharedFighters || []).map(withEditionSlug);
    }
  }

  // Combine own and shared, removing duplicates
  const allCustomFighters: any[] = [...customFighters];
  sharedCustomFighters.forEach(shared => {
    if (!allCustomFighters.some(cf => cf.id === shared.id)) {
      allCustomFighters.push(shared);
    }
  });

  return allCustomFighters;
}

// Map a raw custom fighter row to the FighterType shape returned by this endpoint.
function transformCustomFighter(cf: any) {
  return {
    id: cf.id,
    fighter_type: cf.fighter_type,
    fighter_subtypes: cf.fighter_subtypes ?? [],
    gang_type: cf.gang_type,
    cost: cf.cost,
    gang_type_id: cf.gang_type_id,
    custom_gang_type_id: cf.custom_gang_type_id ?? null,
    special_rules: cf.special_rules || [],
    total_cost: cf.cost,
    movement: cf.movement,
    weapon_skill: cf.weapon_skill,
    ballistic_skill: cf.ballistic_skill,
    strength: cf.strength,
    toughness: cf.toughness,
    wounds: cf.wounds,
    initiative: cf.initiative,
    leadership: cf.leadership,
    cool: cf.cool,
    willpower: cf.willpower,
    intelligence: cf.intelligence,
    attacks: cf.attacks,
    save: cf.save ?? null,
    starting_xp: cf.starting_xp ?? null,
    edition_slug: cf.edition_slug ?? null,
    min_count: null,
    max_count: null,
    alignment: null,
    default_equipment: [],
    is_gang_addition: false,
    alliance_id: '',
    alliance_crew_name: '',
    equipment_selection: null,
    specialisation: null,
    fighter_specialisation_id: null,
    available_legacies: [],
    is_custom_fighter: true,
    free_skill: cf.free_skill || false,
    delegation_cost: cf.delegation_cost ?? null,
    is_vehicle: cf.is_vehicle ?? false,
    is_associated_pet: false,
    is_granted_with_fighter: false,
    associated_pet_owner_id: null
  };
}

// null means "no filter", which is what callers outside the gang add-modals want.
function filterByIsVehicle(rows: any[], isVehicleParam: string | null) {
  if (isVehicleParam === null) return rows;
  const wantVehicles = isVehicleParam === 'true';
  return rows.filter((type: any) => Boolean(type.is_vehicle) === wantVehicles);
}

function fighterTypesResponse(
  data: any[],
  isVehicleParam: string | null
) {
  const filtered = filterByIsVehicle(data, isVehicleParam);
  return NextResponse.json(withVariantGroups(filtered));
}

async function getGangEditionId(
  supabase: SupabaseServerClient,
  gangTypeId: string | null,
  customGangTypeId: string | null
) {
  if (gangTypeId) {
    const { data } = await supabase
      .from('gang_types')
      .select('edition_id')
      .eq('id', gangTypeId)
      .maybeSingle();
    return data?.edition_id ?? null;
  }
  if (customGangTypeId) {
    const { data } = await supabase
      .from('custom_gang_types')
      .select('edition_id')
      .eq('id', customGangTypeId)
      .maybeSingle();
    return data?.edition_id ?? null;
  }
  return null;
}

// Vehicles any gang of this edition may take. N23 spells this as vehicle_types.gang_type_id
// IS NULL; fighter_types.gang_type_id is NOT NULL, so the equivalent is the edition's
// "Available to All" gang type. Resolving nothing is normal, not an error.
async function getAvailableToAllFighterTypes(
  supabase: SupabaseServerClient,
  gangTypeId: string | null,
  customGangTypeId: string | null
) {
  const editionId = await getGangEditionId(supabase, gangTypeId, customGangTypeId);
  if (!editionId) return [];

  const { data: sharedGangType } = await supabase
    .from('gang_types')
    .select('id')
    .eq('gang_type', 'Available to All')
    .eq('edition_id', editionId)
    .maybeSingle();

  if (!sharedGangType?.id) return [];

  const { data, error } = await supabase.rpc('get_fighter_types_with_cost', {
    p_gang_type_id: sharedGangType.id,
    p_gang_affiliation_id: null,
    p_is_gang_addition: false
  });

  if (error) {
    console.error('Error fetching Available to All fighter types:', error);
    return [];
  }
  return data ?? [];
}

function mergeById(existing: any[], extra: any[]) {
  const seen = new Set(existing.map((row: any) => row.id));
  return [...existing, ...extra.filter((row: any) => !seen.has(row.id))];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');
  const gangTypeId = searchParams.get('gang_type_id');
  const gangAffiliationId = searchParams.get('gang_affiliation_id');
  const customGangTypeId = searchParams.get('custom_gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';
  const includeCustomFighters = searchParams.get('include_custom_fighters') === 'true';
  const includeAllGangType = searchParams.get('include_all_gang_type') === 'true';
  const includeAllTypes = searchParams.get('include_all_types') === 'true';
  // Tri-state: 'true' = vehicles only, 'false' = no vehicles, absent = unfiltered.
  const isVehicleParam = searchParams.get('is_vehicle');

  if (!gangId && !isGangAddition && !includeAllTypes) {
    return NextResponse.json({ error: 'Gang ID is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let data;

    // For custom gang types, skip system RPCs and only return custom fighters.
    // When the caller also asks for all fighter types, fall through to the
    // includeAllTypes branch below (which returns every system fighter type and
    // additionally appends this custom gang's own fighters).
    if (customGangTypeId && !includeAllTypes) {
      const allCustomFighters = await getCombinedCustomFighters(supabase, userId);

      // Filter to fighters matching this custom gang type, or "Available to All"
      data = allCustomFighters
        .filter(cf => {
          if (cf.custom_gang_type_id === customGangTypeId) return true;
          if (includeAllGangType && cf.gang_type?.toLowerCase().includes('available to all')) return true;
          return false;
        })
        .map(transformCustomFighter);

      if (isVehicleParam === 'true') {
        data = mergeById(data, await getAvailableToAllFighterTypes(supabase, gangTypeId, customGangTypeId));
      }

      return fighterTypesResponse(data, isVehicleParam);
    }

    if (includeAllTypes) {
      // Fetch all fighter types across all gang types. p_gang_id still applies this gang's rules,
      // so its own denied fighters stay out even here.
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: null,
        p_gang_affiliation_id: null,
        p_is_gang_addition: null,
        p_gang_id: gangId
      });

      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }

      data = result;

      // Filter out fighter types from hidden gang types
      const { data: hiddenGangTypes, error: hiddenError } = await supabase
        .from('gang_types')
        .select('id')
        .eq('is_hidden', true);

      if (hiddenError) {
        console.error('Error fetching hidden gang types:', hiddenError);
        throw hiddenError;
      }

      if (hiddenGangTypes && hiddenGangTypes.length > 0) {
        const hiddenIds = new Set(hiddenGangTypes.map(gt => gt.id));
        // The 'Subtype: <name>' pools are themselves hidden gang types, so a granted fighter has
        // to survive this filter — a rule put it in the list, not the catalogue.
        // Only subtype-scoped grants set is_gang_subtype, so an origin- or gang-type-scoped grant
        // pointing into a hidden pool would still be dropped here. None exist yet; widening the
        // flag is not the fix, since fighter-edit-modal renders gang_subtype_name off it.
        data = data.filter((fighter: any) =>
          fighter.is_gang_subtype || !hiddenIds.has(fighter.gang_type_id)
        );
      }

      // For a custom gang, keep its own custom fighters in the list alongside the
      // full set of system fighter types (mirrors how a regular gang's own fighters
      // are a subset of the "all types" result).
      if (customGangTypeId) {
        const allCustomFighters = await getCombinedCustomFighters(supabase, userId);
        const customData = allCustomFighters
          .filter(cf => {
            if (cf.custom_gang_type_id === customGangTypeId) return true;
            if (includeAllGangType && cf.gang_type?.toLowerCase().includes('available to all')) return true;
            return false;
          })
          .map(transformCustomFighter);
        data = [...data, ...customData];
      }
    } else if (isGangAddition) {
      // Use get_fighter_types_with_cost for gang additions (same as server action).
      // p_gang_id only resolves this gang's count limits here; the additions pool is the same
      // for every gang.
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
        p_gang_affiliation_id: gangAffiliationId || null,
        p_is_gang_addition: true,
        p_gang_id: gangId
      });
      
      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }
      
      data = result;
    } else {
      // Use the unified catalog function for regular (roster) fighters.
      // p_is_gang_addition=false reproduces the old get_add_fighter_details filter:
      // fighters of this gang type (incl. its gang-addition-flagged fighters).
      // p_gang_id applies fighter_type_availability: the gang's subtype pools in, its denied
      // fighters out.
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
        p_gang_affiliation_id: gangAffiliationId || null,
        p_is_gang_addition: false,
        p_gang_id: gangId
      });

      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }

      data = result;
    }

    // Add custom fighter types if requested.
    // Skip for custom gangs: their custom fighters are already appended in the
    // includeAllTypes branch (matched by custom_gang_type_id). Running this block for a
    // custom gang would over-match, because gangTypeId is null and custom-gang fighters
    // also have gang_type_id === null (null === null matches every custom-gang fighter).
    if (includeCustomFighters && !customGangTypeId) {
      try {
        const allCustomFighters = await getCombinedCustomFighters(supabase, userId);

        // Transform custom fighters to match the FighterType interface
        const transformedCustomFighters = allCustomFighters
          .filter(cf => {
            // gangTypeId is null on a custom gang, as is every custom-gang fighter's
            // gang_type_id — without the guard, null === null matches all of them.
            if (gangTypeId && cf.gang_type_id === gangTypeId) return true;

            if (cf.gang_type?.toLowerCase().includes('available to all')) return true;

            return false;
          })
          .map(transformCustomFighter);

        // Add custom fighters to the data
        data = [...data, ...transformedCustomFighters];
      } catch (error) {
        console.error('Error fetching custom fighters:', error);
        // Continue without custom fighters rather than failing
      }
    }

    // Also needed for include_all_types: "Available to All" is a hidden gang type, so the
    // hidden-gang-type filter above drops its vehicles.
    if (isVehicleParam === 'true') {
      data = mergeById(data, await getAvailableToAllFighterTypes(supabase, gangTypeId, customGangTypeId));
    }

    return fighterTypesResponse(data, isVehicleParam);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
