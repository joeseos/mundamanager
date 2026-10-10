// `scenario_tables` are the printed D6 tables an N26 battle is generated from
// (Deployment, Objective, Side Job, Crew); `scenario_table_entries` are their
// lines, and `scenario_crew_selection_rules` say how a Crew entry builds each
// gang's starting crew. Kept dependency-free so client components can import it.

export const SCENARIO_TABLE_TYPES = ['deployment', 'objective', 'side_job', 'crew_selection'] as const;

export type ScenarioTableType = (typeof SCENARIO_TABLE_TYPES)[number];

export const SCENARIO_TABLE_TYPE_LABELS: Record<ScenarioTableType, string> = {
  deployment: 'Deployment',
  objective: 'Objective',
  side_job: 'Side Job',
  crew_selection: 'Crew',
};

export function isScenarioTableType(value: unknown): value is ScenarioTableType {
  return typeof value === 'string' && (SCENARIO_TABLE_TYPES as readonly string[]).includes(value);
}

export interface ScenarioTable {
  id: string;
  name: string;
  edition_id: string;
  /** NULL is the edition's core table for its type; a value is that house's table. */
  gang_type_id: string | null;
  table_type: ScenarioTableType;
}

export interface ScenarioTableEntry {
  id: string;
  name: string;
  d6_min: number;
  d6_max: number;
  scenario_table_id: string;
  edition_id: string;
}

export type CrewSelectionRole = 'attacker' | 'defender';

export interface ScenarioCrewSelectionRule {
  /** NULL applies to both gangs. */
  role: CrewSelectionRole | null;
  chosen_count: string;
  random_count: string;
  reinforcement_count: number | null;
  reinforcements_per_round: string | null;
  reinforcements_from_round: number | null;
}

/** Same pattern as scenario_crew_selection_rules_dice_format_check: '10', 'D3', '2D6', 'D3+1'. */
export const DICE_NOTATION_RE = /^([0-9]+|[0-9]*D[0-9]+(\+[0-9]+)?)$/;

export function formatD6Range(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

/** Printed table order: D6 ascending, then name. */
export function compareScenarioTableEntries(
  a: Pick<ScenarioTableEntry, 'name' | 'd6_min'>,
  b: Pick<ScenarioTableEntry, 'name' | 'd6_min'>
): number {
  return a.d6_min - b.d6_min || a.name.localeCompare(b.name);
}

/**
 * The book's wording for a crew rule, e.g. "Hybrid (3+D3), Reinforcements (5)".
 * The method is not stored: chosen only is Custom, random only is Random, both
 * is Hybrid.
 */
export function describeCrewSelectionRule(rule: ScenarioCrewSelectionRule): string {
  const chosen = rule.chosen_count !== '0';
  const random = rule.random_count !== '0';
  const method = chosen && random
    ? `Hybrid (${rule.chosen_count}+${rule.random_count})`
    : random
      ? `Random (${rule.random_count})`
      : `Custom (${rule.chosen_count})`;
  return rule.reinforcement_count == null
    ? method
    : `${method}, Reinforcements (${rule.reinforcement_count})`;
}
