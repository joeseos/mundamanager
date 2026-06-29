import { unstable_cache } from 'next/cache';
import { createClient } from "@/utils/supabase/server";
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import { CACHE_TAGS } from "@/utils/cache-tags";

export async function getUserCustomGangTypes(userId: string): Promise<CustomGangType[]> {
  const supabase = await createClient();

  return unstable_cache(
    async () => {
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
    },
    [`user-custom-gang-types-${userId}`],
    {
      tags: [CACHE_TAGS.USER_CUSTOM_GANG_TYPES(userId)],
      revalidate: false,
    }
  )();
}
