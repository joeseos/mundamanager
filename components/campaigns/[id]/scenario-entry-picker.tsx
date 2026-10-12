'use client';

import { Combobox } from '@/components/ui/combobox';
import DiceRoller from '@/components/dice-roller';
import { rollNd6Outcome } from '@/utils/dice';
import type { ScenarioTableEntry } from '@/types/campaign';

interface ScenarioEntryPickerProps {
  label: string;
  /** One table's entries, in printed order. */
  entries: ScenarioTableEntry[];
  value: string;
  onChange: (entryId: string) => void;
  placeholder: string;
  disabled?: boolean;
}

/**
 * Picks an entry of an N26 scenario table, with a D6 roll beside the picker.
 * The picker shows what was rolled, so the roller's own result line is hidden.
 */
export function ScenarioEntryPicker({ label, entries, value, onChange, placeholder, disabled }: ScenarioEntryPickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Combobox
          className="flex-1"
          value={value}
          onValueChange={onChange}
          options={entries.map((entry) => ({ value: entry.id, label: `${entry.d6_min}. ${entry.name}` }))}
          placeholder={placeholder}
          clearable
          disabled={disabled}
        />
        <DiceRoller<ScenarioTableEntry>
          items={entries}
          getRange={(entry) => ({ min: entry.d6_min, max: entry.d6_max })}
          getName={(entry) => entry.name}
          inline
          showResult={false}
          rollFn={() => rollNd6Outcome(1)}
          buttonText="Roll D6"
          disabled={disabled || entries.length === 0}
          onRolled={(rolled) => {
            if (rolled[0]) onChange(rolled[0].item.id);
          }}
        />
      </div>
    </div>
  );
}
