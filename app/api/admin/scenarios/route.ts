import { TAGS } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isScenarioTableType, SCENARIO_TABLE_TYPES } from "@/types/campaign";

// One route for every edition's scenarios. ?resource picks what is managed:
// scenarios (the default, a list per edition), or the N26 scenario tables and
// their entries.

async function _GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number, edition_id')
      .order('scenario_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json(scenarios);
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scenarios' },
      { status: 500 }
    );
  }
}

async function _POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scenario_name, scenario_number, edition_id } = body;

    const trimmedName = scenario_name?.trim();

    if (!trimmedName || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'scenario_name and scenario_number are required' },
        { status: 400 }
      );
    }

    if (trimmedName.length > 200) {
      return NextResponse.json(
        { error: 'scenario_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    const numericScenarioNumber = Number(scenario_number);
    if (isNaN(numericScenarioNumber) || numericScenarioNumber < 1) {
      return NextResponse.json(
        { error: 'scenario_number must be a positive number' },
        { status: 400 }
      );
    }

    // Scenario numbers restart per edition, so the check is scoped to one.
    let duplicateQuery = supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber);
    duplicateQuery = edition_id
      ? duplicateQuery.eq('edition_id', edition_id)
      : duplicateQuery.is('edition_id', null);

    const { data: existing } = await duplicateQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists for this edition' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert([
        {
          scenario_name: trimmedName,
          scenario_number: numericScenarioNumber,
          edition_id: edition_id || null
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(scenario);
  } catch (error) {
    console.error('Error creating scenario:', error);
    return NextResponse.json(
      { error: 'Failed to create scenario' },
      { status: 500 }
    );
  }
}

async function _PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, scenario_name, scenario_number, edition_id } = body;

    const trimmedName = scenario_name?.trim();

    if (!id || !trimmedName || scenario_number === undefined) {
      return NextResponse.json(
        { error: 'id, scenario_name, and scenario_number are required' },
        { status: 400 }
      );
    }

    if (trimmedName.length > 200) {
      return NextResponse.json(
        { error: 'scenario_name must be 200 characters or less' },
        { status: 400 }
      );
    }

    const numericScenarioNumber = Number(scenario_number);
    if (isNaN(numericScenarioNumber) || numericScenarioNumber < 1) {
      return NextResponse.json(
        { error: 'scenario_number must be a positive number' },
        { status: 400 }
      );
    }

    // Duplicate check, excluding the current scenario.
    let duplicateQuery = supabase
      .from('scenarios')
      .select('id')
      .eq('scenario_number', numericScenarioNumber)
      .neq('id', id);
    duplicateQuery = edition_id
      ? duplicateQuery.eq('edition_id', edition_id)
      : duplicateQuery.is('edition_id', null);

    const { data: existing } = await duplicateQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A scenario with this number already exists for this edition' },
        { status: 409 }
      );
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update({
        scenario_name: trimmedName,
        scenario_number: numericScenarioNumber,
        edition_id: edition_id || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(scenario);
  } catch (error) {
    console.error('Error updating scenario:', error);
    return NextResponse.json(
      { error: 'Failed to update scenario' },
      { status: 500 }
    );
  }
}

async function _DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('scenarios')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    return NextResponse.json(
      { error: 'Failed to delete scenario' },
      { status: 500 }
    );
  }
}

// Admin edits change global reference data that is cached app-wide; fire the
// matching tags once per successful mutation (previously nothing was fired,
// so admin edits never showed up until caches expired).
function withReferenceInvalidation(
  handler: (...args: any[]) => Promise<Response>
) {
  return async (...args: any[]) => {
    const response = await handler(...args);
    if (response.ok) {
      revalidateTag(TAGS.globalScenarios(), { expire: 0 });
    }
    return response;
  };
}

// ============================================================================
// N26 scenario tables and their entries
// The database enforces the rules (editions match, one core table per type,
// unique names, no deleting what is still referenced); these handlers turn its
// errors into messages. A table's type and edition, and an entry's table, are
// set on creation, so an entry a battle recorded never changes slot.
// ============================================================================

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Handler = (request: Request) => Promise<Response>;

const TABLE_COLUMNS = 'id, name, edition_id, gang_type_id, table_type';
const ENTRY_COLUMNS = 'id, name, d6_min, d6_max, scenario_table_id, edition_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** The admin check and catch-all 500 shared by the table and entry handlers. */
function adminOnly(
  failure: string,
  handler: (supabase: SupabaseClient, request: Request) => Promise<Response>
): Handler {
  return async (request: Request) => {
    const supabase = await createClient();
    try {
      if (!(await checkAdmin(supabase))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return await handler(supabase, request);
    } catch (error) {
      console.error(`${failure}:`, error);
      return NextResponse.json({ error: failure }, { status: 500 });
    }
  };
}

// Matched against the violated constraint's name in the error message.
const CONSTRAINT_ERRORS: [RegExp, number, string][] = [
  [/scenario_tables_edition_core_uidx/, 409, 'This edition already has a core table of this type'],
  [/scenario_tables_edition_id_name_key/, 409, 'A table with this name already exists for this edition'],
  [/scenario_tables_edition_id_fkey/, 400, 'edition_id not found'],
  [/scenario_tables_gang_type_id_fkey/, 400, 'gang_type_id not found'],
  [/scenario_tables_gang_type_edition_fkey/, 400, 'gang_type_id must be a gang type of the same edition'],
  [/scenario_table_entries_scenario_table_id_fkey/, 409, 'Cannot delete a table while it still has entries'],
  [/scenario_table_entries_scenario_table_id_name_key/, 409, 'An entry with this name already exists in this table'],
  [/_(deployment|objective|crew_selection|side_job)_id_fkey/, 409, 'Cannot delete an entry that battles have recorded'],
];

/** The response for a constraint violation, or the error rethrown as a 500. */
function constraintResponse(error: { message?: string }): NextResponse {
  const match = CONSTRAINT_ERRORS.find(([pattern]) => pattern.test(error.message ?? ''));
  if (!match) throw error;
  return NextResponse.json({ error: match[2] }, { status: match[1] });
}

function parseTable(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const gangTypeId = body.gang_type_id || null;
  if (!name || name.length > 200) return { error: 'name is required, at most 200 characters' };
  if (!isUuid(body.edition_id)) return { error: 'edition_id must be a valid UUID' };
  if (gangTypeId !== null && !isUuid(gangTypeId)) return { error: 'gang_type_id must be a valid UUID' };
  if (!isScenarioTableType(body.table_type)) {
    return { error: `table_type must be one of: ${SCENARIO_TABLE_TYPES.join(', ')}` };
  }
  return { data: { name, edition_id: body.edition_id, gang_type_id: gangTypeId, table_type: body.table_type } };
}

function parseEntry(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const d6Min = Number(body.d6_min);
  const d6Max = Number(body.d6_max);
  if (!name || name.length > 200) return { error: 'name is required, at most 200 characters' };
  if (![d6Min, d6Max].every((d6) => Number.isInteger(d6) && d6 >= 1 && d6 <= 6) || d6Min > d6Max) {
    return { error: 'd6_min and d6_max must be 1 to 6, with d6_min no higher than d6_max' };
  }
  return { data: { name, d6_min: d6Min, d6_max: d6Max } };
}

/** Deletes one row by id: a constraint violation becomes a message, a missing row a 404. */
function deleteById(table: string, label: string): Handler {
  return adminOnly(`Failed to delete ${label.toLowerCase()}`, async (supabase, request) => {
    const { id } = await request.json();
    if (!isUuid(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
    if (error) return constraintResponse(error);
    if (!data?.length) return NextResponse.json({ error: `${label} not found` }, { status: 404 });
    return NextResponse.json({ success: true });
  });
}

const tables: Record<Method, Handler> = {
  GET: adminOnly('Failed to fetch scenario tables', async (supabase) => {
    const { data, error } = await supabase.from('scenario_tables').select(TABLE_COLUMNS).order('name');
    if (error) throw error;
    return NextResponse.json(data ?? []);
  }),

  POST: adminOnly('Failed to create scenario table', async (supabase, request) => {
    const parsed = parseTable(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase.from('scenario_tables').insert([parsed.data]).select(TABLE_COLUMNS).single();
    if (error) return constraintResponse(error);
    return NextResponse.json(data);
  }),

  // Name and gang type only: type and edition are set on creation.
  PATCH: adminOnly('Failed to update scenario table', async (supabase, request) => {
    const body = await request.json();
    if (!isUuid(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const parsed = parseTable(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { name, gang_type_id } = parsed.data;
    const { data, error } = await supabase
      .from('scenario_tables')
      .update({ name, gang_type_id, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select(TABLE_COLUMNS)
      .maybeSingle();
    if (error) return constraintResponse(error);
    if (!data) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    return NextResponse.json(data);
  }),

  DELETE: deleteById('scenario_tables', 'Table'),
};

const entries: Record<Method, Handler> = {
  GET: adminOnly('Failed to fetch scenario table entries', async (supabase) => {
    const { data, error } = await supabase.from('scenario_table_entries').select(ENTRY_COLUMNS);
    if (error) throw error;
    return NextResponse.json(data ?? []);
  }),

  POST: adminOnly('Failed to create scenario table entry', async (supabase, request) => {
    const body = await request.json();
    const parsed = parseEntry(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!isUuid(body.scenario_table_id)) {
      return NextResponse.json({ error: 'scenario_table_id must be a valid UUID' }, { status: 400 });
    }

    // An entry takes its edition from its table.
    const { data: table, error: tableError } = await supabase
      .from('scenario_tables')
      .select('edition_id')
      .eq('id', body.scenario_table_id)
      .maybeSingle();
    if (tableError) throw tableError;
    if (!table) return NextResponse.json({ error: 'scenario_table_id not found' }, { status: 400 });

    const { data, error } = await supabase
      .from('scenario_table_entries')
      .insert([{ ...parsed.data, scenario_table_id: body.scenario_table_id, edition_id: table.edition_id }])
      .select(ENTRY_COLUMNS)
      .single();
    if (error) return constraintResponse(error);
    return NextResponse.json(data);
  }),

  // Name and D6 only: an entry stays in its table, so the slot a battle
  // recorded it in never changes underneath it.
  PATCH: adminOnly('Failed to update scenario table entry', async (supabase, request) => {
    const body = await request.json();
    if (!isUuid(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const parsed = parseEntry(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from('scenario_table_entries')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select(ENTRY_COLUMNS)
      .maybeSingle();
    if (error) return constraintResponse(error);
    if (!data) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json(data);
  }),

  DELETE: deleteById('scenario_table_entries', 'Entry'),
};

// ============================================================================
// Dispatch
// ============================================================================

// Only scenario writes fire globalScenarios: nothing caches the tables yet.
const HANDLERS: Record<string, Record<Method, Handler>> = {
  scenarios: {
    GET: _GET,
    POST: withReferenceInvalidation(_POST),
    PATCH: withReferenceInvalidation(_PATCH),
    DELETE: withReferenceInvalidation(_DELETE),
  },
  tables,
  entries,
};

function dispatch(method: Method): Handler {
  return async (request: Request) => {
    const resource = new URL(request.url).searchParams.get('resource') ?? 'scenarios';
    const handlers = Object.prototype.hasOwnProperty.call(HANDLERS, resource)
      ? HANDLERS[resource]
      : undefined;
    if (!handlers) {
      return NextResponse.json(
        { error: 'resource must be scenarios, tables or entries' },
        { status: 400 }
      );
    }
    return handlers[method](request);
  };
}

export const GET = dispatch('GET');
export const POST = dispatch('POST');
export const PATCH = dispatch('PATCH');
export const DELETE = dispatch('DELETE');
