import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import { withEditionSlug } from "@/types/edition";
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getUserCustomGangTypes(userId: string, supabase: SupabaseClient): Promise<CustomGangType[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('custom_gang_types')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('gang_type', { ascending: true });

      if (error) {
        console.error('Error fetching custom gang types:', error);
        throw new Error(`Failed to fetch custom gang types: ${error.message}`);
      }

      return (data || []).map(withEditionSlug);
    },
    [`user-custom-gang-types-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
