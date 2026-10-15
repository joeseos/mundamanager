'use client';

import { ScenarioEntryPicker } from '@/components/scenario-entry-picker';
import {
  coreScenarioTable,
  SCENARIO_PARTS,
  typedPartNames,
  type ScenarioPart,
  type ScenarioTableWithEntries,
} from '@/types/campaign';
import type { ScenarioPartEdit, ScenarioParts } from '@/utils/scenario-parts';

interface ScenarioPartsPickerProps {
  /** The battle edition's scenario tables. */
  scenarioTables: ScenarioTableWithEntries[];
  parts: ScenarioParts;
  /**
   * One part's new entry and custom name (each null when the other is set or
   * both cleared), for a form that saves the whole battle; and the edit alone,
   * for a screen that saves each change.
   */
  onChange: (change: ScenarioParts, edit: ScenarioPartEdit) => void;
  /** Saves a typed name when its field loses focus instead of on every key, for a screen that saves each change. */
  saveTypedNamesOnBlur?: boolean;
  /** Marks every part as needed. */
  required?: boolean;
  disabled?: boolean;
}

/**
 * An N26 battle's Deployment, Objective and Crew, each rolled on the core
 * table. Each may also be Custom, named by hand as an N23 battle names a custom
 * scenario, and kept in the part's name column.
 */
export function ScenarioPartsPicker({
  scenarioTables,
  parts,
  onChange,
  saveTypedNamesOnBlur,
  required,
  disabled,
}: ScenarioPartsPickerProps) {
  const entriesOf = (part: ScenarioPart) => coreScenarioTable(scenarioTables, part.tableType)?.entries ?? [];
  const typed = typedPartNames(parts);

  const change = (changed: ScenarioPart, entryId: string, typedName?: string) => {
    const edit = { key: changed.key, entryId: entryId || null, typedName };
    onChange({ [changed.key]: edit.entryId, [changed.nameKey]: typedName || null }, edit);
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
          onCustomNameChange={(name) => change(part, '', name)}
          customPlaceholder={`Enter custom ${part.label} name`}
          saveCustomNameOnBlur={saveTypedNamesOnBlur}
          placeholder={part.placeholder}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
