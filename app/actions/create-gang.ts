'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateGangCreation, invalidateGangCount } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from 'next/cache';
import { duplicateCustomGangType } from '@/utils/duplicate-custom-gang-type';

interface CreateGangParams {
  name: string;
  gangTypeId: string;
  customGangTypeId?: string;
  gangType: string;
  alignment: string;
  gangAffiliationId?: string | null;
  gangOriginId?: string | null;
  credits?: number;
  gangVariants?: string[];
  defaultGangImage: number;
}

export async function createGang({
  name,
  gangTypeId,
  customGangTypeId,
  gangType,
  alignment,
  gangAffiliationId,
  gangOriginId,
  credits = 1000,
  gangVariants = [],
  defaultGangImage
}: CreateGangParams) {
  try {
    console.log('Server action: Creating gang:', name);
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // If using a shared custom gang type (owned by another user), duplicate it
    let effectiveCustomGangTypeId = customGangTypeId;
    if (customGangTypeId) {
      const { data: cgt } = await supabase
        .from('custom_gang_types')
        .select('user_id')
        .eq('id', customGangTypeId)
        .single();

      if (cgt && cgt.user_id !== user.id) {
        const result = await duplicateCustomGangType(supabase, customGangTypeId, user.id);
        effectiveCustomGangTypeId = result.newCustomGangTypeId;
        revalidatePath('/');
      }
    }

    // Insert the new gang (exclusive arc: gang_type_id or custom_gang_type_id, never both)
    const { data, error } = await supabase
      .from('gangs')
      .insert([{
        name: name.trimEnd(),
        credits: credits.toString(),
        reputation: "1",
        rating: 0,
        wealth: credits,
        user_id: user.id,
        gang_type_id: effectiveCustomGangTypeId ? null : gangTypeId,
        custom_gang_type_id: effectiveCustomGangTypeId || null,
        gang_type: gangType,
        alignment,
        gang_affiliation_id: gangAffiliationId || null,
        gang_origin_id: gangOriginId || null,
        gang_variants: gangVariants.length > 0 ? gangVariants : null,
        default_gang_image: defaultGangImage
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