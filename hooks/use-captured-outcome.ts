'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { capturedOutcomeTableFor, type CapturedOutcome } from '@/utils/dice';
import { editFighterStatus } from '@/app/actions/edit-fighter';

/**
 * The D6 rolled after a Captured result, for editions that roll one. The
 * outcome belongs to the selected injury or damage, so picking another clears it.
 */
export function useCapturedOutcome(
  editionSlug: string | null | undefined,
  selectedId: string,
  requiresCaptured: boolean
) {
  const [picked, setPicked] = useState<{ forId: string; outcome: CapturedOutcome } | null>(null);
  const table = requiresCaptured ? capturedOutcomeTableFor(editionSlug) : null;
  const outcome = table && picked?.forId === selectedId ? picked.outcome : null;

  return {
    /** Entries for ScenarioEntryPicker, or null when no roll is due. */
    entries: table?.map((entry) => ({
      id: entry.name,
      name: entry.name,
      d6_min: entry.range[0],
      d6_max: entry.range[1],
    })) ?? null,
    outcome,
    setOutcome: (name: string) =>
      setPicked(name ? { forId: selectedId, outcome: name as CapturedOutcome } : null),
    missing: table !== null && outcome === null,
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
