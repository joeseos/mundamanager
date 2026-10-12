'use client';

import { ScenarioEntryPicker } from '@/components/scenario-entry-picker';
import {
  coreScenarioTable,
  SCENARIO_PARTS,
  TYPEABLE_SCENARIO_PARTS,
  typedScenarioName,
  typedScenarioParts,
  typedScenarioText,
  type ScenarioPart,
  type ScenarioTableWithEntries,
} from '@/types/campaign';
import type { ScenarioPartEdit, ScenarioParts } from '@/utils/scenario-parts';

interface ScenarioPartsPickerProps {
  /** The battle edition's scenario tables. */
  scenarioTables: ScenarioTableWithEntries[];
  parts: ScenarioParts;
  /** The battle's scenario text, which keeps a typed Deployment or Objective. */
  scenario: string | null | undefined;
  /**
   * One part's new entry (null when typed or cleared) and the scenario text to
   * go with it, for a form that saves the whole battle; and the edit alone, for
   * a screen that saves each change and builds the text from the saved battle.
   */
  onChange: (change: ScenarioParts & { scenario: string }, edit: ScenarioPartEdit) => void;
  /** Saves a typed name when its field loses focus instead of on every key, for a screen that saves each change. */
  saveTypedNamesOnBlur?: boolean;
  /** Marks every part as needed. */
  required?: boolean;
  disabled?: boolean;
}

/**
 * An N26 battle's Deployment, Objective and Crew, each rolled on the core
 * table. A Deployment or Objective may also be Custom, named by hand as an N23
 * battle names a custom scenario; see typedScenarioParts for how it is kept.
 */
export function ScenarioPartsPicker({
  scenarioTables,
  parts,
  scenario,
  onChange,
  saveTypedNamesOnBlur,
  required,
  disabled,
}: ScenarioPartsPickerProps) {
  const entriesOf = (part: ScenarioPart) => coreScenarioTable(scenarioTables, part.tableType)?.entries ?? [];
  const typed = typedScenarioParts(scenario, !!parts.deployment_id, !!parts.objective_id);

  const entryName = (entryId: string) =>
    SCENARIO_PARTS.flatMap(entriesOf).find((entry) => entry.id === entryId)?.name;

  const change = (changed: ScenarioPart, entryId: string, typedName?: string) => {
    const edit = { key: changed.key, entryId: entryId || null, typedName };
    const scenarioText = typedScenarioText(
      { ...parts, [changed.key]: edit.entryId },
      { ...typed, [changed.key]: typedName },
      entryName
    );
    onChange({ [changed.key]: edit.entryId, scenario: scenarioText }, edit);
  };

  return (
    <div className="space-y-3">
      {SCENARIO_PARTS.map((part) => (
        <ScenarioEntryPicker
          key={part.key}
          label={`${part.label}${required ? ' *' : ''}`}
          entries={entriesOf(part)}
          value={parts[part.key] ?? ''}
          onChange={(entryId) => change(part, entryId)}
          customName={typed[part.key]}
          onCustomNameChange={TYPEABLE_SCENARIO_PARTS.includes(part.key) ? (name) => change(part, '', name) : undefined}
          customPlaceholder={`Enter custom ${part.label} name`}
          cleanCustomName={typedScenarioName}
          saveCustomNameOnBlur={saveTypedNamesOnBlur}
          placeholder={part.placeholder}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
