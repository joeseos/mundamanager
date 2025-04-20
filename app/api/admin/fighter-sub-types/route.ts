import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  console.log('Fighter sub-types API endpoint called');

  const supabase = createClient();

  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      console.log('Unauthorized - not an admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query fighter_sub_types table
    const { data: fighterSubTypes, error } = await supabase
      .from('fighter_sub_types')
      .select('id, sub_type_name')
      .order('sub_type_name');

    console.log('Query result:', { data: fighterSubTypes, error });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }

    if (!fighterSubTypes || fighterSubTypes.length === 0) {
      console.log('No fighter sub-types found - check RLS policies');
      return NextResponse.json([]); // Return empty array instead of error
    }

    return NextResponse.json(fighterSubTypes);

  } catch (error) {
    console.error('Error in GET fighter sub-types:', error);
    return NextResponse.json(
      { 
        error: 'Error fetching fighter sub-types',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  console.log('POST fighter sub-type API endpoint called');
  
  const supabase = createClient();
  
  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      console.log('Unauthorized - not an admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the request body
    const body = await request.json();
    
    // Validate request body
    if (!body.sub_type_name || typeof body.sub_type_name !== 'string' || body.sub_type_name.trim() === '') {
      return NextResponse.json({ error: 'Sub-type name is required' }, { status: 400 });
    }
    
    // Format the sub-type name (capitalize first letter)
    const formattedName = body.sub_type_name.trim().charAt(0).toUpperCase() + body.sub_type_name.trim().slice(1);
    
    // Check for existing sub-type with same name (case-insensitive)
    const { data: existingSubTypes, error: searchError } = await supabase
      .from('fighter_sub_types')
      .select('id, sub_type_name')
      .ilike('sub_type_name', body.sub_type_name.trim());
    
    if (searchError) {
      console.error('Database error checking for existing sub-types:', searchError);
      return NextResponse.json({ 
        error: 'Database error', 
        details: searchError.message 
      }, { status: 500 });
    }
    
    // If a sub-type with the same name already exists, return it instead of creating a new one
    if (existingSubTypes && existingSubTypes.length > 0) {
      console.log('Found existing sub-type with same name:', existingSubTypes[0]);
      return NextResponse.json({ 
        id: existingSubTypes[0].id,
        sub_type_name: existingSubTypes[0].sub_type_name,
        message: 'Using existing sub-type with same name'
      });
    }
    
    // Insert new fighter sub-type
    const { data: newSubType, error } = await supabase
      .from('fighter_sub_types')
      .insert([
        { sub_type_name: formattedName }
      ])
      .select('id, sub_type_name')
      .single();
    
    if (error) {
      console.error('Database error creating sub-type:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }
    
    console.log('Created new fighter sub-type:', newSubType);
    return NextResponse.json(newSubType, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST fighter sub-type:', error);
    return NextResponse.json(
      { 
        error: 'Error creating fighter sub-type',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  console.log('PUT fighter sub-type API endpoint called');
  
  const supabase = createClient();
  
  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      console.log('Unauthorized - not an admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the request body
    const body = await request.json();
    
    // Get the ID from query parameters
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    // Validate request parameters
    if (!id) {
      return NextResponse.json({ error: 'Sub-type ID is required' }, { status: 400 });
    }
    
    if (!body.sub_type_name || typeof body.sub_type_name !== 'string' || body.sub_type_name.trim() === '') {
      return NextResponse.json({ error: 'Sub-type name is required' }, { status: 400 });
    }
    
    // Format the sub-type name (capitalize first letter)
    const formattedName = body.sub_type_name.trim().charAt(0).toUpperCase() + body.sub_type_name.trim().slice(1);
    
    // Check if the sub-type exists
    const { data: existingSubType, error: findError } = await supabase
      .from('fighter_sub_types')
      .select('id')
      .eq('id', id)
      .single();
    
    if (findError) {
      console.error('Database error finding sub-type:', findError);
      if (findError.code === 'PGRST116') { // "no rows returned" error
        return NextResponse.json({ error: 'Sub-type not found' }, { status: 404 });
      }
      return NextResponse.json({ 
        error: 'Database error', 
        details: findError.message 
      }, { status: 500 });
    }
    
    // Update the fighter sub-type
    const { data: updatedSubType, error } = await supabase
      .from('fighter_sub_types')
      .update({ sub_type_name: formattedName })
      .eq('id', id)
      .select('id, sub_type_name')
      .single();
    
    if (error) {
      console.error('Database error updating sub-type:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }
    
    console.log('Updated fighter sub-type:', updatedSubType);
    return NextResponse.json(updatedSubType);
    
  } catch (error) {
    console.error('Error in PUT fighter sub-type:', error);
    return NextResponse.json(
      { 
        error: 'Error updating fighter sub-type',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 