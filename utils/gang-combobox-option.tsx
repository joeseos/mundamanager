/**
 * Shared utility for rendering a gang as a Combobox option with a colour dot.
 * Use this wherever a Combobox lists campaign gangs so that the dot markup,
 * fallback colour, and displayValue format stay consistent across the app.
 *
 * @param gang          - The gang data to render.
 * @param labelSuffix   - Optional extra JSX appended after the owner in the label
 *                        (e.g. an "Already assigned" badge). Does not affect displayValue.
 * @param displayValueSuffix - Optional plain-text suffix appended to displayValue
 *                             (e.g. " (Already assigned)").
 */

import type { ReactNode } from 'react';

export interface GangForOption {
  id: string;
  name: string;
  gang_colour?: string | null;
  owner_username?: string | null;
}

export function buildGangComboboxOption(
  gang: GangForOption,
  {
    labelSuffix,
    displayValueSuffix = '',
  }: { labelSuffix?: ReactNode; displayValueSuffix?: string } = {}
) {
  const owner = gang.owner_username ? ` \u2022 ${gang.owner_username}` : '';
  const colour = gang.gang_colour || '#000000';
  return {
    value: gang.id,
    label: (
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: colour }}
          aria-hidden
        />
        <span>{gang.name}</span>
        {owner && <span className="text-xs text-muted-foreground">{owner}</span>}
        {labelSuffix}
      </span>
    ),
    displayValue: `${gang.name}${owner}${displayValueSuffix}`,
  };
}
