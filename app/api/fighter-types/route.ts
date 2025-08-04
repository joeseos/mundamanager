import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';

  console.log('Received request for fighter types with gang_id:', gangId, 'gang_type_id:', gangTypeId, 'isGangAddition:', isGangAddition);

  if (!gangId && !isGangAddition) {
    console.log('Error: Gang ID is required');
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

        console.log('API Route: Gang data fetched:', gangData);

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
          console.log('API Route: Gang variants fetched:', gangVariants);
        } else {
          console.log('API Route: No gang variants found');
        }
      } catch (error) {
        console.error('Error processing gang variants:', error);
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

    console.log('Fighter types fetched:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
