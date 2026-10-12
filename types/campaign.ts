// Campaign-related type definitions

/**
 * Gang reference used when gang is nested under another entity.
 * Uses clean names for id/name, but keeps database column names for gang_type/gang_colour.
 */
export interface GangReference {
  id: string;
  name: string;
  gang_type?: string;
  gang_colour?: string;
}

/**
 * Battle participant with role and gang association.
 * `is_winner` and `claimed_territory` are optional flags stored on the
 * `campaign_battles.participants` JSONB to support multi-winner battles.
 * Both default to `false` when omitted. At most one participant may have
 * `claimed_territory: true`, and only if `is_winner` is also true.
 */
export interface BattleParticipant {
  role: 'attacker' | 'defender' | 'none';
  gang_id: string;
  is_winner?: boolean;
  claimed_territory?: boolean;
  /** N26: the Side Job this gang rolled (a scenario_table_entries id), and whether it was completed. */
  side_job_id?: string | null;
  side_job_completed?: boolean;
}

/**
 * Lifecycle of a battle log. A challenge round creates `challenge_pending` slots
 * (one per gang, no opponent yet); the gang's owner issues it, the challenged
 * gang answers, and filing the report converts the same row to `played`.
 */
export type BattleStatus =
  | 'challenge_pending'
  | 'challenge_issued'
  | 'challenge_accepted'
  | 'challenge_declined'
  | 'played';

export const battleStatusLabels: Record<BattleStatus, string> = {
  challenge_pending: 'Awaiting opponent',
  challenge_issued: 'Challenge issued',
  challenge_accepted: 'Accepted',
  challenge_declined: 'Declined',
  played: 'Played',
};

export const battleStatusColors: Record<BattleStatus, string> = {
  challenge_pending: 'bg-muted text-muted-foreground',
  challenge_issued: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  challenge_accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  challenge_declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  played: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

/** The challenged gang's answer, changeable until the battle is played. */
export const challengeAnswerStatuses: BattleStatus[] = [
  'challenge_issued',
  'challenge_accepted',
  'challenge_declined',
];

/** Rows cached before the status column existed have none; they are all played. */
export function battleStatusOf(battle: Pick<Battle, 'status'>): BattleStatus {
  return battle.status ?? 'played';
}

export function isPlayedBattle(battle: Pick<Battle, 'status'>): boolean {
  return battleStatusOf(battle) === 'played';
}

/**
 * Battle/Battle log data structure
 */
export interface Battle {
  id: string;
  created_at: string;
  updated_at?: string;
  scenario_number?: number;
  scenario_name?: string;
  scenario?: string;
  /** N26: what was rolled on the scenario tables, as scenario_table_entries ids. */
  deployment_id?: string | null;
  objective_id?: string | null;
  crew_selection_id?: string | null;
  winner_id?: string | null;
  note?: string | null;
  participants?: BattleParticipant[] | string;
  campaign_territory_id?: string | null;
  territory_name?: string;
  cycle?: number | null;
  status?: BattleStatus;
  /** Gang that issued the challenge. Not the attacker: that is a scenario role. */
  challenger_gang_id?: string | null;
  /** Gang the challenge was issued to. Null on a slot with no opponent yet. */
  challenged_gang_id?: string | null;
  attacker?: GangReference;
  defender?: GangReference;
  winner?: GangReference;
  /**
   * Full list of winning gangs for the battle. For single-winner battles this
   * mirrors `winner` as a one-element array. Multi-winner battles populate every
   * winning gang here. Empty / undefined means a draw.
   */
  winners?: GangReference[];
  /**
   * The gang that claimed the battle's territory (if any). Always one of
   * `winners` when present.
   */
  territory_claimer?: GangReference | null;
}

/**
 * Campaign gang representation
 */
export interface CampaignGang {
  id: string;
  name: string;
  /** Null for a custom gang type. Picks the house Side Jobs an N26 gang may roll on. */
  gang_type_id?: string | null;
  gang_colour?: string;
  campaign_member_id?: string;
  user_id?: string;
  owner_username?: string;
}

/**
 * Territory data structure
 */
export interface Territory {
  id: string;
  name?: string;
  territory_name?: string;
  controlled_by?: string; // gang_id of controlling gang
  gang_id?: string | null;
  is_custom?: boolean;
  territory_id?: string | null;
}

/** A `campaign_maps` row. */
export interface CampaignMapRow {
  id: string;
  campaign_id: string;
  background_image_url: string;
  hex_grid_enabled: boolean;
  hex_size: number;
  created_at: string;
  updated_at: string | null;
}

/** A `campaign_map_objects` row. */
export interface CampaignMapObjectRow {
  id: string;
  campaign_map_id: string;
  object_type: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export interface CampaignMapBundle {
  map: CampaignMapRow | null;
  objects: CampaignMapObjectRow[];
}

/**
 * A `campaign_territories` row as the cached reader and the add/create mutations
 * return it, before any client-side view shaping.
 */
export interface CampaignTerritoryRow {
  id: string;
  territory_id: string | null;
  territory_name: string;
  gang_id: string | null;
  created_at: string;
  ruined?: boolean;
  default_gang_territory?: boolean;
  playing_card?: string | null;
  description?: string | null;
  map_object_id?: string | null;
  map_hex_coords?: { x: number; y: number; z: number } | null;
  show_name_on_map?: boolean;
  /** The territory reader always populates every gang field, unlike other references. */
  owning_gangs?: Required<GangReference>[];
}

/**
 * Campaign territory with clean structure
 */
export interface CampaignTerritory {
  id: string;                    // campaign_territory ID (unique instance)
  template_id: string | null;    // territory_id (null for custom territories)
  name: string;                  // territory_name
  gang_id?: string | null;
  created_at: string;
  ruined: boolean;
  default_gang_territory: boolean;
  playing_card?: string | null;
  is_custom: boolean;
  owning_gangs: GangReference[];
}

/**
 * Scenario definition
 */
export interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
  edition_slug?: string | null;
}

/**
 * N26 battles have no scenarios to pick from. A scenario is made of its parts,
 * each rolled on a printed D6 table: a Deployment, an Objective and a Crew
 * selection, plus a Side Job for each gang. `scenario_tables` are those tables
 * (`table_type` says which part a table supplies) and `scenario_table_entries`
 * their lines. These types describe what can be rolled; what a battle rolled
 * is stored on the battle itself.
 */
export const SCENARIO_TABLE_TYPES = ['deployment', 'objective', 'side_job', 'crew_selection'] as const;

export type ScenarioTableType = (typeof SCENARIO_TABLE_TYPES)[number];

/**
 * The parts of an N26 scenario rolled once per battle: the battle column each
 * is stored in, and the table it is rolled on. The Deployment and Objective,
 * which name the battle, may also be Custom; see typedScenarioParts.
 */
export const SCENARIO_PARTS = [
  { key: 'deployment_id', tableType: 'deployment', label: 'Deployment', placeholder: 'Select a Deployment' },
  { key: 'objective_id', tableType: 'objective', label: 'Objective', placeholder: 'Select an Objective' },
  { key: 'crew_selection_id', tableType: 'crew_selection', label: 'Crew', placeholder: 'Select a Crew' },
] as const satisfies readonly { key: keyof Battle; tableType: ScenarioTableType; label: string; placeholder: string }[];

export type ScenarioPart = (typeof SCENARIO_PARTS)[number];
export type ScenarioPartKey = ScenarioPart['key'];

/** What the admin edits, and the name of the core table of each type. */
export const SCENARIO_TABLE_TYPE_LABELS: Record<ScenarioTableType, string> = {
  deployment: 'Deployments',
  objective: 'Objectives',
  side_job: 'Side Jobs',
  crew_selection: 'Crew',
};

export function isScenarioTableType(value: unknown): value is ScenarioTableType {
  return typeof value === 'string' && (SCENARIO_TABLE_TYPES as readonly string[]).includes(value);
}

export interface ScenarioTable {
  id: string;
  name: string;
  edition_id: string;
  /** NULL is the edition's core table for its type; a value is that house's Side Jobs table. */
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

/** A scenario table with its entries, as the battle log pickers read it. */
export interface ScenarioTableWithEntries extends ScenarioTable {
  edition_slug: string | null;
  /** For a house table, the house and its alternate lists, which all roll on it. Empty for a core table. */
  gang_type_ids: string[];
  /** In printed table order. */
  entries: ScenarioTableEntry[];
}

/** The edition's core table of a type: the one every gang rolls on. */
export function coreScenarioTable<T extends ScenarioTable>(tables: T[], tableType: ScenarioTableType): T | undefined {
  return tables.find((table) => table.table_type === tableType && !table.gang_type_id);
}

/** The house Side Jobs a gang type may roll on instead of the core ones; alternate lists use their house's. */
export function houseSideJobTable(
  tables: ScenarioTableWithEntries[],
  gangTypeId: string | null | undefined
): ScenarioTableWithEntries | undefined {
  return gangTypeId
    ? tables.find((table) => table.table_type === 'side_job' && table.gang_type_ids.includes(gangTypeId))
    : undefined;
}

/** The parts that name a battle, and may be typed in place of an entry. */
export const TYPEABLE_SCENARIO_PARTS: readonly ScenarioPartKey[] = ['deployment_id', 'objective_id'];

const SCENARIO_SEPARATOR = ' / ';

/**
 * A typed Deployment or Objective has no column of its own: it is kept in the
 * battle's scenario text as "Deployment / Objective", each side the part's
 * typed name or its entry's, and " / Objective" while no Deployment is picked.
 * Reads the typed names back, given which parts have an entry. Text with no
 * separator names the Deployment, unless it was matched to an entry.
 */
export function typedScenarioParts(
  scenario: string | null | undefined,
  hasDeployment: boolean,
  hasObjective: boolean
): Partial<Record<ScenarioPartKey, string>> {
  const text = scenario ?? '';
  if (!text.trim() || (hasDeployment && hasObjective)) return {};
  const first = text.indexOf(SCENARIO_SEPARATOR);
  if (hasDeployment) {
    return first < 0 ? {} : { objective_id: text.slice(first + SCENARIO_SEPARATOR.length).trim() || undefined };
  }
  const last = text.lastIndexOf(SCENARIO_SEPARATOR);
  if (hasObjective) return last < 0 ? {} : { deployment_id: text.slice(0, last).trim() || undefined };
  if (first < 0) return { deployment_id: text.trim() };
  return {
    deployment_id: text.slice(0, first).trim() || undefined,
    objective_id: text.slice(first + SCENARIO_SEPARATOR.length).trim() || undefined,
  };
}

/** A Deployment or Objective as the scenario text holds it: its entry's or typed name. */
export interface ScenarioPartName {
  name?: string;
  typed?: boolean;
}

/** The scenario text that keeps a typed Deployment or Objective; '' when neither is typed. */
export function typedScenarioText(deployment: ScenarioPartName, objective: ScenarioPartName): string {
  if (!deployment.typed && !objective.typed) return '';
  return objective.name ? `${deployment.name ?? ''}${SCENARIO_SEPARATOR}${objective.name}` : deployment.name ?? '';
}

/**
 * What a battle's scenario is called in lists and logs: its Deployment and
 * Objective, from the entries' names given or typed into the scenario text.
 * An N23 battle's scenario text is its name.
 */
export function scenarioLabel(
  scenario: string | null | undefined,
  deploymentName?: string | null,
  objectiveName?: string | null
): string {
  const typed = typedScenarioParts(scenario, !!deploymentName, !!objectiveName);
  return [deploymentName || typed.deployment_id, objectiveName || typed.objective_id]
    .filter(Boolean)
    .join(SCENARIO_SEPARATOR);
}

/** The first part an N26 battle still needs; a typed Deployment or Objective counts. */
export function neededScenarioPart(
  battle: Partial<Record<ScenarioPartKey, string | null>> & { scenario?: string | null }
) {
  const typed = typedScenarioParts(battle.scenario, !!battle.deployment_id, !!battle.objective_id);
  return SCENARIO_PARTS.find((part) => !battle[part.key] && !typed[part.key]);
}

/** Printed table order: D6 ascending, then name. */
export function compareScenarioTableEntries(
  a: Pick<ScenarioTableEntry, 'name' | 'd6_min'>,
  b: Pick<ScenarioTableEntry, 'name' | 'd6_min'>
): number {
  return a.d6_min - b.d6_min || a.name.localeCompare(b.name);
}

/**
 * Campaign member data
 */
export interface Member {
  id?: string;
  user_id: string;
  username: string;
  role: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  invited_at: string;
  joined_at: string | null;
  invited_by: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role: string;
  };
  gangs: {
    // Relationship metadata (from campaign_gangs junction table)
    campaign_gang_id: string;
    campaign_member_id?: string;
    status: string | null;

    // Gang data (clean names for id/name, database names for gang_type/gang_colour)
    id: string;              // gang's actual UUID
    name: string;
    gang_type: string;
    gang_type_id?: string | null;
    gang_colour: string;
    rating?: number;
    wealth?: number;
    reputation?: number;
    territory_count?: number;

    // Allegiance information
    allegiance?: {
      id: string;
      name: string;
      is_custom: boolean;
    } | null;
  }[];
}

/**
 * Minimal campaign reference used in user-facing lists (home, customise pages)
 */
export interface UserCampaign {
  id: string;
  campaign_name: string;
  status: string | null;
  /** Derived from campaign_types; campaigns carry no edition of their own. */
  edition_slug: string | null;
}

/**
 * Campaign type definition (e.g. Dominion, Law & Misrule)
 */
export interface CampaignTypeResource {
  id: string;
  resource_name: string;
}

export interface CampaignType {
  id: string;
  campaign_type_name: string;
  image_url?: string | null;
  trading_posts?: string[] | null;
  /** edition_id is written by the admin editor; edition_slug is what app code
   *  reads, resolved server-side. */
  edition_id?: string | null;
  edition_slug?: string | null;
  campaign_type_resources?: CampaignTypeResource[];
}
