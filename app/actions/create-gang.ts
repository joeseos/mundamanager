'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateGangCreation, invalidateGangCount } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface CreateGangParams {
  name: string;
  gangTypeId: string;
  gangType: string;
  alignment: string;
  gangAffiliationId?: string | null;
  gangOriginId?: string | null;
  credits?: number;
  gangVariants?: string[];
}

export async function createGang({
  name,
  gangTypeId,
  gangType,
  alignment,
  gangAffiliationId,
  gangOriginId,
  credits = 1000,
  gangVariants = []
}: CreateGangParams) {
  try {
    console.log('Server action: Creating gang:', name);
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);
    
    // Insert the new gang
    const { data, error } = await supabase
      .from('gangs')
      .insert([{
        name: name.trimEnd(),
        credits: credits.toString(),
        reputation: "1",
        rating: 0,
        wealth: credits,
        user_id: user.id,
        gang_type_id: gangTypeId,
        gang_type: gangType,
        alignment,
        gang_affiliation_id: gangAffiliationId || null,
        gang_origin_id: gangOriginId || null,
        gang_variants: gangVariants.length > 0 ? gangVariants : null
      }])
      .select();
    
    if (error) {
      console.error('Error creating gang:', error);
      throw error;
    }
    
    console.log('Gang created successfully, using granular cache invalidation');
    
    // Use granular gang creation invalidation
    invalidateGangCreation({
      gangId: data[0].id,
      userId: user.id
    });
    
    // Invalidate global gang count
    invalidateGangCount();
    
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