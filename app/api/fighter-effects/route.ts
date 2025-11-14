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
    const powerBoostTypeId = searchParams.get('powerBoostTypeId');

    console.log('GET request params:', { equipmentId, powerBoostTypeId });

    // This route supports both equipment and power boost filtering
    if (!equipmentId && !powerBoostTypeId) {
      return NextResponse.json({ error: 'Equipment ID or Power Boost Type ID is required' }, { status: 400 });
    }

    const filterField = equipmentId ? 'equipment_id' : 'power_boost_type_id';
    const filterValue = equipmentId || powerBoostTypeId;

    console.log('Trying to find fighter effects for', filterField, ':', filterValue);
    console.log('Filter value type:', typeof filterValue);

    // Try a raw SQL query approach for JSONB filtering
    try {
      // Execute a raw SQL query to properly filter by equipment_id or power_boost_type_id in the JSONB
      const { data, error } = await supabase.from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `)
        .eq(`type_specific_data->>${filterField}`, filterValue);
      
      if (error) {
        console.error('Error with SQL query:', error);
      } else {
        console.log('Found fighter effects with SQL query:', data?.length || 0);
        console.log(`${filterField} being searched:`, filterValue);
        console.log('Effect types found:', data?.map(d => ({ id: d.id, name: d.effect_name, filter_value: d.type_specific_data?.[filterField] })));
        
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
                   typeSpecificData[filterField] &&
                   typeSpecificData[filterField] === filterValue;
            if (matches) {
              console.log('Found matching effect:', item.effect_name, 'for', filterField, ':', filterValue);
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