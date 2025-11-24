import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export interface CustomEquipment {
  id: string;
  user_id: string;
  equipment_name: string;
  availability: string;
  cost: number;
  faction?: string;
  variant?: string;
  equipment_category?: string;
  equipment_category_id?: string;
  equipment_type?: string;
  created_at: string;
  updated_at?: string;
}

export async function getUserCustomEquipment(userId: string): Promise<CustomEquipment[]> {
  const supabase = await createClient();
  
  const { data: customEquipment, error } = await supabase
    .from('custom_equipment')
    .select('*')
    .eq('user_id', userId)
    .order('equipment_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom equipment:', error);
    throw new Error(`Failed to fetch custom equipment: ${error.message}`);
  }

  return customEquipment || [];
}

export async function getUserCustomEquipmentByCategory(category?: string): Promise<CustomEquipment[]> {
  const supabase = await createClient();

  // Get the current user
  const userId = await getUserIdFromClaims(supabase);

  if (!userId) {
    throw new Error('Unauthorized');
  }

  let query = supabase
    .from('custom_equipment')
    .select('*')
    .eq('user_id', userId);

  // Apply category filter if specified
  if (category) {
    query = query.eq('equipment_category', category);
  }

  const { data: customEquipment, error } = await query.order('equipment_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom equipment by category:', error);
    throw new Error(`Failed to fetch custom equipment: ${error.message}`);
  }

  return customEquipment || [];
} 