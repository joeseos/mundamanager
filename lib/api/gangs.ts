import { createClient } from '@/utils/supabase/client';

export const gangsApi = {
  getBasic: async (gangId: string) => {
    const supabase = createClient();
    // Start with a simple query first
    const { data, error } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_type_id,
        gang_colour,
        reputation,
        meat,
        scavenging_rolls,
        exploration_points,
        alignment,
        note,
        gang_affiliation_id,
        gang_affiliation:gang_affiliation_id (
          id,
          name
        )
      `)
      .eq('id', gangId)
      .single();
    
    if (error) {
      console.error('Gang query error:', error);
      throw error;
    }
    return data;
  },
  
  getCredits: async (gangId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('gangs')
      .select('credits')
      .eq('id', gangId)
      .single();
    
    if (error) throw error;
    return data?.credits || 0;
  },
  
  getPositioning: async (gangId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('gangs')
      .select('positioning')
      .eq('id', gangId)
      .single();
    
    if (error) throw error;
    
    return data?.positioning || {};
  },
  
  getFighters: async (gangId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, xp')
      .eq('gang_id', gangId);
    
    if (error) throw error;
    return data;
  },
};