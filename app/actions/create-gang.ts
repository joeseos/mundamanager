'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { logCustomEvent } from './gang-logs';

interface CreateGangParams {
  name: string;
  gangTypeId: string;
  gangType: string;
  alignment: string;
}

export async function createGang({ 
  name, 
  gangTypeId,
  gangType,
  alignment
}: CreateGangParams) {
  try {
    console.log('Server action: Creating gang:', name);
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Insert the new gang
    const { data, error } = await supabase
      .from('gangs')
      .insert([{
        name: name.trimEnd(),
        credits: "1000",
        reputation: "1",
        user_id: user.id,
        gang_type_id: gangTypeId,
        gang_type: gangType,
        alignment
      }])
      .select();
    
    if (error) {
      console.error('Error creating gang:', error);
      throw error;
    }

    const createdGang = data[0];
    
    // Add gang logging for gang creation
    await logCustomEvent(
      createdGang.id,
      'gang_created',
      `Gang "${name.trimEnd()}" created with ${gangType} gang type and ${alignment} alignment (1000 credits, 1 reputation)`
    );
    
    console.log('Gang created successfully, revalidating path');
    
    // Revalidate the page according to Next.js best practices
    revalidatePath('/');
    
    return { 
      success: true, 
      data
    };
  } catch (error) {
    console.error('Error in createGang server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 