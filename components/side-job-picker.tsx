'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScenarioEntryPicker } from '@/components/scenario-entry-picker';
import { cn } from '@/app/lib/utils';
import { coreScenarioTable, houseSideJobTable, type ScenarioTableWithEntries } from '@/types/campaign';

interface SideJobPickerProps {
  /** Keeps the checkbox ids unique per gang. */
  id: string | number;
  scenarioTables: ScenarioTableWithEntries[];
  gangTypeId: string | null | undefined;
  value: string;
  /** Left out, the Side Job is shown read-only. */
  onChange?: (sideJobId: string) => void;
  /** A custom Side Job's name, kept with no entry. Picking an entry is expected to clear it, and naming one the entry. */
  customName?: string;
  /** Left out, Custom is not offered. */
  onCustomNameChange?: (name: string) => void;
  /** Saves a custom name when its field loses focus instead of on every key, for a screen that saves each change. */
  saveCustomNameOnBlur?: boolean;
  completed: boolean;
  /** Left out, the completed checkbox is hidden. */
  onCompletedChange?: (completed: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * An N26 gang's Side Job: rolled on the core table or, for a house gang, its
 * house's, or Custom, named by hand; and whether the gang completed it.
 */
export function SideJobPicker({
  id,
  scenarioTables,
  gangTypeId,
  value,
  onChange,
  customName,
  onCustomNameChange,
  saveCustomNameOnBlur,
  completed,
  onCompletedChange,
  disabled,
  className,
}: SideJobPickerProps) {
  const coreTable = coreScenarioTable(scenarioTables, 'side_job');
  const houseTable = houseSideJobTable(scenarioTables, gangTypeId);
  // The picked Side Job's table, or with none picked, the table checked.
  const [houseChosen, setHouseChosen] = useState(false);
  const fromHouse = !!houseTable && (value ? houseTable.entries.some((entry) => entry.id === value) : houseChosen);

  const entry = [coreTable, houseTable]
    .flatMap((table) => table?.entries ?? [])
    .find((candidate) => candidate.id === value);

  return (
    <div className={cn('space-y-2', className)}>
      {onChange ? (
        <>
          {houseTable && (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[
                { house: false, name: 'Core Side Jobs' },
                { house: true, name: houseTable.name },
              ].map(({ house, name }) => (
                <div key={name} className="flex items-center space-x-2">
                  <Checkbox
                    id={`side-job-table-${id}-${house ? 'house' : 'core'}`}
                    checked={fromHouse === house}
                    onCheckedChange={() => {
                      if (fromHouse === house) return;
                      setHouseChosen(house);
                      if (value) onChange('');
                    }}
                    disabled={disabled}
                  />
                  <Label htmlFor={`side-job-table-${id}-${house ? 'house' : 'core'}`} className="text-sm">
                    {name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          <ScenarioEntryPicker
            label="Side Job"
            entries={(fromHouse ? houseTable : coreTable)?.entries ?? []}
            value={value}
            onChange={onChange}
            customName={customName}
            onCustomNameChange={onCustomNameChange}
            customPlaceholder="Enter custom Side Job name"
            saveCustomNameOnBlur={saveCustomNameOnBlur}
            placeholder="Select a Side Job"
            disabled={disabled}
          />
        </>
      ) : (
        <p className="text-sm">
          <span className="text-muted-foreground">Side Job:</span>{' '}
          {entry ? `${entry.d6_min}. ${entry.name}` : customName || 'Unknown'}
          {completed && !onCompletedChange && <span className="text-muted-foreground"> (completed)</span>}
        </p>
      )}
      {onCompletedChange && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`side-job-completed-${id}`}
            checked={completed}
            onCheckedChange={(checked) => onCompletedChange(checked === true)}
            disabled={disabled || (!value && !customName)}
          />
          <Label htmlFor={`side-job-completed-${id}`} className="text-sm">
            Side Job completed
          </Label>
        </div>
      )}
    </div>
  );
}
