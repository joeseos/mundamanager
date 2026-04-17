import { createClient } from "@/utils/supabase/server";
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";

export async function getUserCustomGangTypes(userId: string): Promise<CustomGangType[]> {
  const supabase = await createClient();

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
