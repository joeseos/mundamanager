import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

// GET - Fetch gang lineages
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (id) {
      // Get specific gang lineage
      const { data: gangLineage, error } = await supabase
        .from('gang_lineage')
        .select(`
          id,
          name,
          fighter_type_id,
          type,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!gangLineage) {
        return NextResponse.json(
          { error: 'Gang lineage not found' },
          { status: 404 }
        );
      }

      // Fetch associated fighter type details
      const { data: associatedFighterType, error: fighterTypeError } = await supabase
        .from('fighter_types')
        .select('id, fighter_type, gang_type, gang_type_id')
        .eq('id', gangLineage.fighter_type_id)
        .single();

      if (fighterTypeError) throw fighterTypeError;

      // Fetch fighter type access rules
      const { data: fighterTypeAccess, error: accessError } = await supabase
        .from('fighter_type_gang_lineage')
        .select('fighter_type_id')
        .eq('gang_lineage_id', id);

      if (accessError) throw accessError;

      const formattedGangLineage = {
        ...gangLineage,
        fighter_type_access: fighterTypeAccess?.map(access => access.fighter_type_id) || [],
        associated_fighter_type: associatedFighterType
      };

      return NextResponse.json(formattedGangLineage);
    } else {
      // Get all gang lineages
      const { data: gangLineages, error } = await supabase
        .from('gang_lineage')
        .select(`
          id,
          name,
          fighter_type_id,
          type,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      if (error) throw error;

      // For each gang lineage, get the fighter type access rules and associated fighter type
      const gangLineagesWithAccess = await Promise.all(
        (gangLineages || []).map(async (lineage) => {
          // Fetch associated fighter type details
          const { data: associatedFighterType } = await supabase
            .from('fighter_types')
            .select('id, fighter_type, gang_type, gang_type_id')
            .eq('id', lineage.fighter_type_id)
            .single();

          // Fetch fighter type access rules
          const { data: fighterTypeAccess } = await supabase
            .from('fighter_type_gang_lineage')
            .select('fighter_type_id')
            .eq('gang_lineage_id', lineage.id);

          return {
            ...lineage,
            fighter_type_access: fighterTypeAccess?.map(access => access.fighter_type_id) || [],
            associated_fighter_type: associatedFighterType
          };
        })
      );

      return NextResponse.json(gangLineagesWithAccess);
    }
  } catch (error) {
    console.error('Error in GET gang-lineages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang lineages' },
      { status: 500 }
    );
  }
}

// POST - Create new gang lineage
export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // Validate required fields
    if (!data.name || !data.fighter_type_id || !data.type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, fighter_type_id, type' },
        { status: 400 }
      );
    }

    // Create the gang lineage
    const { data: newGangLineage, error: insertError } = await supabase
      .from('gang_lineage')
      .insert({
        name: data.name,
        fighter_type_id: data.fighter_type_id,
        type: data.type
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Handle fighter type access rules
    if (data.fighter_type_access && Array.isArray(data.fighter_type_access) && data.fighter_type_access.length > 0) {
      const accessRules = data.fighter_type_access.map((fighterTypeId: string) => ({
        gang_lineage_id: newGangLineage.id,
        fighter_type_id: fighterTypeId
      }));

      const { error: accessError } = await supabase
        .from('fighter_type_gang_lineage')
        .insert(accessRules);

      if (accessError) throw accessError;
    }

    return NextResponse.json({ success: true, gang_lineage: newGangLineage });
  } catch (error) {
    console.error('Error in POST gang-lineage:', error);
    return NextResponse.json(
      { 
        error: 'Error creating gang lineage',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT - Update gang lineage
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Gang lineage ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // Update gang lineage
    const { error: updateError } = await supabase
      .from('gang_lineage')
      .update({
        name: data.name,
        fighter_type_id: data.fighter_type_id,
        type: data.type,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Update fighter type access rules
    // First delete existing access rules
    const { error: deleteAccessError } = await supabase
      .from('fighter_type_gang_lineage')
      .delete()
      .eq('gang_lineage_id', id);

    if (deleteAccessError) throw deleteAccessError;

    // Insert new access rules if provided
    if (data.fighter_type_access && Array.isArray(data.fighter_type_access) && data.fighter_type_access.length > 0) {
      const accessRules = data.fighter_type_access.map((fighterTypeId: string) => ({
        gang_lineage_id: id,
        fighter_type_id: fighterTypeId
      }));

      const { error: accessError } = await supabase
        .from('fighter_type_gang_lineage')
        .insert(accessRules);

      if (accessError) throw accessError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT gang-lineage:', error);
    return NextResponse.json(
      { 
        error: 'Error updating gang lineage',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete gang lineage
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Gang lineage ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for existing fighters using this gang lineage
    const { data: existingFighters, error: checkError } = await supabase
      .from('fighters')
      .select('id')
      .eq('gang_lineage_id', id)
      .limit(1);

    if (checkError) throw checkError;

    if (existingFighters && existingFighters.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete gang lineage: it is being used by existing fighters' },
        { status: 400 }
      );
    }

    // Delete fighter type access rules first
    const { error: deleteAccessError } = await supabase
      .from('fighter_type_gang_lineage')
      .delete()
      .eq('gang_lineage_id', id);

    if (deleteAccessError) throw deleteAccessError;

    // Delete the gang lineage
    const { error: deleteError } = await supabase
      .from('gang_lineage')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE gang-lineage:', error);
    return NextResponse.json(
      { 
        error: 'Error deleting gang lineage',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}