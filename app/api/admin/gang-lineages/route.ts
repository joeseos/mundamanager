import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

const VALID_TYPES = ['legacy', 'affiliation'] as const;
type LineageType = typeof VALID_TYPES[number];

function isValidType(t: unknown): t is LineageType {
  return typeof t === 'string' && (VALID_TYPES as readonly string[]).includes(t);
}

function getTableName(type: LineageType) {
  return type === 'legacy' ? 'fighter_gang_legacy' : 'gang_affiliation';
}

// Junction table fighter_type_gang_lineage only used for legacy type
// Always uses fighter_gang_legacy_id as the foreign key
const JUNCTION_FK_COLUMN = 'fighter_gang_legacy_id';

// GET - Fetch gang lineages (requires type param); with id returns one, without returns list
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const typeParam = searchParams.get('type');

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!typeParam || !isValidType(typeParam)) {
    return NextResponse.json({ error: 'Query param "type" must be "legacy" or "affiliation"' }, { status: 400 });
  }

  const type = typeParam as LineageType;
  const table = getTableName(type);

  try {
    if (id) {
      // Get specific lineage by type
      const { data: row, error } = await supabase
        .from(table)
        .select(`
          id,
          name,
          fighter_type_id,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!row) {
        return NextResponse.json(
          { error: 'Gang lineage not found' },
          { status: 404 }
        );
      }

      // Fetch associated fighter type details
      const { data: associatedFighterType, error: fighterTypeError } = await supabase
        .from('fighter_types')
        .select('id, fighter_type, gang_type, gang_type_id')
        .eq('id', row.fighter_type_id)
        .single();

      if (fighterTypeError) throw fighterTypeError;

      // Fetch fighter type access rules (only for legacy type)
      let fighterTypeAccess: any[] = [];
      if (type === 'legacy') {
        const { data: accessData, error: accessError } = await supabase
          .from('fighter_type_gang_lineage')
          .select(`fighter_type_id, ${JUNCTION_FK_COLUMN}`)
          .eq(JUNCTION_FK_COLUMN, id);

        if (accessError) throw accessError;
        fighterTypeAccess = accessData || [];
      }

      const formattedGangLineage = {
        ...row,
        type,
        fighter_type_access: fighterTypeAccess.map(access => access.fighter_type_id),
        associated_fighter_type: associatedFighterType
      };

      return NextResponse.json(formattedGangLineage);
    } else {
      // Get all of type
      const { data: rows, error } = await supabase
        .from(table)
        .select(`
          id,
          name,
          fighter_type_id,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      if (error) throw error;

      const list = rows || [];
      if (list.length === 0) return NextResponse.json([]);

      const ftIds = Array.from(new Set(list.map(r => r.fighter_type_id).filter(Boolean)));
      const rowIds = list.map(r => r.id);

      const [{ data: associatedTypes }, { data: accessRows }] = await Promise.all([
        ftIds.length
          ? supabase
              .from('fighter_types')
              .select('id, fighter_type, gang_type, gang_type_id')
              .in('id', ftIds)
          : Promise.resolve({ data: [] as any[] } as any),
        // Only fetch access rules for legacy type
        rowIds.length && type === 'legacy'
          ? supabase
              .from('fighter_type_gang_lineage')
              .select(`fighter_type_id, ${JUNCTION_FK_COLUMN}`)
              .in(JUNCTION_FK_COLUMN, rowIds)
          : Promise.resolve({ data: [] as any[] } as any)
      ]);

      const assocMap = new Map<string, any>((associatedTypes || []).map((t: any) => [t.id, t]));
      const accessMap = new Map<string, string[]>();
      (accessRows || []).forEach((r: any) => {
        const key = r[JUNCTION_FK_COLUMN] as string;
        if (!accessMap.has(key)) accessMap.set(key, []);
        accessMap.get(key)!.push(r.fighter_type_id);
      });

      const result = list.map(r => ({
        ...r,
        type,
        fighter_type_access: accessMap.get(r.id) || [],
        associated_fighter_type: assocMap.get(r.fighter_type_id) || null
      }));

      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Error in GET gang-lineages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang lineages' },
      { status: 500 }
    );
  }
}

// POST - Create new gang lineage (body.type determines table)
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
    if (!isValidType(data.type)) {
      return NextResponse.json(
        { error: 'Invalid type; must be "legacy" or "affiliation"' },
        { status: 400 }
      );
    }

    const table = getTableName(data.type as LineageType);

    // Create the lineage in the specific table
    const { data: newLineage, error: insertError } = await supabase
      .from(table)
      .insert({
        name: data.name,
        fighter_type_id: data.fighter_type_id
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Handle fighter type access rules (only for legacy type)
    if (data.type === 'legacy' && data.fighter_type_access && Array.isArray(data.fighter_type_access) && data.fighter_type_access.length > 0) {
      const accessRules = data.fighter_type_access.map((fighterTypeId: string) => ({
        [JUNCTION_FK_COLUMN]: newLineage.id,
        fighter_type_id: fighterTypeId
      }));

      const { error: accessError } = await supabase
        .from('fighter_type_gang_lineage')
        .insert(accessRules as any);

      if (accessError) throw accessError;
    }

    return NextResponse.json({ success: true, gang_lineage: { ...newLineage, type: data.type } });
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

// PUT - Update gang lineage; requires query param type for current table; body.type may differ (move)
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const typeParam = searchParams.get('type');

  if (!id) {
    return NextResponse.json({ error: 'Gang lineage ID is required' }, { status: 400 });
  }
  if (!typeParam || !isValidType(typeParam)) {
    return NextResponse.json({ error: 'Query param "type" must be "legacy" or "affiliation"' }, { status: 400 });
  }

  const currentType = typeParam as LineageType;

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    if (!data.name || !data.fighter_type_id || !data.type || !isValidType(data.type)) {
      return NextResponse.json({ error: 'Missing/invalid fields: name, fighter_type_id, type' }, { status: 400 });
    }

    const currentTable = getTableName(currentType);

    const newType = data.type as LineageType;

    // If type unchanged: update in place and replace access rules
    if (newType === currentType) {
      const { error: updateError } = await supabase
        .from(currentTable)
        .update({
          name: data.name,
          fighter_type_id: data.fighter_type_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (updateError) throw updateError;

      // Handle access rules only for legacy type
      if (currentType === 'legacy') {
        const { error: deleteAccessError } = await supabase
          .from('fighter_type_gang_lineage')
          .delete()
          .eq(JUNCTION_FK_COLUMN, id);
        if (deleteAccessError) throw deleteAccessError;

        if (data.fighter_type_access && Array.isArray(data.fighter_type_access) && data.fighter_type_access.length > 0) {
          const accessRules = data.fighter_type_access.map((fighterTypeId: string) => ({
            [JUNCTION_FK_COLUMN]: id,
            fighter_type_id: fighterTypeId
          }));
          const { error: accessError } = await supabase
            .from('fighter_type_gang_lineage')
            .insert(accessRules as any);
          if (accessError) throw accessError;
        }
      }

      return NextResponse.json({ success: true });
    }

    // If type changed: create in new table, migrate access rules, update fighters, delete old
    const newTable = getTableName(newType);
    const oldFightersFk = currentType === 'legacy' ? 'fighter_gang_legacy_id' : 'gang_affiliation_id';
    const newFightersFk = newType === 'legacy' ? 'fighter_gang_legacy_id' : 'gang_affiliation_id';

    // Create new record in new table
    const { data: insertedNew, error: insertNewErr } = await supabase
      .from(newTable)
      .insert({
        name: data.name,
        fighter_type_id: data.fighter_type_id
      })
      .select()
      .single();
    if (insertNewErr) throw insertNewErr;
    const newId = insertedNew.id as string;

    // Handle access rules migration only if relevant for the types involved
    let oldAccess: any[] = [];
    
    // Read existing access rules from old type (only if old type is legacy)
    if (currentType === 'legacy') {
      const { data: oldAccessData, error: oldAccessErr } = await supabase
        .from('fighter_type_gang_lineage')
        .select(`fighter_type_id, ${JUNCTION_FK_COLUMN}`)
        .eq(JUNCTION_FK_COLUMN, id);
      if (oldAccessErr) throw oldAccessErr;
      oldAccess = oldAccessData || [];

      // Delete old access rules
      const { error: delOldAccessErr } = await supabase
        .from('fighter_type_gang_lineage')
        .delete()
        .eq(JUNCTION_FK_COLUMN, id);
      if (delOldAccessErr) throw delOldAccessErr;
    }

    // Insert new access rules (only if new type is legacy)
    if (newType === 'legacy') {
      const newAccessList = (data.fighter_type_access && Array.isArray(data.fighter_type_access))
        ? data.fighter_type_access
        : oldAccess.map(r => r.fighter_type_id);

      if (newAccessList.length > 0) {
        const rows = newAccessList.map((fighterTypeId: string) => ({
          [JUNCTION_FK_COLUMN]: newId,
          fighter_type_id: fighterTypeId
        }));
        const { error: insNewAccessErr } = await supabase
          .from('fighter_type_gang_lineage')
          .insert(rows as any);
        if (insNewAccessErr) throw insNewAccessErr;
      }
    }

    // Update fighters to reference new id and clear old
    const updates: any = { [newFightersFk]: newId };
    updates[oldFightersFk] = null;

    const { error: fightersMoveErr } = await supabase
      .from('fighters')
      .update(updates)
      .eq(oldFightersFk, id);
    if (fightersMoveErr) throw fightersMoveErr;

    // Delete the old record
    const { error: deleteOldErr } = await supabase
      .from(currentTable)
      .delete()
      .eq('id', id);
    if (deleteOldErr) throw deleteOldErr;

    return NextResponse.json({ success: true, id: newId, type: newType });
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

// DELETE - Delete gang lineage (requires type)
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const typeParam = searchParams.get('type');

  if (!id) {
    return NextResponse.json({ error: 'Gang lineage ID is required' }, { status: 400 });
  }
  if (!typeParam || !isValidType(typeParam)) {
    return NextResponse.json({ error: 'Query param "type" must be "legacy" or "affiliation"' }, { status: 400 });
  }

  const type = typeParam as LineageType;

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const table = getTableName(type);
    const fightersFk = type === 'legacy' ? 'fighter_gang_legacy_id' : 'gang_affiliation_id';

    // Check for existing fighters using this lineage
    const { data: existingFighters, error: checkError } = await supabase
      .from('fighters')
      .select('id')
      .eq(fightersFk, id)
      .limit(1);

    if (checkError) throw checkError;

    if (existingFighters && existingFighters.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete gang lineage: it is being used by existing fighters' },
        { status: 400 }
      );
    }

    // Delete fighter type access rules first (only for legacy type)
    if (type === 'legacy') {
      const { error: deleteAccessError } = await supabase
        .from('fighter_type_gang_lineage')
        .delete()
        .eq(JUNCTION_FK_COLUMN, id);

      if (deleteAccessError) throw deleteAccessError;
    }

    // Delete the lineage
    const { error: deleteError } = await supabase
      .from(table)
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