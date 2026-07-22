import { useMemo, type ReactNode } from 'react';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';

export interface CampaignFighterComboboxOption {
  value: string;
  label: ReactNode;
  displayValue: string;
}

/**
 * Builds a Combobox option for a fighter, styling type/class like the gang
 * owner's muted suffix in {@link buildGangComboboxOption}.
 */
export function buildFighterComboboxOption(fighter: {
  id: string;
  fighter_name?: string | null;
  fighter_type?: string | null;
  fighter_class?: string | null;
}): CampaignFighterComboboxOption {
  const displayName = fighter.fighter_name || 'Unnamed';
  const typePart = fighter.fighter_type?.trim() || '';
  const classPart = fighter.fighter_class?.trim() ? `(${fighter.fighter_class.trim()})` : '';
  const details = [typePart, classPart].filter(Boolean).join(' ');
  const detailsSuffix = details ? ` \u2022 ${details}` : '';

  return {
    value: fighter.id,
    label: (
      <span className="flex items-center gap-2">
        <span>{displayName}</span>
        {detailsSuffix && (
          <span className="text-xs text-muted-foreground">{detailsSuffix}</span>
        )}
      </span>
    ),
    displayValue: `${displayName}${detailsSuffix}`,
  };
}

/**
 * Shared fighter Combobox option builder for campaign gang pickers used by the
 * Add XP and OOA history modals. Keeps the Crew filter and display format in
 * one place. Gang options should be built at the call site with
 * {@link buildGangComboboxOption}.
 */
export function useCampaignGangFighterOptions(campaignGangs: CampaignGangWithFighters[]) {
  const getFighterOptions = useMemo(() => {
    return (selectedGangId?: string, crewOnly?: boolean): CampaignFighterComboboxOption[] => {
      const gang = campaignGangs.find((g) => g.gang_id === selectedGangId);
      if (!gang) return [];
      return gang.fighters
        .filter((f) => !crewOnly || f.fighter_class === 'Crew')
        .map((f) => buildFighterComboboxOption(f));
    };
  }, [campaignGangs]);

  return { getFighterOptions };
}
