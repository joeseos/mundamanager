'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateGangStash, invalidateUserCustomizations, invalidateGangCredits } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface ChemEffect {
  name: string;
  cost: number;
}

interface CreateChemAlchemyParams {
  name: string;
  type: 'stimm' | 'gaseous' | 'toxic';
  effects: ChemEffect[];
  totalCost: number;
  gangId: string;
  useBaseCostForRating: boolean;
  baseCost: number;
}

export async function createChemAlchemy({
  name,
  type,
  effects,
  totalCost,
  gangId,
  useBaseCostForRating,
  baseCost
}: CreateChemAlchemyParams) {
  try {
    console.log('Server action: Creating chem-alchemy:', name);
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if gang has enough credits
    const { data: gangData, error: gangFetchError } = await supabase
      .from('gangs')
      .select('credits')
      .eq('id', gangId)
      .single();

    if (gangFetchError) {
      console.error('Error fetching gang credits:', gangFetchError);
      throw new Error('Failed to fetch gang information');
    }

    if (gangData.credits < totalCost) {
      throw new Error('Not enough credits');
    }

    // Create the custom equipment entry
    const { data: customEquipment, error: customEquipmentError } = await supabase
      .from('custom_equipment')
      .insert([{
        equipment_name: name.trimEnd(),
        trading_post_category: 'Chem-Alchemy',
        availability: 'E',
        cost: useBaseCostForRating ? baseCost : totalCost,
        equipment_category: 'Chem-Alchemy',
        equipment_category_id: '258bcb60-5f87-4c55-b1b6-bbdddc7d1fc3',
        equipment_type: 'wargear',
        user_id: user.id,
        variant: `${type} - ${effects.map(e => e.name).join(', ')}`
      }])
      .select()
      .single();

    if (customEquipmentError) {
      console.error('Error creating custom equipment:', customEquipmentError);
      throw customEquipmentError;
    }

    // Add the custom equipment to the gang's stash using unified fighter_equipment table
    const { data: stashItem, error: stashError } = await supabase
      .from('fighter_equipment')
      .insert([{
        gang_id: gangId,
        fighter_id: null,
        vehicle_id: null,
        custom_equipment_id: customEquipment.id,
        purchase_cost: useBaseCostForRating ? baseCost : totalCost,
        gang_stash: true,
        is_master_crafted: false,
        user_id: user.id
      }])
      .select()
      .single();

    if (stashError) {
      console.error('Error adding to gang stash:', stashError);
      throw stashError;
    }

    // Deduct credits from gang
    const { error: creditUpdateError } = await supabase
      .from('gangs')
      .update({ credits: gangData.credits - totalCost })
      .eq('id', gangId);

    if (creditUpdateError) {
      console.error('Error updating gang credits:', creditUpdateError);
      throw creditUpdateError;
    }

    console.log('Chem-alchemy created successfully, using granular cache invalidation');
    
    // Invalidate gang credits since we deducted credits
    invalidateGangCredits(gangId);
    
    // Invalidate gang stash to show the new item
    invalidateGangStash({
      gangId: gangId,
      userId: user.id
    });
    
    // Invalidate user customizations since we created custom equipment
    invalidateUserCustomizations({
      userId: user.id
    });
    
    return { 
      success: true, 
      data: {
        customEquipment,
        stashItem
      }
    };
  } catch (error) {
    console.error('Error in createChemAlchemy server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 