import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SCENARIO_PARTS,
  scenarioPartsLabel,
  type BattleParticipant,
  type ScenarioPartKey,
} from '@/types/campaign';

/** An N26 battle's Deployment, Objective and Crew, as scenario_table_entries ids. */
export type ScenarioParts = Partial<Record<ScenarioPartKey, string | null>>;

/** A to-one embed, which may arrive as an array. */
const one = <T,>(embed: T | T[] | null | undefined): T | undefined =>
  Array.isArray(embed) ? embed[0] : embed ?? undefined;

/**
 * Checks N26 scenario parts against a battle's edition: each entry must come
 * from a table of its kind in that edition, and a gang's Side Job from the core
 * table or the gang's own house table (its alternate lists use the house's).
 * The edition is only looked up when there is something to check. Returns the
 * Deployment and Objective as the scenario's label for logs and notifications.
 *
 * Shared by the battle log and battle session actions; lives in utils/ so
 * neither 'use server' file has to export it.
 */
export async function checkScenarioParts(
  supabase: SupabaseClient,
  editionId: () => Promise<string | null | undefined>,
  parts: ScenarioParts,
  participants: Pick<BattleParticipant, 'gang_id' | 'side_job_id'>[]
): Promise<{ error: string } | { label: string }> {
  const sideJobGangs = participants.filter((p) => p.side_job_id);
  const ids = [
    ...SCENARIO_PARTS.map((part) => parts[part.key]),
    ...sideJobGangs.map((p) => p.side_job_id),
  ].filter((id): id is string => !!id);
  if (ids.length === 0) return { label: '' };

  const [entriesResult, battleEditionId, gangsResult] = await Promise.all([
    supabase
      .from('scenario_table_entries')
      .select('id, name, edition_id, scenario_tables!scenario_table_entries_scenario_table_id_fkey (table_type, gang_type_id)')
      .in('id', ids),
    editionId(),
    sideJobGangs.length > 0
      ? supabase
          .from('gangs')
          .select('id, gang_type_id, gang_types (parent_gang_type_id)')
          .in('id', sideJobGangs.map((p) => p.gang_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (gangsResult.error) throw gangsResult.error;

  const entries = new Map(
    (entriesResult.data ?? []).map((entry: any) => [entry.id, { ...entry, table: one<any>(entry.scenario_tables) }])
  );
  const entryOn = (id: string, tableType: string) => {
    const entry = entries.get(id);
    return entry && entry.edition_id === battleEditionId && entry.table?.table_type === tableType ? entry : undefined;
  };

  for (const part of SCENARIO_PARTS) {
    const id = parts[part.key];
    if (id && !entryOn(id, part.tableType)) {
      return { error: `That ${part.label} is not on this battle's scenario tables` };
    }
  }
  for (const participant of sideJobGangs) {
    const entry = entryOn(participant.side_job_id!, 'side_job');
    const gang: any = (gangsResult.data ?? []).find((g: any) => g.id === participant.gang_id);
    const houses = [gang?.gang_type_id, one<any>(gang?.gang_types)?.parent_gang_type_id];
    if (!entry || (entry.table.gang_type_id && !houses.includes(entry.table.gang_type_id))) {
      return { error: 'A Side Job is not one that gang can roll' };
    }
  }

  return {
    label: scenarioPartsLabel(
      parts.deployment_id ? entries.get(parts.deployment_id)?.name : null,
      parts.objective_id ? entries.get(parts.objective_id)?.name : null
    ),
  };
}
