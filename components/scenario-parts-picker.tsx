'use client';

import { ScenarioEntryPicker } from '@/components/scenario-entry-picker';
import {
  coreScenarioTable,
  SCENARIO_PARTS,
  TYPEABLE_SCENARIO_PARTS,
  typedPartNames,
  typedScenarioName,
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
   * One part's new entry (null when typed or cleared), the scenario text and
   * custom Crew name to go with it, for a form that saves the whole battle; and
   * the edit alone, for a screen that saves each change and builds the text
   * from the saved battle.
   */
  onChange: (change: ScenarioParts & { scenario: string }, edit: ScenarioPartEdit) => void;
  /** Saves a typed name when its field loses focus instead of on every key, for a screen that saves each change. */
  saveTypedNamesOnBlur?: boolean;
  /** Marks every part as needed. */
  required?: boolean;
  /** The battle has a scenario name, which takes the scenario text, so a Deployment or Objective can't be typed. */
  scenarioNamed?: boolean;
  disabled?: boolean;
}

/**
 * An N26 battle's Deployment, Objective and Crew, each rolled on the core
 * table. Each may also be Custom, named by hand as an N23 battle names a custom
 * scenario; see typedPartNames for how it is kept.
 */
export function ScenarioPartsPicker({
  scenarioTables,
  parts,
  scenario,
  onChange,
  saveTypedNamesOnBlur,
  required,
  scenarioNamed,
  disabled,
}: ScenarioPartsPickerProps) {
  const entriesOf = (part: ScenarioPart) => coreScenarioTable(scenarioTables, part.tableType)?.entries ?? [];
  const typed = typedPartNames({ ...parts, scenario: scenarioNamed ? null : scenario });
  const typeable = (part: ScenarioPart) => TYPEABLE_SCENARIO_PARTS.includes(part.key);

  const entryName = (entryId: string) =>
    SCENARIO_PARTS.flatMap(entriesOf).find((entry) => entry.id === entryId)?.name;

  const change = (changed: ScenarioPart, entryId: string, typedName?: string) => {
    const edit = { key: changed.key, entryId: entryId || null, typedName };
    const scenarioText = typedScenarioText(
      { ...parts, [changed.key]: edit.entryId },
      { ...typed, [changed.key]: typedName },
      entryName
    );
    const crewName = changed.key === 'crew_selection_id' ? { crew_selection_name: typedName || null } : {};
    onChange({ [changed.key]: edit.entryId, ...crewName, scenario: scenarioText }, edit);
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
          onCustomNameChange={scenarioNamed && typeable(part) ? undefined : (name) => change(part, '', name)}
          customPlaceholder={`Enter custom ${part.label} name`}
          cleanCustomName={typeable(part) ? typedScenarioName : undefined}
          saveCustomNameOnBlur={saveTypedNamesOnBlur}
          placeholder={part.placeholder}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
