'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { LuPlus } from 'react-icons/lu';
import { HiX } from 'react-icons/hi';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import {
  setSessionWinners,
  completeBattleSession,
} from '@/app/actions/battle-sessions';
import type { BattleSessionFull } from '@/types/battle-session';
import type { GangFighter } from '@/app/lib/shared/gang-data';
import {
  getSessionClaimerGangId,
  getSessionWinnerIds,
} from '@/utils/battle-winners';
import { useWinnerSelection } from '@/utils/hooks/use-winner-selection';

interface CompleteBattleTerritory {
  id: string;
  name: string;
  controlled_by?: string;
  default_gang_territory?: boolean;
}

interface CompleteBattleModalProps {
  session: BattleSessionFull;
  gangFightersMap: Record<string, GangFighter[]>;
  territories?: CompleteBattleTerritory[];
  onClose: () => void;
}

export default function CompleteBattleModal({
  session,
  gangFightersMap,
  territories = [],
  onClose,
}: CompleteBattleModalProps) {
  // Multi-winner state. Prefill from the persisted is_winner / claimed_territory
  // flags (with fallback to the legacy winner_gang_id for older sessions).
  const initialWinnerIds = useMemo(() => getSessionWinnerIds(session), [session]);
  const initialClaimerId = useMemo(() => getSessionClaimerGangId(session), [session]);
  const initialIsDraw =
    initialWinnerIds.length === 0 && session.winner_gang_id === null;

  const [selectedTerritory, setSelectedTerritory] = useState('');
  const [cycle, setCycle] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gangNameMap = useMemo(
    () => new Map(session.participants.map((p) => [p.gang_id, p.gang?.name || 'Unknown'])),
    [session.participants]
  );

  const {
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
  } = useWinnerSelection({
    initialWinnerIds,
    initialClaimerId,
    initialIsDraw,
    maxParticipants: session.participants.length,
    selectedTerritory,
  });

  const handleConfirm = async () => {
    if (!hasAnyWinnerSelected) {
      toast.error('Please select a winner or draw');
      return false;
    }

    if (!isDraw) {
      const uniqueWinners = new Set(activeWinners);
      if (uniqueWinners.size !== activeWinners.length) {
        toast.error('The same gang cannot be selected as winner twice');
        return false;
      }
    }

    const territoryClaimed = !isDraw && selectedTerritory;
    if (territoryClaimed && activeWinners.length > 1 && !claimedByGangId) {
      toast.error('Please select which winner claims the Territory');
      return false;
    }

    setSubmitting(true);

    const winnerPayload = isDraw
      ? []
      : activeWinners.map((id) => ({
          gang_id: id,
          claimed_territory:
            !!territoryClaimed &&
            (activeWinners.length === 1
              ? id === activeWinners[0]
              : id === claimedByGangId),
        }));

    const winnerResult = await setSessionWinners(session.id, winnerPayload);
    if (!winnerResult.success) {
      toast.error(winnerResult.error || 'Failed to set winners');
      setSubmitting(false);
      return false;
    }

    let cycleValue: number | null = null;
    if (cycle) {
      const parsed = parseInt(cycle, 10);
      if (!isNaN(parsed) && parsed > 0) cycleValue = parsed;
    }

    const completeResult = await completeBattleSession(session.id, {
      campaign_territory_id: selectedTerritory || undefined,
      note: notes || undefined,
      cycle: cycleValue,
    });
    if (!completeResult.success) {
      toast.error(completeResult.error || 'Failed to complete session');
      setSubmitting(false);
      return false;
    }

    toast.success('Battle completed');
    return true;
  };

  const sortedTerritories = territories
    .filter((t) => !t.default_gang_territory)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const buildGangOption = (gangId: string) => ({
    value: gangId,
    label: gangNameMap.get(gangId) ?? 'Unknown Gang',
  });

  return createPortal(
    <Modal
      title="Complete Battle"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Complete Battle"
      confirmDisabled={!hasAnyWinnerSelected || submitting}
    >
      <div className="space-y-4">
        {session.scenario && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Scenario</p>
            <p className="font-medium">{session.scenario}</p>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Gangs</p>
          <div className="space-y-3">
            {session.participants.map((p) => {
              const gfList = gangFightersMap[p.gang_id] || [];
              const crewRating = (p.fighters ?? []).reduce((sum, f) => {
                const match =
                  gfList.find(
                    (gf) =>
                      gf.id === f.fighter_id &&
                      gf.active_loadout_id === (f.loadout_id ?? undefined)
                  ) ?? gfList.find((gf) => gf.id === f.fighter_id);
                return sum + (match ? (match.loadout_cost ?? match.credits) : (f.fighter?.credits ?? 0));
              }, 0);

              const totalXp = (p.fighters ?? []).reduce(
                (sum, f) => sum + (f.session_record?.xp_earned ?? 0),
                0
              );
              const totalInjuries = (p.fighters ?? []).reduce(
                (sum, f) => sum + (f.session_record?.injuries?.length ?? 0),
                0
              );

              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.gang?.name}</span>
                    {p.role !== 'none' && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.role === 'attacker'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        }`}
                      >
                        {p.role === 'attacker' ? 'Attacker' : 'Defender'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-sm text-neutral-500">
                    <span>{p.profile?.username}</span>
                    <span>Rating: {crewRating}</span>
                    <span>{(p.fighters ?? []).length} fighters</span>
                    {totalXp > 0 && <span>+{totalXp} XP</span>}
                    {totalInjuries > 0 && (
                      <span className="text-red-500">{totalInjuries} injuries</span>
                    )}
                  </div>
                  {(p.reputation_change !== 0 || p.credits_earned !== 0 || (p.resource_changes ?? []).some((r) => r.quantity_delta !== 0)) && (
                    <div className="mt-1 flex gap-3 flex-wrap text-xs text-neutral-500">
                      {p.reputation_change !== 0 && (
                        <span>Rep: {p.reputation_change > 0 ? '+' : ''}{p.reputation_change}</span>
                      )}
                      {p.credits_earned !== 0 && (
                        <span>Credits: {p.credits_earned > 0 ? '+' : ''}{p.credits_earned}</span>
                      )}
                      {(p.resource_changes ?? []).filter((r) => r.quantity_delta !== 0).map((r) => (
                        <span key={r.resource_id}>
                          {r.resource_name}: {r.quantity_delta > 0 ? '+' : ''}{r.quantity_delta}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted-foreground">
            Winner *
          </label>
          <div className="space-y-2">
            {Array.from({ length: slotsToRender }).map((_, slotIndex) => {
              const slotValue =
                isDraw && slotIndex === 0
                  ? 'draw'
                  : (winners[slotIndex] ?? '');
              const isFirstSlot = slotIndex === 0;
              const excludedGangIds = new Set(
                winners.filter((_, i) => i !== slotIndex && !!winners[i])
              );
              const gangOptions = session.participants
                .filter((p) => !excludedGangIds.has(p.gang_id))
                .map((p) => buildGangOption(p.gang_id));

              const baseOptions = isFirstSlot
                ? [
                    { value: '', label: 'No winner selected' },
                    { value: 'draw', label: 'Draw' },
                    ...gangOptions,
                  ]
                : [
                    { value: '', label: 'Select winner' },
                    ...gangOptions,
                  ];

              return (
                <div
                  key={`winner-slot-${slotIndex}`}
                  className="flex items-start gap-2"
                >
                  <div className="flex-1">
                    <Combobox
                      value={slotValue}
                      onValueChange={(value) =>
                        handleWinnerChange(slotIndex, value)
                      }
                      placeholder={
                        isFirstSlot ? 'Select winner' : 'Select another winner'
                      }
                      options={baseOptions}
                    />
                  </div>
                  {slotIndex > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove winner"
                      onClick={() => removeWinnerSlot(slotIndex)}
                    >
                      <HiX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
            {canAddAnotherWinner && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={addWinnerSlot}
              >
                <LuPlus className="h-4 w-4" />
                Add Winner
              </Button>
            )}
          </div>
        </div>

        {hasAnyWinnerSelected && sortedTerritories.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              {isDraw ? 'Contested Territory' : 'Claimed Territory'}
            </label>
            <Combobox
              value={selectedTerritory}
              onValueChange={setSelectedTerritory}
              placeholder="Select or search for a Territory..."
              options={[
                { value: '', label: 'No territory claimed' },
                ...sortedTerritories.map((t) => {
                  const controlledBy = t.controlled_by
                    ? gangNameMap.get(t.controlled_by) || null
                    : null;
                  const statusLabel = controlledBy
                    ? ` (Held by ${controlledBy})`
                    : t.controlled_by
                      ? ' (Claimed by another gang)'
                      : ' (Unclaimed)';
                  return {
                    value: t.id,
                    label: (
                      <span>
                        <span>{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {statusLabel}
                        </span>
                      </span>
                    ),
                    displayValue: `${t.name}${statusLabel}`,
                  };
                }),
              ]}
            />

            {!isDraw && activeWinners.length > 1 && selectedTerritory && (
              <>
                <p className="mt-2 text-sm text-amber-600">
                  Only one winner can claim a Territory.
                </p>
                <div className="mt-2">
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Territory claimed by *
                  </label>
                  <Combobox
                    value={claimedByGangId}
                    onValueChange={setClaimedByGangId}
                    placeholder="Select the claiming winner"
                    options={[
                      { value: '', label: 'Select the claiming winner' },
                      ...activeWinners.map((gangId) => buildGangOption(gangId)),
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {session.campaign_id && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Cycle
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded-md border border-border bg-muted"
                placeholder="Enter cycle number (optional)"
                value={cycle}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setCycle(value);
                  } else {
                    const numValue = parseInt(value, 10);
                    if (!isNaN(numValue) && numValue > 0 && !value.includes('-') && !value.includes('.')) {
                      setCycle(value);
                    }
                  }
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Report
              </label>
              <Textarea
                placeholder="Add any additional details about the battle..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px] bg-muted"
              />
            </div>
            <p className="text-sm text-neutral-500">
              A battle log entry will be created for the campaign.
            </p>
          </>
        )}
      </div>
    </Modal>,
    document.body
  );
}
