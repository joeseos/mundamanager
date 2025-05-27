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
    
    // Get table names
    const tableQuery = await supabase.rpc('get_tables');
    
    // Check specific tables
    const result = {
      tables: tableQuery.data || [],
      fighter_effect_types: null,
      fighter_effect_type_modifiers: null,
      fighter_effect_categories: null,
      error: null
    };
    
    // Check fighter_effect_types table
    try {
      const { data: effectTypes, error } = await supabase
        .from('fighter_effect_types')
        .select('*')
        .limit(1);
        
      result.fighter_effect_types = {
        exists: !error,
        error: error ? error.message : null,
        sample: effectTypes
      };
    } catch (e) {
      result.fighter_effect_types = {
        exists: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        sample: null
      };
    }
    
    // Check fighter_effect_type_modifiers table
    try {
      const { data: modifiers, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .select('*')
        .limit(1);
        
      result.fighter_effect_type_modifiers = {
        exists: !error,
        error: error ? error.message : null,
        sample: modifiers
      };
    } catch (e) {
      result.fighter_effect_type_modifiers = {
        exists: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        sample: null
      };
    }
    
    // Check fighter_effect_categories table
    try {
      const { data: categories, error } = await supabase
        .from('fighter_effect_categories')
        .select('*')
        .limit(1);
        
      result.fighter_effect_categories = {
        exists: !error,
        error: error ? error.message : null,
        sample: categories
      };
    } catch (e) {
      result.fighter_effect_categories = {
        exists: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        sample: null
      };
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in diagnostic route:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      tables: [] 
    }, { status: 500 });
  }
} 