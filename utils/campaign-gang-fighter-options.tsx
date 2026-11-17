import { useCallback, useMemo, type ReactNode } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import { fetchCampaignGangsAndFighters } from '@/utils/api/fighter-ooa-records';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';

export interface CampaignFighterComboboxOption {
  value: string;
  label: ReactNode;
  displayValue: string;
}

/**
 * Builds a Combobox option for a fighter, styling type/subtype like the gang
 * owner's muted suffix in {@link buildGangComboboxOption}.
 */
export function buildFighterComboboxOption(fighter: {
  id: string;
  fighter_name?: string | null;
  fighter_type?: string | null;
  fighter_subtypes?: string[];
}, editionSlug?: string | null): CampaignFighterComboboxOption {
  const displayName = fighter.fighter_name || 'Unnamed';
  const typePart = fighter.fighter_type?.trim() || '';
  const subtypeDisplay = formatFighterSubtypeDisplay(fighter.fighter_subtypes, editionSlug);
  const subtypePart = subtypeDisplay ? `(${subtypeDisplay})` : '';
  const details = [typePart, subtypePart].filter(Boolean).join(' ');
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
export function useCampaignGangFighterOptions(
  campaignGangs: CampaignGangWithFighters[],
  editionSlug?: string | null,
) {
  const getFighterOptions = useMemo(() => {
    return (selectedGangId?: string, crewOnly?: boolean): CampaignFighterComboboxOption[] => {
      const gang = campaignGangs.find((g) => g.gang_id === selectedGangId);
      if (!gang) return [];
      return gang.fighters
        .filter((f) => !crewOnly || f.fighter_subtypes?.includes('Crew'))
        .map((f) => buildFighterComboboxOption(f, editionSlug));
    };
  }, [campaignGangs, editionSlug]);

  return { getFighterOptions };
}

/**
 * The other gangs, with their fighters, across a fighter's campaigns, for the
 * captured-by and hatred target pickers. One query per campaign, under the key
 * the Add XP and OOA history modals use; staleTime 0 refetches on every enable,
 * since recruits and new campaign gangs don't invalidate it. Empty while not
 * enabled, even when those queries are cached.
 */
export function useOtherCampaignGangs(campaignIds: string[], gangId: string, enabled: boolean) {
  const combine = useCallback(
    (results: UseQueryResult<CampaignGangWithFighters[]>[]) => {
      const gangs = new Map<string, CampaignGangWithFighters>();
      if (enabled) {
        for (const gang of results.flatMap((result) => result.data ?? [])) {
          if (gang.gang_id !== gangId && !gangs.has(gang.gang_id)) gangs.set(gang.gang_id, gang);
        }
      }
      return { gangs: [...gangs.values()], isLoading: results.some((result) => result.isLoading) };
    },
    [gangId, enabled],
  );

  return useQueries({
    queries: campaignIds.map((campaignId) => ({
      queryKey: ['campaign-gangs-fighters', gangId, campaignId],
      queryFn: () => fetchCampaignGangsAndFighters({ campaignId, gangId }),
      enabled,
      staleTime: 0,
    })),
    combine,
  });
}
