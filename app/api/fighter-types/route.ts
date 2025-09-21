import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';
import { getUserCustomFighterTypes } from '@/app/lib/customise/custom-fighters';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';
  const includeCustomFighters = searchParams.get('include_custom_fighters') === 'true';
  const includeAllGangType = searchParams.get('include_all_gang_type') === 'true';


  if (!gangId && !isGangAddition) {
    return NextResponse.json({ error: 'Gang ID is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let data;
    
    if (isGangAddition) {
      // Use get_fighter_types_with_cost for gang additions (same as server action)
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
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
        p_gang_type_id: gangTypeId
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
        const customFighters = await getUserCustomFighterTypes(user.id);

        // Transform custom fighters to match the FighterType interface
        const transformedCustomFighters = customFighters
          .filter(cf => {
            // Include custom fighters for the current gang type
            if (cf.gang_type_id === gangTypeId) return true;

            // If includeAllGangType is true, also include "Available to All" gang type fighters
            if (includeAllGangType && cf.gang_type === 'Available to All') return true;

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
            is_custom_fighter: true // Mark as custom fighter
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
