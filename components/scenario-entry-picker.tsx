'use client';

import { useState } from 'react';
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
  /**
   * Given, the options start with Custom, which opens a field for a name not
   * on the table, as N23's scenario picker does. Picking an entry is expected
   * to clear the custom name, and naming one the entry.
   */
  customName?: string;
  onCustomNameChange?: (name: string) => void;
  customPlaceholder?: string;
  /** Takes out what a custom name may not hold, as it is typed. */
  cleanCustomName?: (name: string) => string;
  /** Saves the custom name when its field loses focus instead of on every key. */
  saveCustomNameOnBlur?: boolean;
  placeholder: string;
  disabled?: boolean;
}

const CUSTOM = 'custom';

/**
 * Picks an entry of an N26 scenario table, with a D6 roll beside the picker.
 * The picker shows what was rolled, so the roller's own result line is hidden.
 */
export function ScenarioEntryPicker({
  label,
  entries,
  value,
  onChange,
  customName,
  onCustomNameChange,
  customPlaceholder,
  cleanCustomName,
  saveCustomNameOnBlur,
  placeholder,
  disabled,
}: ScenarioEntryPickerProps) {
  // Custom stays open while its name is empty; the field keeps what is typed while it has focus.
  const [customChosen, setCustomChosen] = useState(!!customName);
  const [draft, setDraft] = useState<string | null>(null);
  const custom = !!onCustomNameChange && !value && (customChosen || !!customName);
  // The field can close without losing focus, as when someone else picks an entry.
  if (!custom && draft !== null) setDraft(null);

  const pickEntry = (entryId: string) => {
    setCustomChosen(false);
    setDraft(null);
    onChange(entryId);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Combobox
          className="flex-1"
          value={custom ? CUSTOM : value}
          onValueChange={(picked) => {
            if (picked !== CUSTOM) return pickEntry(picked);
            setCustomChosen(true);
            if (value) onChange('');
          }}
          options={[
            ...(onCustomNameChange ? [{ value: CUSTOM, label: 'Custom' }] : []),
            ...entries.map((entry) => ({ value: entry.id, label: `${entry.d6_min}. ${entry.name}` })),
          ]}
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
            if (rolled[0]) pickEntry(rolled[0].item.id);
          }}
        />
      </div>
      {custom && (
        <div className="mt-2">
          <input
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-muted"
            placeholder={customPlaceholder}
            value={draft ?? customName ?? ''}
            onChange={(e) => {
              const name = cleanCustomName ? cleanCustomName(e.target.value) : e.target.value;
              setDraft(name);
              if (!saveCustomNameOnBlur) onCustomNameChange?.(name);
            }}
            onBlur={() => {
              if (saveCustomNameOnBlur && draft !== null && draft.trim() !== (customName ?? '')) {
                onCustomNameChange?.(draft.trim());
              }
              setDraft(null);
            }}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
