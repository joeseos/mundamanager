import { TAGS } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isScenarioTableType,
  SCENARIO_TABLE_TYPE_LABELS,
  SCENARIO_TABLE_TYPES,
  type ScenarioTableType,
} from "@/types/campaign";

// One route for every edition's scenarios. ?resource picks what is managed:
// scenarios (the default, a list per edition), or the entries of the N26
// scenario tables.

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
  tag: string,
  handler: (...args: any[]) => Promise<Response>
) {
  return async (...args: any[]) => {
    const response = await handler(...args);
    if (response.ok) {
      revalidateTag(tag, { expire: 0 });
    }
    return response;
  };
}

// ============================================================================
// N26 scenario table entries
// The admin edits Deployments, Objectives, Side Jobs and Crew. An entry's
// table is found, or made with its first entry, from the edition, the type and,
// for Side Jobs, the gang type (none for the core table every gang rolls on),
// so tables are never managed by hand. The database enforces the rules
// (editions match, one table per edition, type and gang type, unique names and
// D6 results, no deleting an entry a battle column records); these handlers
// turn its errors into messages. A campaign battle keeps its Side Jobs in the
// participants JSON, which no foreign key covers, so those are not protected.
// An entry never changes table, so an entry a battle recorded never changes
// slot.
// ============================================================================

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Handler = (request: Request) => Promise<Response>;

// The hint picks the plain foreign key to scenario_tables over the composite
// edition one, which PostgREST would otherwise find ambiguous.
const ENTRY_SELECT =
  'id, name, d6_min, d6_max, edition_id, scenario_tables!scenario_table_entries_scenario_table_id_fkey (table_type, gang_type_id)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** The admin check and catch-all 500 shared by the entry handlers. */
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

/** A 409 for a name or D6 result the entry's table already has, or the error rethrown as a 500. */
function duplicateEntryResponse(error: { code: string; message: string }): NextResponse {
  if (error.code !== '23505') throw error;
  const taken = error.message.includes('scenario_table_entries_scenario_table_id_d6_min_key')
    ? 'this D6 result'
    : 'this name';
  return NextResponse.json({ error: `An entry with ${taken} already exists in this table` }, { status: 409 });
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

/** An entry with its table's type and gang type in place of the table embed. */
function toEntry(row: any) {
  const { scenario_tables: table, ...entry } = row;
  const { table_type, gang_type_id } = (Array.isArray(table) ? table[0] : table) ?? {};
  return { ...entry, table_type, gang_type_id: gang_type_id ?? null };
}

/**
 * The table for an edition, type and gang type. The first entry makes it,
 * named after its type ("Side Jobs") or, for a house, after both ("House
 * Goliath Side Jobs").
 */
async function tableFor(
  supabase: SupabaseClient,
  editionId: string,
  tableType: ScenarioTableType,
  gangTypeId: string | null
): Promise<{ id: string } | { response: NextResponse }> {
  const tableQuery = () => {
    const query = supabase
      .from('scenario_tables')
      .select('id')
      .eq('edition_id', editionId)
      .eq('table_type', tableType);
    return gangTypeId ? query.eq('gang_type_id', gangTypeId) : query.is('gang_type_id', null);
  };

  const { data: existing, error: findError } = await tableQuery().maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  let name = SCENARIO_TABLE_TYPE_LABELS[tableType];
  if (gangTypeId) {
    const { data: gangType, error } = await supabase
      .from('gang_types')
      .select('gang_type, edition_id')
      .eq('id', gangTypeId)
      .maybeSingle();
    if (error) throw error;
    if (!gangType) return { response: NextResponse.json({ error: 'gang_type_id not found' }, { status: 400 }) };
    if (gangType.edition_id !== editionId) {
      return { response: NextResponse.json({ error: 'gang_type_id must be a gang type of the same edition' }, { status: 400 }) };
    }
    name = `${gangType.gang_type} ${name}`;
  }

  // Does nothing if another request made the table first, so two first entries
  // made at once still share one table.
  const { error: upsertError } = await supabase
    .from('scenario_tables')
    .upsert(
      [{ edition_id: editionId, table_type: tableType, gang_type_id: gangTypeId, name }],
      { onConflict: 'edition_id,table_type,gang_type_id', ignoreDuplicates: true }
    );
  if (upsertError?.code === '23503') {
    return { response: NextResponse.json({ error: 'edition_id not found' }, { status: 400 }) };
  }
  if (upsertError) throw upsertError;

  const { data, error } = await tableQuery().single();
  if (error) throw error;
  return data;
}

const entries: Record<Method, Handler> = {
  GET: adminOnly('Failed to fetch scenario table entries', async (supabase) => {
    const { data, error } = await supabase.from('scenario_table_entries').select(ENTRY_SELECT);
    if (error) throw error;
    return NextResponse.json((data ?? []).map(toEntry));
  }),

  POST: adminOnly('Failed to create scenario table entry', async (supabase, request) => {
    const body = await request.json();
    const parsed = parseEntry(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const gangTypeId = body.gang_type_id || null;
    if (!isUuid(body.edition_id)) return NextResponse.json({ error: 'edition_id must be a valid UUID' }, { status: 400 });
    if (gangTypeId !== null && !isUuid(gangTypeId)) {
      return NextResponse.json({ error: 'gang_type_id must be a valid UUID' }, { status: 400 });
    }
    if (!isScenarioTableType(body.table_type)) {
      return NextResponse.json({ error: `table_type must be one of: ${SCENARIO_TABLE_TYPES.join(', ')}` }, { status: 400 });
    }
    if (gangTypeId !== null && body.table_type !== 'side_job') {
      return NextResponse.json({ error: 'Only Side Jobs have gang type tables' }, { status: 400 });
    }

    const table = await tableFor(supabase, body.edition_id, body.table_type, gangTypeId);
    if ('response' in table) return table.response;

    const { data, error } = await supabase
      .from('scenario_table_entries')
      .insert([{ ...parsed.data, scenario_table_id: table.id, edition_id: body.edition_id }])
      .select(ENTRY_SELECT)
      .single();
    if (error) return duplicateEntryResponse(error);
    return NextResponse.json(toEntry(data));
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
      .select(ENTRY_SELECT)
      .maybeSingle();
    if (error) return duplicateEntryResponse(error);
    if (!data) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json(toEntry(data));
  }),

  DELETE: adminOnly('Failed to delete scenario table entry', async (supabase, request) => {
    const { id } = await request.json();
    if (!isUuid(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data, error } = await supabase.from('scenario_table_entries').delete().eq('id', id).select('id');
    // A battle column still records the entry
    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Cannot delete an entry that battles have recorded' }, { status: 409 });
    }
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  }),
};

// ============================================================================
// Dispatch
// ============================================================================

const HANDLERS: Record<string, Record<Method, Handler>> = {
  scenarios: {
    GET: _GET,
    POST: withReferenceInvalidation(TAGS.globalScenarios(), _POST),
    PATCH: withReferenceInvalidation(TAGS.globalScenarios(), _PATCH),
    DELETE: withReferenceInvalidation(TAGS.globalScenarios(), _DELETE),
  },
  // The battle log pickers read the entries through getScenarioTablesCached.
  entries: {
    GET: entries.GET,
    POST: withReferenceInvalidation(TAGS.globalScenarioTables(), entries.POST),
    PATCH: withReferenceInvalidation(TAGS.globalScenarioTables(), entries.PATCH),
    DELETE: withReferenceInvalidation(TAGS.globalScenarioTables(), entries.DELETE),
  },
};

function dispatch(method: Method): Handler {
  return async (request: Request) => {
    const resource = new URL(request.url).searchParams.get('resource') ?? 'scenarios';
    const handlers = Object.prototype.hasOwnProperty.call(HANDLERS, resource)
      ? HANDLERS[resource]
      : undefined;
    if (!handlers) {
      return NextResponse.json(
        { error: 'resource must be scenarios or entries' },
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
