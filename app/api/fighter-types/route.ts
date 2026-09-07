import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserCustomFighterTypes } from '@/app/lib/customise/custom-fighters';
import { getUserIdFromClaims } from "@/utils/auth";
import { withEditionSlug } from '@/types/edition';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type GangSubtype = { id: string; subtype: string; edition_id: string | null };

// The gang properties fighter_type_availability scopes against.
type GangScope = {
  gangTypeId: string | null;
  gangOriginId: string | null;
  gangSubtypes: GangSubtype[];
};

// Fetch the user's own custom fighters plus any shared with them through campaigns,
// de-duplicated by id.
async function getCombinedCustomFighters(supabase: SupabaseServerClient, userId: string) {
  const customFighters = await getUserCustomFighterTypes(userId, supabase);

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
    fighter_subtypes: cf.fighter_subtypes || ['Custom'],
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
    edition_slug: cf.edition_slug ?? null,
    limitation: null,
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
    is_vehicle: cf.is_vehicle ?? false
  };
}

const subtypeKey = (row: any) =>
  ((row.fighter_subtypes ?? []) as string[]).map(s => s.toLowerCase().trim()).sort().join(',');

const containsAllSubtypes = (subtypes: string[], base: string[]) => {
  const have = new Set(subtypes.map(s => s.toLowerCase().trim()));
  return base.every(name => have.has(name.toLowerCase().trim()));
};

// include_all_types returns every edition at once and is only narrowed to the gang's own
// edition on the client, so the edition is part of the bucket: a family never spans two.
const familyBucket = (row: any) => `${row.edition_slug ?? ''}::${row.fighter_type}`;

/**
 * Tags each row with its variant family — same fighter_type, and one row's subtype set
 * containing the other's — named after the family's smallest (base) set. N26 variants can
 * add a subtype, "Master of Shadow (Leader)" next to "(Leader, Wyrd)", which an exact
 * subtype match lists as unrelated fighters. Disjoint sets stay apart, so N23's
 * "Gunner (Ganger)" and "Gunner (Specialist)" keep their own entries.
 */
function withVariantGroups(rows: any[]) {
  const byBucket = new Map<string, any[]>();
  for (const row of rows) {
    const group = byBucket.get(familyBucket(row));
    if (group) group.push(row);
    else byBucket.set(familyBucket(row), [row]);
  }

  const baseOfSet = new Map<string, { key: string; names: string[] }>();

  for (const [bucket, group] of byBucket) {
    const sets = new Map<string, string[]>();
    for (const row of group) {
      if (!sets.has(subtypeKey(row))) sets.set(subtypeKey(row), row.fighter_subtypes ?? []);
    }

    const bases: Array<{ key: string; names: string[] }> = [];
    const smallestFirst = [...sets].sort(([keyA, a], [keyB, b]) =>
      a.length - b.length || keyA.localeCompare(keyB)
    );

    for (const [key, names] of smallestFirst) {
      const base = bases
        .filter(candidate => containsAllSubtypes(names, candidate.names))
        .sort((a, b) => b.names.length - a.names.length)[0];
      if (!base) bases.push({ key, names });
      baseOfSet.set(`${bucket}::${key}`, base ?? { key, names });
    }
  }

  return rows.map(row => {
    const base = baseOfSet.get(`${familyBucket(row)}::${subtypeKey(row)}`)!;
    const inBase = new Set(base.names.map(name => name.toLowerCase().trim()));
    const added = ((row.fighter_subtypes ?? []) as string[]).filter(
      name => !inBase.has(name.toLowerCase().trim())
    );
    return {
      ...row,
      typeSubtypeKey: `${familyBucket(row)}::${base.key}`,
      variantLabel:
        row.fighter_variant || row.specialisation?.specialisation_name || added.join(', ') || 'Default',
    };
  });
}

// null means "no filter", which is what callers outside the gang add-modals want.
function filterByIsVehicle(rows: any[], isVehicleParam: string | null) {
  if (isVehicleParam === null) return rows;
  const wantVehicles = isVehicleParam === 'true';
  return rows.filter((type: any) => Boolean(type.is_vehicle) === wantVehicles);
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
      .eq('gang_type_id', gangTypeId)
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
    .select('gang_type_id')
    .eq('gang_type', 'Available to All')
    .eq('edition_id', editionId)
    .maybeSingle();

  if (!sharedGangType?.gang_type_id) return [];

  const { data, error } = await supabase.rpc('get_fighter_types_with_cost', {
    p_gang_type_id: sharedGangType.gang_type_id,
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

/**
 * Applies fighter_type_availability to the gang's own pool: denies first, then grants.
 *
 * Order is load-bearing. Secundan Incursion denies 'Leader' and grants four Spyre Hunters that
 * are themselves ["Leader"], so a deny evaluated over the appended grants would leave those
 * gangs with no addable leader at all. Denies only ever narrow the gang type's own fighters;
 * grants only ever add.
 */
async function applyAvailabilityRules(
  supabase: SupabaseServerClient,
  rows: any[],
  scope: GangScope
) {
  const subtypeIds = scope.gangSubtypes.map(subtype => subtype.id);

  // Fetch anything matching on at least one axis; the conjunction below does the real filtering.
  const axisMatches = [
    subtypeIds.length > 0 ? `gang_subtype_id.in.(${subtypeIds.join(',')})` : null,
    scope.gangOriginId ? `gang_origin_id.eq.${scope.gangOriginId}` : null,
    scope.gangTypeId ? `gang_type_id.eq.${scope.gangTypeId}` : null,
  ].filter((clause): clause is string => clause !== null);

  if (axisMatches.length === 0) return rows;

  const { data: candidates, error } = await supabase
    .from('fighter_type_availability')
    .select('fighter_type_id, fighter_subtype, gang_type_id, gang_origin_id, gang_subtype_id, excluded')
    .or(axisMatches.join(','));

  // Returning the rows unfiltered is the safer degradation — it offers too many fighters rather
  // than hiding a gang's roster — but it is indistinguishable from a gang with no rules, so say so.
  if (error) {
    console.error('Error fetching fighter type availability:', error);
    return rows;
  }

  // Every non-NULL axis must match: the JS twin of the (X IS NULL OR X = ...) conjunction
  // get_equipment_detailed_data.sql uses for the same three axes.
  const held = new Set(subtypeIds);
  const rules = (candidates ?? []).filter((rule: any) =>
    (rule.gang_subtype_id === null || held.has(rule.gang_subtype_id)) &&
    (rule.gang_origin_id === null || rule.gang_origin_id === scope.gangOriginId) &&
    (rule.gang_type_id === null || rule.gang_type_id === scope.gangTypeId)
  );

  if (rules.length === 0) return rows;

  const denies = rules.filter((rule: any) => rule.excluded);
  const deniedIds = new Set(
    denies.map((rule: any) => rule.fighter_type_id).filter((id: string | null): id is string => id !== null)
  );
  const deniedSubtypes = new Set(
    denies.map((rule: any) => rule.fighter_subtype).filter((name: string | null): name is string => name !== null)
  );

  let result = rows.filter((type: any) =>
    !deniedIds.has(type.id) &&
    !((type.fighter_subtypes ?? []) as string[]).some(name => deniedSubtypes.has(name))
  );

  const grants = rules.filter((rule: any) => !rule.excluded);
  const grantedIds = [...new Set<string>(grants.map((rule: any) => rule.fighter_type_id))];
  if (grantedIds.length === 0) return result;

  // A granted fighter still needs its adjusted cost, equipment and skills, so it comes back
  // through the same RPC as the gang's own roster — reached by the fighter's own gang type
  // rather than by the 'Subtype: <name>' string match this replaces.
  const { data: granted, error: grantedError } = await supabase
    .from('fighter_types')
    .select('id, gang_type_id')
    .in('id', grantedIds);

  if (grantedError) {
    console.error('Error resolving granted fighter types:', grantedError);
    return result;
  }

  // Name the subtype that granted each fighter, so the UI still groups it as a subtype addition.
  // A row scoped only by origin or gang type carries no subtype name and stays untagged.
  const subtypeNameById = new Map(scope.gangSubtypes.map(subtype => [subtype.id, subtype.subtype]));
  const grantedBy = new Map<string, string>();
  for (const rule of grants) {
    const name = rule.gang_subtype_id ? subtypeNameById.get(rule.gang_subtype_id) : undefined;
    if (name && !grantedBy.has(rule.fighter_type_id)) grantedBy.set(rule.fighter_type_id, name);
  }

  const wanted = new Set(grantedIds);
  const pools = new Set<string>((granted ?? []).map((row: any) => row.gang_type_id));

  for (const poolGangTypeId of pools) {
    const { data: poolRows, error: poolError } = await supabase.rpc('get_fighter_types_with_cost', {
      p_gang_type_id: poolGangTypeId,
      p_gang_affiliation_id: null,
      p_is_gang_addition: false
    });

    if (poolError) {
      console.error('Error fetching granted fighter pool:', poolError);
      continue;
    }

    const additions = (poolRows ?? [])
      .filter((type: any) => wanted.has(type.id))
      .map((type: any) => {
        const subtypeName = grantedBy.get(type.id);
        return subtypeName
          ? { ...type, is_gang_subtype: true, gang_subtype_name: subtypeName }
          : type;
      });

    result = mergeById(result, additions);
  }

  return result;
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

      return NextResponse.json(withVariantGroups(filterByIsVehicle(data, isVehicleParam)));
    }

    if (includeAllTypes) {
      // Fetch all fighter types across all gang types
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: null,
        p_gang_affiliation_id: null,
        p_is_gang_addition: null
      });

      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }

      data = result;

      // Filter out fighter types from hidden gang types
      const { data: hiddenGangTypes, error: hiddenError } = await supabase
        .from('gang_types')
        .select('gang_type_id')
        .eq('is_hidden', true);

      if (hiddenError) {
        console.error('Error fetching hidden gang types:', hiddenError);
        throw hiddenError;
      }

      if (hiddenGangTypes && hiddenGangTypes.length > 0) {
        const hiddenIds = new Set(hiddenGangTypes.map(gt => gt.gang_type_id));
        data = data.filter((fighter: any) => !hiddenIds.has(fighter.gang_type_id));
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
      // Use get_fighter_types_with_cost for gang additions (same as server action)
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
        p_gang_affiliation_id: gangAffiliationId || null,
        p_is_gang_addition: true
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
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
        p_gang_affiliation_id: gangAffiliationId || null,
        p_is_gang_addition: false
      });

      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }

      data = result;
    }

    // Fighter types this gang's scope grants or denies. Gang additions are out of scope: the
    // generic Brutes and Hired Guns they return belong to no gang type in particular.
    if (!isGangAddition) {
      let gangSubtypes: GangSubtype[] = [];
      let gangOriginId: string | null = null;

      try {
        const { data: gangData, error: gangError } = await supabase
          .from('gangs')
          .select('gang_subtypes, gang_origin_id')
          .eq('id', gangId)
          .single();

        if (gangError) {
          console.error('Error fetching gang data:', gangError);
          throw gangError;
        }

        gangOriginId = gangData.gang_origin_id ?? null;

        // If gang has subtypes, fetch the subtype details
        if (Array.isArray(gangData.gang_subtypes) && gangData.gang_subtypes.length > 0) {
          const { data: subtypeDetails, error: subtypeError } = await supabase
            .from('gang_subtype_types')
            .select('id, subtype, edition_id')
            .in('id', gangData.gang_subtypes);

          if (subtypeError) {
            console.error('Error fetching subtype details:', subtypeError);
            throw subtypeError;
          }

          gangSubtypes = subtypeDetails ?? [];
        }
      } catch (error) {
        // Continue without a scope rather than failing
        gangSubtypes = [];
        gangOriginId = null;
      }

      data = await applyAvailabilityRules(supabase, data, {
        gangTypeId,
        gangOriginId,
        gangSubtypes,
      });
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
            // Include custom fighters for the current gang type
            if (cf.gang_type_id === gangTypeId) return true;

            // Also include "Available to All" gang type fighters
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

    // include_all_types already returns every gang type's fighters, shared ones included.
    if (isVehicleParam === 'true' && !includeAllTypes) {
      data = mergeById(data, await getAvailableToAllFighterTypes(supabase, gangTypeId, customGangTypeId));
    }

    return NextResponse.json(withVariantGroups(filterByIsVehicle(data, isVehicleParam)));
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
