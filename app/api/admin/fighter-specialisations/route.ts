import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {

  const supabase = await createClient();

  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query fighter_specialisations table
    const { data: fighterSpecialisations, error } = await supabase
      .from('fighter_specialisations')
      .select('id, specialisation_name')
      .order('specialisation_name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }

    if (!fighterSpecialisations || fighterSpecialisations.length === 0) {
      return NextResponse.json([]); // Return empty array instead of error
    }

    return NextResponse.json(fighterSpecialisations);

  } catch (error) {
    console.error('Error in GET fighter specialisations:', error);
    return NextResponse.json(
      { 
        error: 'Error fetching fighter specialisations',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  
  const supabase = await createClient();
  
  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the request body
    const body = await request.json();
    
    // Validate request body
    if (!body.specialisation_name || typeof body.specialisation_name !== 'string' || body.specialisation_name.trim() === '') {
      return NextResponse.json({ error: 'Specialisation name is required' }, { status: 400 });
    }
    
    // Format the specialisation name (capitalize first letter)
    const formattedName = body.specialisation_name.trim().charAt(0).toUpperCase() + body.specialisation_name.trim().slice(1);
    
    // Check for existing specialisation with same name (case-insensitive)
    const { data: existingSpecialisations, error: searchError } = await supabase
      .from('fighter_specialisations')
      .select('id, specialisation_name')
      .ilike('specialisation_name', body.specialisation_name.trim());
    
    if (searchError) {
      console.error('Database error checking for existing specialisations:', searchError);
      return NextResponse.json({ 
        error: 'Database error', 
        details: searchError.message 
      }, { status: 500 });
    }
    
    // If a specialisation with the same name already exists, return it instead of creating a new one
    if (existingSpecialisations && existingSpecialisations.length > 0) {
      return NextResponse.json({ 
        id: existingSpecialisations[0].id,
        specialisation_name: existingSpecialisations[0].specialisation_name,
        message: 'Using existing specialisation with same name'
      });
    }
    
    // Insert new fighter specialisation
    const { data: newSpecialisation, error } = await supabase
      .from('fighter_specialisations')
      .insert([
        { specialisation_name: formattedName }
      ])
      .select('id, specialisation_name')
      .single();
    
    if (error) {
      console.error('Database error creating specialisation:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }
    
    return NextResponse.json(newSpecialisation, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST fighter specialisation:', error);
    return NextResponse.json(
      { 
        error: 'Error creating fighter specialisation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  
  const supabase = await createClient();
  
  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the request body
    const body = await request.json();
    
    // Get the ID from query parameters
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    // Validate request parameters
    if (!id) {
      return NextResponse.json({ error: 'Specialisation ID is required' }, { status: 400 });
    }
    
    if (!body.specialisation_name || typeof body.specialisation_name !== 'string' || body.specialisation_name.trim() === '') {
      return NextResponse.json({ error: 'Specialisation name is required' }, { status: 400 });
    }
    
    // Format the specialisation name (capitalize first letter)
    const formattedName = body.specialisation_name.trim().charAt(0).toUpperCase() + body.specialisation_name.trim().slice(1);
    
    // Check if the specialisation exists
    const { data: existingSpecialisation, error: findError } = await supabase
      .from('fighter_specialisations')
      .select('id')
      .eq('id', id)
      .single();
    
    if (findError) {
      console.error('Database error finding specialisation:', findError);
      if (findError.code === 'PGRST116') { // "no rows returned" error
        return NextResponse.json({ error: 'Specialisation not found' }, { status: 404 });
      }
      return NextResponse.json({ 
        error: 'Database error', 
        details: findError.message 
      }, { status: 500 });
    }
    
    // Update the fighter specialisation
    const { data: updatedSpecialisation, error } = await supabase
      .from('fighter_specialisations')
      .update({ specialisation_name: formattedName })
      .eq('id', id)
      .select('id, specialisation_name')
      .single();
    
    if (error) {
      console.error('Database error updating specialisation:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }
    
    return NextResponse.json(updatedSpecialisation);
    
  } catch (error) {
    console.error('Error in PUT fighter specialisation:', error);
    return NextResponse.json(
      { 
        error: 'Error updating fighter specialisation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  // ... existing code ...
} 