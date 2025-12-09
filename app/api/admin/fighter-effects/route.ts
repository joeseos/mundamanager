import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  try {
    // Check for admin access
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const equipmentId = searchParams.get('equipmentId');
    const categoryId = searchParams.get('categoryId');
    const fetchCategories = searchParams.get('categories') === 'true';
    const fetchModifiers = searchParams.get('modifiers') === 'true';
    const modifierId = searchParams.get('modifier_id');

    // Handle categories request
    if (fetchCategories) {
      const { data, error } = await supabase
        .from('fighter_effect_categories')
        .select('*')
        .order('category_name');
      
      if (error) {
        console.error('Error fetching fighter effect categories:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(data || []);
    }
    
    // Handle specific modifier request
    if (modifierId) {
      const { data, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .select('*')
        .eq('id', modifierId)
        .single();
      
      if (error) {
        console.error('Error fetching modifier:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(data);
    }
    
    // Handle specific modifiers request for an effect type
    if (fetchModifiers && id) {
      const { data, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .select('*')
        .eq('fighter_effect_type_id', id);
      
      if (error) {
        console.error('Error fetching modifiers:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(data || []);
    }
    
    // Handle equipment filtering
    if (equipmentId) {
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
      
      // If SQL approach failed, try a different method (manual filtering)
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
          // Manually filter on the client side
          const filteredData = data.filter(item => {
            try {
              const typeSpecificData = item.type_specific_data;
              return typeSpecificData && 
                     typeSpecificData.equipment_id && 
                     typeSpecificData.equipment_id === equipmentId;
            } catch (e) {
              return false;
            }
          });
          
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
      return NextResponse.json([]);
    }

    // Handle category filtering
    if (categoryId) {
      const { data, error } = await supabase
        .from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `)
        .eq('fighter_effect_category_id', categoryId)
        .order('effect_name');

      if (error) {
        console.error('Error fetching fighter effects by category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Get modifiers for each effect type
      if (data && data.length > 0) {
        const { data: modifiers, error: modifiersError } = await supabase
          .from('fighter_effect_type_modifiers')
          .select('*')
          .in('fighter_effect_type_id', data.map(effect => effect.id));

        if (modifiersError) {
          console.error('Error fetching modifiers:', modifiersError);
          return NextResponse.json({ error: modifiersError.message }, { status: 500 });
        }

        // Add modifiers to each fighter effect type
        const fighterEffectTypes = data.map(effect => ({
          ...effect,
          modifiers: modifiers ? modifiers.filter(m => m.fighter_effect_type_id === effect.id) : []
        }));

        return NextResponse.json(fighterEffectTypes);
      }

      return NextResponse.json(data || []);
    }

    // Default query if no equipment_id or categoryId is provided
    let query = supabase
      .from('fighter_effect_types')
      .select(`
        id,
        effect_name,
        fighter_effect_category_id,
        type_specific_data,
        fighter_effect_categories(id, category_name)
      `);
    
    if (id) {
      query = query.eq('id', id);
    }
    
    let { data: fighterEffectTypes, error } = await query;
    
    if (error) {
      console.error('Error fetching fighter effects:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // If we have effect types, get the modifiers for each
    if (fighterEffectTypes && fighterEffectTypes.length > 0) {
      try {
        // Get all modifiers for these effect types
        const { data: modifiers, error: modifiersError } = await supabase
          .from('fighter_effect_type_modifiers')
          .select('*')
          .in('fighter_effect_type_id', fighterEffectTypes.map(effect => effect.id));
        
        if (modifiersError) {
          console.error('Error fetching modifiers:', modifiersError);
          return NextResponse.json({ error: modifiersError.message }, { status: 500 });
        }
        
        // Add modifiers to each fighter effect type
        fighterEffectTypes = fighterEffectTypes.map(effect => ({
          ...effect,
          modifiers: modifiers ? modifiers.filter(m => m.fighter_effect_type_id === effect.id) : []
        }));
      } catch (modifierError) {
        console.error('Error processing modifiers:', modifierError);
        return NextResponse.json({ error: 'Error processing modifiers' }, { status: 500 });
      }
    }
    
    return NextResponse.json(fighterEffectTypes || []);
  } catch (error) {
    console.error('Unexpected error in GET /fighter-effects:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  try {
    // Check for admin access
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    
    // Check if this is a category request
    if (body.request_type === 'category') {
      // Validate required fields
      if (!body.category_name) {
        return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
      }
      
      // Create fighter effect category
      const { data, error } = await supabase
        .from('fighter_effect_categories')
        .insert({
          category_name: body.category_name
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating fighter effect category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(data);
    }
    
    // Check if this is a modifier request
    if (body.fighter_effect_type_id && body.stat_name !== undefined) {
      // Validate required fields
      if (!body.fighter_effect_type_id || !body.stat_name) {
        return NextResponse.json({ error: 'Fighter effect type ID and stat name are required' }, { status: 400 });
      }
      
      // Create fighter effect type modifier
      try {
        const { data, error } = await supabase
          .from('fighter_effect_type_modifiers')
          .insert({
            fighter_effect_type_id: body.fighter_effect_type_id,
            stat_name: body.stat_name,
            default_numeric_value: body.default_numeric_value,
            operation: body.operation || 'add'
          })
          .select()
          .single();
        
        if (error) {
          console.error('Error creating fighter effect modifier:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        
        return NextResponse.json(data);
      } catch (error) {
        console.error('Error in modifier creation:', error);
        return NextResponse.json({ 
          error: error instanceof Error ? error.message : 'Error creating modifier' 
        }, { status: 500 });
      }
    }
    
    // Regular fighter effect creation
    
    // Validate required fields
    if (!body.effect_name) {
      return NextResponse.json({ error: 'Effect name is required' }, { status: 400 });
    }
    
    // Ensure equipment_id is a properly formatted string
    let typeSpecificData = null;
    if (body.type_specific_data) {
      if (typeof body.type_specific_data === 'object') {
        // If it's already an object, ensure equipment_id is a string and preserve all other fields
        typeSpecificData = {
          ...body.type_specific_data,
          equipment_id: String(body.type_specific_data.equipment_id)
        };
      } else if (typeof body.type_specific_data === 'string') {
        // If it's a string, try to parse it as JSON
        try {
          const parsed = JSON.parse(body.type_specific_data);
          typeSpecificData = {
            ...parsed,
            equipment_id: String(parsed.equipment_id)
          };
        } catch (e) {
          console.error('Error parsing type_specific_data as JSON:', e);
          return NextResponse.json({ error: 'Invalid JSON in type_specific_data' }, { status: 400 });
        }
      }
    }
    
    // Create fighter effect type
    try {
      const { data, error } = await supabase
        .from('fighter_effect_types')
        .insert({
          effect_name: body.effect_name,
          fighter_effect_category_id: body.fighter_effect_category_id || null,
          type_specific_data: typeSpecificData
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating fighter effect:', error);
        
        // Try alternative approach if there's a JSON error
        if (error.message.includes('invalid input syntax for type json')) {
          // Try using JSON.stringify and direct DB parameter approach
          const { data: altData, error: altError } = await supabase
            .from('fighter_effect_types')
            .insert({
              effect_name: body.effect_name,
              fighter_effect_category_id: body.fighter_effect_category_id || null,
              type_specific_data: JSON.stringify(typeSpecificData)
            })
            .select()
            .single();
          
          if (altError) {
            console.error('Alternative approach also failed:', altError);
            return NextResponse.json({ error: altError.message }, { status: 500 });
          }
          
          return NextResponse.json(altData);
        }
        
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(data);
    } catch (insertError) {
      console.error('Exception during insert operation:', insertError);
      return NextResponse.json({ 
        error: insertError instanceof Error ? insertError.message : 'Error during insert operation' 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in POST handler:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check for admin access
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Effect ID is required' }, { status: 400 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.effect_name) {
      return NextResponse.json({ error: 'Effect name is required' }, { status: 400 });
    }

    // Prepare type_specific_data if provided
    let typeSpecificData = body.type_specific_data;
    if (typeSpecificData && typeof typeSpecificData === 'string') {
      try {
        typeSpecificData = JSON.parse(typeSpecificData);
      } catch (e) {
        console.error('Error parsing type_specific_data:', e);
        return NextResponse.json({ error: 'Invalid JSON in type_specific_data' }, { status: 400 });
      }
    }

    // Update fighter effect type
    const { data, error } = await supabase
      .from('fighter_effect_types')
      .update({
        effect_name: body.effect_name,
        fighter_effect_category_id: body.fighter_effect_category_id || null,
        ...(typeSpecificData !== undefined && { type_specific_data: typeSpecificData })
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating fighter effect:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in PATCH handler:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check for admin access
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const isModifier = searchParams.get('is_modifier') === 'true';
    const isCategory = searchParams.get('is_category') === 'true';
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    
    // If it's a category, check for dependencies and delete it
    if (isCategory) {
      // First check if there are any fighter effect types using this category
      const { data: relatedEffects, error: checkError } = await supabase
        .from('fighter_effect_types')
        .select('id')
        .eq('fighter_effect_category_id', id);
      
      if (checkError) {
        console.error('Error checking related effect types:', checkError);
        return NextResponse.json({ error: checkError.message }, { status: 500 });
      }
      
      // If there are related effect types, don't allow deletion
      if (relatedEffects && relatedEffects.length > 0) {
        return NextResponse.json({ 
          error: `Cannot delete category. It is being used by ${relatedEffects.length} fighter effect type(s).` 
        }, { status: 400 });
      }
      
      // Delete the category
      const { error } = await supabase
        .from('fighter_effect_categories')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting fighter effect category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
    }
    
    // If it's a modifier, just delete it
    if (isModifier) {
      const { error } = await supabase
        .from('fighter_effect_type_modifiers')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting fighter effect modifier:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
    }
    
    // For fighter effect type, first delete related modifiers
    const { error: modifiersError } = await supabase
      .from('fighter_effect_type_modifiers')
      .delete()
      .eq('fighter_effect_type_id', id);
    
    if (modifiersError) {
      console.error('Error deleting modifiers:', modifiersError);
      return NextResponse.json({ error: modifiersError.message }, { status: 500 });
    }
    
    // Then delete the fighter effect type
    const { error } = await supabase
      .from('fighter_effect_types')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting fighter effect:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE handler:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
} 