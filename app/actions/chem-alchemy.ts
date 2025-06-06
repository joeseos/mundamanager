'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

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
        equipment_name: name,
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

    // Add the custom equipment to the gang's stash
    const { data: stashItem, error: stashError } = await supabase
      .from('gang_stash')
      .insert([{
        gang_id: gangId,
        custom_equipment_id: customEquipment.id,
        cost: useBaseCostForRating ? baseCost : totalCost,
        is_master_crafted: false
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

    console.log('Chem-alchemy created successfully, revalidating path');
    
    // Revalidate the gang page to show the new stash item
    revalidatePath(`/gang/${gangId}`);
    
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