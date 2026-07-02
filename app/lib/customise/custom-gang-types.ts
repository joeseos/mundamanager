import { cacheTag, cacheLife } from 'next/cache';
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { createServiceRoleClient } from '@/utils/supabase/server';

export async function getUserCustomGangTypes(userId: string): Promise<CustomGangType[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(CACHE_TAGS.USER_CUSTOM_GANG_TYPES(userId));

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('custom_gang_types')
    .select('*')
    .eq('user_id', userId)
    .order('gang_type', { ascending: true });

  if (error) {
    console.error('Error fetching custom gang types:', error);
    throw new Error(`Failed to fetch custom gang types: ${error.message}`);
  }

  return data || [];
}
