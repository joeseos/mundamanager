import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareScenarioTableEntries,
  DICE_NOTATION_RE,
  type ScenarioCrewSelectionRule,
  type ScenarioTableType,
} from "@/types/scenario-table";

const CREW_RULE_COLUMNS =
  'role, chosen_count, random_count, reinforcement_count, reinforcements_per_round, reinforcements_from_round';
const ENTRY_COLUMNS =
  `id, name, d6_min, d6_max, scenario_table_id, edition_id, crew_rules:scenario_crew_selection_rules (${CREW_RULE_COLUMNS})`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function isMissingRowError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' || /0 rows/i.test(error.message ?? '');
}

function uniqueConstraintResponse(error: unknown): NextResponse | null {
  if (postgresCode(error) !== '23505') return null;
  const message = errorMessage(error);
  if (message.includes('scenario_table_entries_scenario_table_id_name_key')) {
    return NextResponse.json(
      { error: 'An entry with this name already exists in this table' },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: 'An entry with these values already exists' },
    { status: 409 }
  );
}

function parseD6(value: unknown, field: string): { error: string } | { data: number } {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
    return { error: `${field} must be a whole number from 1 to 6` };
  }
  return { data: parsed };
}

function validateEntryPayload(body: {
  name?: unknown;
  scenario_table_id?: unknown;
  d6_min?: unknown;
  d6_max?: unknown;
}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tableId = emptyToNull(body.scenario_table_id);

  if (!name) {
    return { error: 'name is required' };
  }
  if (name.length > 200) {
    return { error: 'name must be 200 characters or less' };
  }
  if (!tableId) {
    return { error: 'scenario_table_id is required' };
  }
  if (!UUID_RE.test(tableId)) {
    return { error: 'scenario_table_id must be a valid UUID' };
  }

  const d6Min = parseD6(body.d6_min, 'd6_min');
  if ('error' in d6Min) return d6Min;
  const d6Max = parseD6(body.d6_max, 'd6_max');
  if ('error' in d6Max) return d6Max;
  if (d6Min.data > d6Max.data) {
    return { error: 'd6_min must be less than or equal to d6_max' };
  }

  return {
    data: {
      name,
      scenario_table_id: tableId,
      d6_min: d6Min.data,
      d6_max: d6Max.data,
    },
  };
}

function parseDice(value: unknown, field: string): { error: string } | { data: string } {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!DICE_NOTATION_RE.test(text)) {
    return { error: `${field} must be a number or dice, e.g. 3, D3 or D3+1` };
  }
  return { data: text };
}

function parsePositiveInt(value: unknown, field: string): { error: string } | { data: number } {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1) {
    return { error: `${field} must be a whole number of 1 or more` };
  }
  return { data: parsed };
}

/**
 * Crew rules arrive as the whole set for an entry: one row with role null for
 * both gangs, or one attacker and one defender row. Absent means "leave as is".
 */
function validateCrewRules(
  value: unknown,
  tableType: ScenarioTableType
): { error: string } | { data: ScenarioCrewSelectionRule[] | undefined } {
  if (value === undefined) return { data: undefined };
  if (!Array.isArray(value)) return { error: 'crew_rules must be a list' };
  if (tableType !== 'crew_selection') {
    return value.length === 0
      ? { data: undefined }
      : { error: 'crew_rules only apply to entries of a Crew table' };
  }

  const roles = value.map((rule) => rule?.role ?? null);
  const bothGangs = roles.length === 1 && roles[0] === null;
  const perRole = roles.length === 2 && roles.includes('attacker') && roles.includes('defender');
  if (value.length > 0 && !bothGangs && !perRole) {
    return { error: 'crew_rules must be one rule for both gangs, or one each for attacker and defender' };
  }

  const rules: ScenarioCrewSelectionRule[] = [];
  for (const rule of value) {
    const chosen = parseDice(rule?.chosen_count ?? '0', 'chosen_count');
    if ('error' in chosen) return chosen;
    const random = parseDice(rule?.random_count ?? '0', 'random_count');
    if ('error' in random) return random;
    if (chosen.data === '0' && random.data === '0') {
      return { error: 'A crew rule needs chosen_count or random_count' };
    }

    let reinforcement_count: number | null = null;
    let reinforcements_per_round: string | null = null;
    let reinforcements_from_round: number | null = null;
    if (rule?.reinforcement_count != null && rule.reinforcement_count !== '') {
      const count = parsePositiveInt(rule.reinforcement_count, 'reinforcement_count');
      if ('error' in count) return count;
      const perRound = parseDice(rule.reinforcements_per_round, 'reinforcements_per_round');
      if ('error' in perRound) return perRound;
      const fromRound = parsePositiveInt(rule.reinforcements_from_round, 'reinforcements_from_round');
      if ('error' in fromRound) return fromRound;
      reinforcement_count = count.data;
      reinforcements_per_round = perRound.data;
      reinforcements_from_round = fromRound.data;
    }

    rules.push({
      role: rule?.role ?? null,
      chosen_count: chosen.data,
      random_count: random.data,
      reinforcement_count,
      reinforcements_per_round,
      reinforcements_from_round,
    });
  }
  return { data: rules };
}

async function loadTable(
  supabase: SupabaseClient,
  tableId: string
): Promise<{ error: string } | { editionId: string; tableType: ScenarioTableType }> {
  const { data, error } = await supabase
    .from('scenario_tables')
    .select('id, edition_id, table_type')
    .eq('id', tableId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: 'scenario_table_id not found' };
  return { editionId: data.edition_id, tableType: data.table_type };
}

/**
 * Writes the new set first and removes what it replaced second, so a failed
 * write leaves the old rules in place rather than none.
 */
async function replaceCrewRules(
  supabase: SupabaseClient,
  entryId: string,
  rules: ScenarioCrewSelectionRule[]
) {
  if (rules.length > 0) {
    const { error: upsertError } = await supabase
      .from('scenario_crew_selection_rules')
      .upsert(
        rules.map((rule) => ({
          ...rule,
          scenario_table_entry_id: entryId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'scenario_table_entry_id,role' }
      );
    if (upsertError) throw upsertError;
  }

  const stale = supabase
    .from('scenario_crew_selection_rules')
    .delete()
    .eq('scenario_table_entry_id', entryId);
  const { error: deleteError } = rules.length === 0
    ? await stale
    : rules[0].role === null
      ? await stale.not('role', 'is', null)
      : await stale.is('role', null);
  if (deleteError) throw deleteError;
}

async function loadEntry(supabase: SupabaseClient, entryId: string) {
  const { data, error } = await supabase
    .from('scenario_table_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: entries, error } = await supabase
      .from('scenario_table_entries')
      .select(ENTRY_COLUMNS);

    if (error) throw error;

    const sorted = [...(entries ?? [])].sort(compareScenarioTableEntries);
    return NextResponse.json(sorted);
  } catch (error) {
    console.error('Error fetching scenario table entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scenario table entries' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = validateEntryPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const table = await loadTable(supabase, validated.data.scenario_table_id);
    if ('error' in table) {
      return NextResponse.json({ error: table.error }, { status: 400 });
    }

    const crewRules = validateCrewRules(body.crew_rules, table.tableType);
    if ('error' in crewRules) {
      return NextResponse.json({ error: crewRules.error }, { status: 400 });
    }

    const { data: entry, error } = await supabase
      .from('scenario_table_entries')
      .insert([{
        ...validated.data,
        edition_id: table.editionId,
      }])
      .select('id')
      .single();

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }

    if (crewRules.data) {
      try {
        await replaceCrewRules(supabase, entry.id, crewRules.data);
      } catch (rulesError) {
        // Don't leave a Crew entry behind without the rules it was created with.
        await supabase.from('scenario_table_entries').delete().eq('id', entry.id);
        throw rulesError;
      }
    }

    return NextResponse.json(await loadEntry(supabase, entry.id));
  } catch (error) {
    console.error('Error creating scenario table entry:', error);
    return NextResponse.json(
      { error: 'Failed to create scenario table entry' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const validated = validateEntryPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const table = await loadTable(supabase, validated.data.scenario_table_id);
    if ('error' in table) {
      return NextResponse.json({ error: table.error }, { status: 400 });
    }

    const crewRules = validateCrewRules(body.crew_rules, table.tableType);
    if ('error' in crewRules) {
      return NextResponse.json({ error: crewRules.error }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('scenario_table_entries')
      .select('id, scenario_table_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Battles point at entries by slot, so an entry may move between tables
    // only when the slot it fills stays the same.
    const currentTable = await loadTable(supabase, existing.scenario_table_id);
    if (
      'error' in currentTable ||
      currentTable.editionId !== table.editionId ||
      currentTable.tableType !== table.tableType
    ) {
      return NextResponse.json(
        { error: 'An entry can only move to a table of the same edition and type' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('scenario_table_entries')
      .update({
        ...validated.data,
        edition_id: table.editionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }

    if (crewRules.data) {
      await replaceCrewRules(supabase, id, crewRules.data);
    }

    const entry = await loadEntry(supabase, id);
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error updating scenario table entry:', error);
    return NextResponse.json(
      { error: 'Failed to update scenario table entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('scenario_table_entries')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Crew rules go with the entry (ON DELETE CASCADE). Battles that recorded
    // it block the delete through their ON DELETE RESTRICT foreign keys.
    const { error } = await supabase
      .from('scenario_table_entries')
      .delete()
      .eq('id', id);

    if (error) {
      if (isMissingRowError(error)) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }
      if (postgresCode(error) === '23503') {
        return NextResponse.json(
          { error: 'Cannot delete entry while battles still reference it' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario table entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete scenario table entry' },
      { status: 500 }
    );
  }
}
