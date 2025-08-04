import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';
  const gangVariantsParam = searchParams.get('gang_variants');

  console.log('Received request for fighter types with gang_type_id:', gangTypeId, 'isGangAddition:', isGangAddition, 'gangVariants:', gangVariantsParam);

  if (!gangTypeId) {
    console.log('Error: Gang type ID is required');
    return NextResponse.json({ error: 'Gang type ID is required' }, { status: 400 });
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

    // Process gang variants if provided (same logic as get-fighter-types.ts)
    let gangVariants: Array<{id: string, variant: string}> = [];
    if (gangVariantsParam && !isGangAddition) {
      try {
        gangVariants = JSON.parse(gangVariantsParam);
      } catch (parseError) {
        console.error('Error parsing gang_variants parameter:', parseError);
        return NextResponse.json({ error: 'Invalid gang_variants parameter' }, { status: 400 });
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
