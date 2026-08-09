'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * What every `verifyAndLogRolled*` server action returns.
 */
type LogRollResult = { success: boolean; error?: string };

interface UseRollLoggerOptions<TVars> {
  /** The server action to call. Bind the fighter/vehicle id at the call site. */
  log: (variables: TVars) => Promise<LogRollResult>;
  /** Toast on success. Omit to stay silent — the vehicle damage roller does. */
  successMessage?: string;
  /** Fallback message when the action fails without one of its own. */
  errorMessage: string;
  /** Debounce window after a roll is submitted. */
  cooldownMs?: number;
}

export interface RollLogger<TVars> {
  /**
   * Submits a roll for logging. Returns false when the call was refused because
   * one is already in flight or the cooldown has not elapsed, so a caller that
   * also updates local state can skip that work.
   */
  logRoll: (variables: TVars) => boolean;
  isPending: boolean;
  /** `isPending || coolingDown` — feeds a DiceRoller's `disabled` prop. */
  disabled: boolean;
}

/**
 * Logging a dice roll to the gang log, with a debounce.
 *
 * Five call sites across the advancement, injury and vehicle-damage lists were
 * each repeating the same mutation — call the action, throw when `success` is
 * false, toast either way — alongside a hand-rolled `useState` boolean and a
 * `setTimeout` to stop double submissions.
 *
 * Note the cooldown is released on a timer rather than when the request settles.
 * That is deliberate and matches the behaviour it replaces: the point is to
 * absorb a double-click, not to serialise requests. `isPending` covers the
 * in-flight case on its own.
 */
export function useRollLogger<TVars>({
  log,
  successMessage,
  errorMessage,
  cooldownMs = 2000,
}: UseRollLoggerOptions<TVars>): RollLogger<TVars> {
  const [coolingDown, setCoolingDown] = useState(false);

  // Read synchronously inside logRoll: two clicks in the same tick would both
  // see the state variable as false, since React batches the update.
  const coolingDownRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (variables: TVars) => {
      const result = await log(variables);
      if (!result.success) throw new Error(result.error || errorMessage);
      return result;
    },
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
    },
    onError: (e: Error) => {
      toast.error(e?.message || errorMessage);
    },
  });

  const { mutate, isPending } = mutation;

  const logRoll = useCallback(
    (variables: TVars): boolean => {
      if (coolingDownRef.current || isPending) return false;

      coolingDownRef.current = true;
      setCoolingDown(true);
      mutate(variables);
      setTimeout(() => {
        coolingDownRef.current = false;
        setCoolingDown(false);
      }, cooldownMs);

      return true;
    },
    [mutate, isPending, cooldownMs],
  );

  return { logRoll, isPending, disabled: isPending || coolingDown };
}
