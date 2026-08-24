'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@/components/ui/combobox';
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { useCampaignGangFighterOptions } from '@/utils/campaign-gang-fighter-options';
import { sameEditionForDisplay } from '@/types/edition';
import type { HatredTargetKind } from '@/utils/injuryTarget';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';

interface GangTypeRow {
  gang_type_id: string;
  gang_type: string;
  edition_slug: string | null;
  is_custom?: boolean;
}

export interface InjuryHatredTargetPickerProps {
  /** Which target the selected injury needs. Null renders nothing. */
  hatredTarget: HatredTargetKind | null;
  /**
   * Own gang already excluded. Supplied by the caller, not fetched here: the
   * fighter page offers every gang in the campaign, a battle session only the
   * gangs in that battle.
   */
  candidateGangs: CampaignGangWithFighters[];
  isLoadingCandidates?: boolean;
  /** True when the fighter's gang is in no campaign, so there is no opponent to name. */
  isSkirmish?: boolean;
  editionSlug?: string | null;
  /** The submitted value: a gang id, gang type id, or fighter id. */
  value: string;
  onChange: (value: string) => void;
  /** First step of the fighter picker. Not submitted — it only narrows the fighter list. */
  gangStepValue: string;
  onGangStepChange: (value: string) => void;
}

/**
 * Picks the Hatred (X) target for an Enmity lasting injury. Which picker shows
 * is driven by the injury's declared `hatred_target`, not by its name.
 */
export function InjuryHatredTargetPicker({
  hatredTarget,
  candidateGangs,
  isLoadingCandidates = false,
  isSkirmish = false,
  editionSlug,
  value,
  onChange,
  gangStepValue,
  onGangStepChange,
}: InjuryHatredTargetPickerProps) {
  const { getFighterOptions } = useCampaignGangFighterOptions(candidateGangs);

  // Gang types are global, so unlike the candidates they're fetched here. The
  // query is gated: this mounts on every injury add, but only a gang-type
  // target needs them.
  const needsGangTypes = hatredTarget === 'gang_type';

  const { data: gangTypes = [], isLoading: isLoadingGangTypes } = useQuery<GangTypeRow[]>({
    queryKey: ['gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    enabled: needsGangTypes,
    staleTime: 5 * 60 * 1000,
  });

  const gangOptions = useMemo(
    () =>
      candidateGangs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(gang =>
          buildGangComboboxOption({
            id: gang.gang_id,
            name: gang.name,
            gang_colour: gang.gang_colour,
            owner_username: gang.owner_username,
          })
        ),
    [candidateGangs]
  );

  const gangTypeOptions = useMemo(
    () =>
      gangTypes
        .filter(row => !row.is_custom)
        // Own ruleset only. Rows arrive with their slug already resolved, so
        // there is no lookup to wait on.
        .filter(row => sameEditionForDisplay(row.edition_slug, editionSlug))
        .sort((a, b) => a.gang_type.localeCompare(b.gang_type))
        .map(row => ({ value: row.gang_type_id, label: row.gang_type })),
    [gangTypes, editionSlug]
  );

  if (!hatredTarget) return null;

  // The one target that works without a campaign.
  if (hatredTarget === 'gang_type') {
    return (
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Against</label>
        {isLoadingGangTypes ? (
          <p className="text-sm text-muted-foreground">Loading gang types...</p>
        ) : gangTypeOptions.length > 0 ? (
          <Combobox
            options={gangTypeOptions}
            value={value}
            onValueChange={onChange}
            placeholder="Select enemy gang type..."
            clearable
          />
        ) : (
          <p className="text-sm text-muted-foreground">No gang types available for this edition.</p>
        )}
      </div>
    );
  }

  if (isSkirmish) {
    return (
      <p className="text-sm text-muted-foreground">
        In skirmish play, no {hatredTarget === 'fighter' ? 'fighter' : 'gang'} selection is required.
      </p>
    );
  }

  if (isLoadingCandidates) {
    return (
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Against</label>
        <p className="text-sm text-muted-foreground">Loading gangs...</p>
      </div>
    );
  }

  if (candidateGangs.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Against</label>
        <p className="text-sm text-muted-foreground">No other gangs available.</p>
      </div>
    );
  }

  if (hatredTarget === 'gang') {
    return (
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Against</label>
        <Combobox
          options={gangOptions}
          value={value}
          onValueChange={onChange}
          placeholder="Select enemy gang..."
          clearable
        />
      </div>
    );
  }

  // 'fighter': the gang step only narrows the list; only the fighter id is submitted.
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-muted-foreground mb-1">Against</label>
      <Combobox
        options={gangOptions}
        value={gangStepValue}
        onValueChange={(next) => {
          onGangStepChange(next);
          // The previously chosen fighter belongs to the old gang.
          onChange('');
        }}
        placeholder="Select enemy gang..."
        clearable
      />
      <Combobox
        options={getFighterOptions(gangStepValue)}
        value={value}
        onValueChange={onChange}
        placeholder={gangStepValue ? 'Select enemy fighter...' : 'Select a gang first'}
        disabled={!gangStepValue}
        clearable
        noResultsText="No fighters found"
      />
    </div>
  );
}
