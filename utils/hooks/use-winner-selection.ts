'use client';

import { useState, useMemo, useEffect } from 'react';

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
  setWinners: React.Dispatch<React.SetStateAction<string[]>>;
  isDraw: boolean;
  setIsDraw: React.Dispatch<React.SetStateAction<boolean>>;
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

  // Clear the claimer when they are no longer in the winners list.
  useEffect(() => {
    if (claimedByGangId && !activeWinners.includes(claimedByGangId)) {
      setClaimedByGangId('');
    }
  }, [activeWinners, claimedByGangId]);

  // Auto-fill the claimer for the single-winner + territory case so the user
  // doesn't have to take any extra action on the common path.
  useEffect(() => {
    if (activeWinners.length === 1 && selectedTerritory) {
      setClaimedByGangId(activeWinners[0]);
    } else if (activeWinners.length === 0 || !selectedTerritory) {
      setClaimedByGangId('');
    }
  }, [activeWinners, selectedTerritory]);

  const handleWinnerChange = (slotIndex: number, value: string) => {
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
  };

  const addWinnerSlot = () => setWinners((current) => [...current, '']);
  const removeWinnerSlot = (slotIndex: number) =>
    setWinners((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== slotIndex)
    );

  const resetWinnerSelection = () => {
    setWinners(['']);
    setIsDraw(false);
    setClaimedByGangId('');
  };

  return {
    winners,
    setWinners,
    isDraw,
    setIsDraw,
    claimedByGangId,
    setClaimedByGangId,
    activeWinners,
    hasAnyWinnerSelected,
    slotsToRender,
    canAddAnotherWinner,
    handleWinnerChange,
    addWinnerSlot,
    removeWinnerSlot,
    resetWinnerSelection,
  };
}
