'use client';

import { useState, useMemo, useCallback } from 'react';

interface UseWinnerSelectionParams {
  initialWinnerIds?: string[];
  initialClaimerId?: string | null;
  initialIsDraw?: boolean;
  /**
   * Total number of participants in the battle. Caps the number of winner
   * slots that can be added — you can't have more winners than participants.
   */
  maxParticipants: number;
  /**
   * The currently selected territory ID (empty string = none). The hook uses
   * this to auto-fill the claimer when there is exactly one winner.
   */
  selectedTerritory: string;
}

export interface UseWinnerSelectionResult {
  winners: string[];
  isDraw: boolean;
  claimedByGangId: string;
  setClaimedByGangId: React.Dispatch<React.SetStateAction<string>>;
  /** Filtered winner slots — empty strings (unset slots) are excluded. */
  activeWinners: string[];
  hasAnyWinnerSelected: boolean;
  /** How many Combobox slots to render (always ≥ 1). */
  slotsToRender: number;
  /** Whether the "[+ Add Winner]" button should be shown. */
  canAddAnotherWinner: boolean;
  handleWinnerChange: (slotIndex: number, value: string) => void;
  addWinnerSlot: () => void;
  removeWinnerSlot: (slotIndex: number) => void;
  /**
   * Atomically pre-fills all three winner fields from an existing battle.
   * Use this instead of calling raw setters so the draw/winner invariants
   * are always satisfied.
   */
  loadExistingWinners: (opts: {
    winnerIds: string[];
    claimerId: string | null;
    isDraw: boolean;
  }) => void;
  /**
   * Removes a specific gang ID from the winner slots. Use when a gang is
   * removed from or swapped out of the participants list.
   */
  removeGangFromWinners: (gangId: string) => void;
  /** Resets winners/isDraw/claimedByGangId back to empty defaults. */
  resetWinnerSelection: () => void;
}

/**
 * Manages the multi-winner slot state shared by the campaign battle-log modal
 * and the battle-session complete modal. Extracted here so the two modals
 * share identical logic without duplication.
 *
 * The JSX render block is intentionally kept inline per modal because the two
 * modals build their gang options differently (the campaign modal includes
 * owner usernames; the session modal doesn't).
 */
export function useWinnerSelection({
  initialWinnerIds = [],
  initialClaimerId = null,
  initialIsDraw = false,
  maxParticipants,
  selectedTerritory,
}: UseWinnerSelectionParams): UseWinnerSelectionResult {
  const [winners, setWinners] = useState<string[]>(
    initialWinnerIds.length > 0 ? initialWinnerIds : ['']
  );
  const [isDraw, setIsDraw] = useState<boolean>(initialIsDraw);
  const [claimedByGangId, setClaimedByGangId] = useState<string>(
    initialClaimerId ?? ''
  );

  const activeWinners = useMemo(() => winners.filter((w) => !!w), [winners]);
  const hasAnyWinnerSelected = activeWinners.length > 0 || isDraw;
  const slotsToRender = isDraw ? 1 : Math.max(1, winners.length);
  const canAddAnotherWinner =
    !isDraw &&
    activeWinners.length === winners.length &&
    activeWinners.length > 0 &&
    activeWinners.length < maxParticipants;

  const [prevActiveWinners, setPrevActiveWinners] = useState(activeWinners);
  const [prevSelectedTerritory, setPrevSelectedTerritory] = useState(selectedTerritory);

  if (activeWinners !== prevActiveWinners || selectedTerritory !== prevSelectedTerritory) {
    setPrevActiveWinners(activeWinners);
    setPrevSelectedTerritory(selectedTerritory);
    if (activeWinners.length === 1 && selectedTerritory) {
      setClaimedByGangId(activeWinners[0]);
    } else if (activeWinners.length === 0 || !selectedTerritory) {
      setClaimedByGangId('');
    } else if (claimedByGangId && !activeWinners.includes(claimedByGangId)) {
      setClaimedByGangId('');
    }
  }

  const handleWinnerChange = useCallback((slotIndex: number, value: string) => {
    if (value === 'draw') {
      setIsDraw(true);
      setWinners(['']);
      return;
    }
    setIsDraw(false);
    setWinners((current) => {
      const next = [...current];
      while (next.length <= slotIndex) next.push('');
      next[slotIndex] = value;
      return next;
    });
  }, []);

  const addWinnerSlot = useCallback(
    () => setWinners((current) => [...current, '']),
    []
  );

  const removeWinnerSlot = useCallback(
    (slotIndex: number) =>
      setWinners((current) =>
        current.length <= 1 ? current : current.filter((_, i) => i !== slotIndex)
      ),
    []
  );

  const loadExistingWinners = useCallback(
    ({
      winnerIds,
      claimerId,
      isDraw: draw,
    }: {
      winnerIds: string[];
      claimerId: string | null;
      isDraw: boolean;
    }) => {
      if (draw) {
        setIsDraw(true);
        setWinners(['']);
      } else if (winnerIds.length > 0) {
        setIsDraw(false);
        setWinners(winnerIds);
      } else {
        setIsDraw(false);
        setWinners(['']);
      }
      setClaimedByGangId(claimerId ?? '');
    },
    []
  );

  const removeGangFromWinners = useCallback(
    (gangId: string) =>
      setWinners((current) => current.filter((w) => w !== gangId)),
    []
  );

  const resetWinnerSelection = useCallback(() => {
    setWinners(['']);
    setIsDraw(false);
    setClaimedByGangId('');
  }, []);

  return {
    winners,
    isDraw,
    claimedByGangId,
    setClaimedByGangId,
    activeWinners,
    hasAnyWinnerSelected,
    slotsToRender,
    canAddAnotherWinner,
    handleWinnerChange,
    addWinnerSlot,
    removeWinnerSlot,
    loadExistingWinners,
    removeGangFromWinners,
    resetWinnerSelection,
  };
}
