import { createClient } from "@/utils/supabase/server";

export interface CustomTerritory {
  id: string;
  user_id: string;
  territory_name: string;
  campaign_type_id?: string;
  created_at: string;
  updated_at?: string;
}

export async function getUserCustomTerritories(campaignTypeId?: string): Promise<CustomTerritory[]> {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  let query = supabase
    .from('custom_territories')
    .select('*')
    .eq('user_id', user.id);

  // Apply campaign type filter if specified
  if (campaignTypeId) {
    query = query.eq('campaign_type_id', campaignTypeId);
  }

  const { data: customTerritories, error } = await query.order('territory_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom territories:', error);
    throw new Error(`Failed to fetch custom territories: ${error.message}`);
  }

  return customTerritories || [];
}

export async function getUserCustomTerritoriesByType(campaignTypeId?: string): Promise<CustomTerritory[]> {
  return getUserCustomTerritories(campaignTypeId);
}