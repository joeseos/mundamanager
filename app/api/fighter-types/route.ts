import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';
import { getUserCustomFighterTypes } from '@/app/lib/customise/custom-fighters';
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');
  const gangTypeId = searchParams.get('gang_type_id');
  const gangAffiliationId = searchParams.get('gang_affiliation_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';
  const includeCustomFighters = searchParams.get('include_custom_fighters') === 'true';
  const includeAllGangType = searchParams.get('include_all_gang_type') === 'true';
  const includeAllTypes = searchParams.get('include_all_types') === 'true';


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
      const { data: hiddenGangTypes } = await supabase
        .from('gang_types')
        .select('gang_type_id')
        .eq('is_hidden', true);

      if (hiddenGangTypes && hiddenGangTypes.length > 0) {
        const hiddenIds = new Set(hiddenGangTypes.map(gt => gt.gang_type_id));
        data = data.filter((fighter: any) => !hiddenIds.has(fighter.gang_type_id));
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
      // Use get_add_fighter_details for regular fighters (same as server action)
      const { data: result, error } = await supabase.rpc('get_add_fighter_details', {
        p_gang_type_id: gangTypeId,
        p_gang_affiliation_id: gangAffiliationId || null
      });
      
      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }
      
      data = result;
    }

    // Fetch gang variants from the database
    let gangVariants: Array<{id: string, variant: string}> = [];
    if (!isGangAddition) {
      try {
        // Get gang data including gang_variants
        const { data: gangData, error: gangError } = await supabase
          .from('gangs')
          .select('gang_variants')
          .eq('id', gangId)
          .single();

        if (gangError) {
          console.error('Error fetching gang data:', gangError);
          throw gangError;
        }


        // If gang has variants, fetch the variant details
        if (gangData.gang_variants && Array.isArray(gangData.gang_variants) && gangData.gang_variants.length > 0) {
          const { data: variantDetails, error: variantError } = await supabase
            .from('gang_variant_types')
            .select('id, variant')
            .in('id', gangData.gang_variants);

          if (variantError) {
            console.error('Error fetching variant details:', variantError);
            throw variantError;
          }

          gangVariants = variantDetails || [];
        } else {
        }
      } catch (error) {
        // Continue without variants rather than failing
        gangVariants = [];
      }

      if (gangVariants.length > 0) {
        for (const variant of gangVariants) {
          const variantModifier = gangVariantFighterModifiers[variant.id];
          if (!variantModifier) continue;

          // Apply variant rules (like removing Leaders)
          if (variantModifier.removeLeaders) {
            data = data.filter((type: any) => type.fighter_class !== 'Leader');
          }

          // Fetch variant-specific fighter types and merge
          const { data: variantData, error: variantError } = await supabase.rpc('get_add_fighter_details', {
            p_gang_type_id: variantModifier.variantGangTypeId
          });
          
          if (!variantError && variantData) {
            // Mark these as gang variant fighter types
            const markedVariantData = variantData.map((type: any) => ({
              ...type,
              is_gang_variant: true,
              gang_variant_name: variant.variant
            }));
            data = [...data, ...markedVariantData];
          }
        }
      }
    }

    // Add custom fighter types if requested
    if (includeCustomFighters && !isGangAddition) {
      try {
        // Fetch user's own custom fighters
        const customFighters = await getUserCustomFighterTypes(userId);

        // Fetch shared custom fighters from campaigns where user is a member (any role)
        const { data: campaignMembers } = await supabase
          .from('campaign_members')
          .select('campaign_id')
          .eq('user_id', userId);

        const campaignIds = campaignMembers?.map(cm => cm.campaign_id) || [];

        let sharedCustomFighters: any[] = [];
        if (campaignIds.length > 0) {
          // Get shared custom fighter IDs for these campaigns
          const { data: sharedFighterIds } = await supabase
            .from('custom_shared')
            .select('custom_fighter_type_id')
            .in('campaign_id', campaignIds);

          const fighterIds = sharedFighterIds?.map(sf => sf.custom_fighter_type_id) || [];

          if (fighterIds.length > 0) {
            // Fetch the actual custom fighter data
            const { data: sharedFighters } = await supabase
              .from('custom_fighter_types')
              .select('*')
              .in('id', fighterIds);

            sharedCustomFighters = sharedFighters || [];
          }
        }

        // Combine own and shared custom fighters, removing duplicates
        const allCustomFighters = [...customFighters];
        sharedCustomFighters.forEach(shared => {
          if (!allCustomFighters.some(cf => cf.id === shared.id)) {
            allCustomFighters.push(shared);
          }
        });

        // Transform custom fighters to match the FighterType interface
        const transformedCustomFighters = allCustomFighters
          .filter(cf => {
            // Include custom fighters for the current gang type
            if (cf.gang_type_id === gangTypeId) return true;

            // If includeAllGangType is true, also include "Available to All" gang type fighters
            if (includeAllGangType && cf.gang_type?.toLowerCase().includes('available to all')) return true;

            return false;
          })
          .map(cf => ({
            id: cf.id,
            fighter_type: cf.fighter_type,
            fighter_class: cf.fighter_class || 'Custom',
            gang_type: cf.gang_type,
            cost: cf.cost,
            gang_type_id: cf.gang_type_id,
            special_rules: cf.special_rules || [],
            total_cost: cf.cost, // Use the cost as total_cost
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
            limitation: null,
            alignment: null,
            default_equipment: [],
            is_gang_addition: false,
            alliance_id: '',
            alliance_crew_name: '',
            equipment_selection: null,
            sub_type: null,
            fighter_sub_type_id: null,
            available_legacies: [],
            is_custom_fighter: true, // Mark as custom fighter
            free_skill: cf.free_skill || false
          }));

        // Add custom fighters to the data
        data = [...data, ...transformedCustomFighters];
      } catch (error) {
        console.error('Error fetching custom fighters:', error);
        // Continue without custom fighters rather than failing
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
