import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  try {
    // Check for authenticated user (not admin required)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    
    console.log('GET request params:', { equipmentId });
    
    // This route is specifically for equipment filtering
    if (!equipmentId) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
    }
    
    console.log('Trying to find fighter effects for equipment ID:', equipmentId);
    console.log('Equipment ID type:', typeof equipmentId);
    
    // Try a raw SQL query approach for JSONB filtering
    try {
      // Execute a raw SQL query to properly filter by equipment_id in the JSONB
      const { data, error } = await supabase.from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `)
        .eq('type_specific_data->>equipment_id', equipmentId);
      
      if (error) {
        console.error('Error with SQL query:', error);
      } else {
        console.log('Found fighter effects with SQL query:', data?.length || 0);
        console.log('Equipment ID being searched:', equipmentId);
        console.log('Effect types found:', data?.map(d => ({ id: d.id, name: d.effect_name, equipment_id: d.type_specific_data?.equipment_id })));
        
        // If we have effect types, get the modifiers for each
        if (data && data.length > 0) {
          try {
            // Get all modifiers for these effect types
            const { data: modifiers, error: modifiersError } = await supabase
              .from('fighter_effect_type_modifiers')
              .select('*')
              .in('fighter_effect_type_id', data.map(effect => effect.id));
            
            if (modifiersError) {
              console.error('Error fetching modifiers:', modifiersError);
            } else {
              // Add modifiers to each fighter effect type
              const fighterEffectTypes = data.map(effect => ({
                ...effect,
                modifiers: modifiers ? modifiers.filter(m => m.fighter_effect_type_id === effect.id) : []
              }));
              
              return NextResponse.json(fighterEffectTypes);
            }
          } catch (e) {
            console.error('Error processing modifiers:', e);
          }
        }
        
        // If we get here, just return the data without modifiers
        return NextResponse.json(data || []);
      }
    } catch (e) {
      console.error('Error with SQL approach:', e);
    }
    
    // If SQL approach failed, try a different method
    console.log('SQL approach failed, falling back to manual filtering');
    try {
      const { data, error } = await supabase.from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `);
        
      if (error) {
        console.error('Error fetching all fighter effects:', error);
      } else {
        console.log('Fetched all effects for manual filtering:', data?.length || 0);
        // Manually filter on the client side
        const filteredData = data.filter(item => {
          try {
            const typeSpecificData = item.type_specific_data;
            const matches = typeSpecificData && 
                   typeSpecificData.equipment_id && 
                   typeSpecificData.equipment_id === equipmentId;
            if (matches) {
              console.log('Found matching effect:', item.effect_name, 'for equipment:', equipmentId);
            }
            return matches;
          } catch (e) {
            return false;
          }
        });
        
        console.log('Manually filtered data count:', filteredData.length);
        
        // If we have effect types, get the modifiers for each
        if (filteredData.length > 0) {
          try {
            // Get all modifiers for these effect types
            const { data: modifiers, error: modifiersError } = await supabase
              .from('fighter_effect_type_modifiers')
              .select('*')
              .in('fighter_effect_type_id', filteredData.map(effect => effect.id));
            
            if (modifiersError) {
              console.error('Error fetching modifiers:', modifiersError);
            } else {
              // Add modifiers to each fighter effect type
              const fighterEffectTypes = filteredData.map(effect => ({
                ...effect,
                modifiers: modifiers ? modifiers.filter(m => m.fighter_effect_type_id === effect.id) : []
              }));
              
              return NextResponse.json(fighterEffectTypes);
            }
          } catch (e) {
            console.error('Error processing modifiers:', e);
          }
        }
        
        // If we get here, just return the filtered data without modifiers
        return NextResponse.json(filteredData || []);
      }
    } catch (e) {
      console.error('Error with manual filtering approach:', e);
    }
    
    // If all approaches failed, return empty array
    console.log('All approaches failed, returning empty array');
    return NextResponse.json([]);
  } catch (error) {
    console.error('Unexpected error in GET /fighter-effects:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
} 