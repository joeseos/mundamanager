'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { capturedOutcomeTableFor, type CapturedOutcome } from '@/utils/dice';
import { editFighterStatus } from '@/app/actions/edit-fighter';

/**
 * What the form shows for the D6 rolled after a Captured result, for editions
 * that roll one. The outcome itself is form state, reset with the selection.
 */
export function capturedOutcomeFields(
  editionSlug: string | null | undefined,
  requiresCaptured: boolean,
  outcome: string
) {
  const table = requiresCaptured ? capturedOutcomeTableFor(editionSlug) : null;
  return {
    /** Entries for ScenarioEntryPicker, or null when no roll is due. */
    entries: table?.map((entry) => ({
      id: entry.name,
      name: entry.name,
      d6_min: entry.range[0],
      d6_max: entry.range[1],
    })) ?? null,
    outcome: table ? (outcome as CapturedOutcome | '') : '',
    missing: table !== null && !outcome,
    // Only a Ransomed model stays captured, so only then is there a captor to name.
    showsCaptor: requiresCaptured && (table === null || outcome === 'Ransomed'),
  };
}

/** A Daring Escape adds no injury: the model only goes into Recovery. */
export function useDaringEscape(fighterId: string, inRecovery: boolean, onRecovery: () => void) {
  const mutation = useMutation({
    mutationFn: async () => {
      // 'recover' toggles, so it is only sent while the model is out of Recovery.
      const result = await editFighterStatus({ fighter_id: fighterId, action: 'recover' });
      if (!result.success) throw new Error(result.error || 'Failed to send to Recovery');
    },
    onSuccess: () => {
      onRecovery();
      toast.success('Daring Escape: sent to Recovery');
    },
    onError: (error) => toast.error(error.message),
  });

  return () => {
    if (inRecovery) toast.success('Daring Escape: already in Recovery');
    else mutation.mutate();
  };
}
