'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import {
  setSessionWinner,
  completeBattleSession,
} from '@/app/actions/battle-sessions';
import type { BattleSessionFull } from '@/types/battle-session';
import type { GangFighter } from '@/app/lib/shared/gang-data';

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
  const router = useRouter();
  const [winner, setWinner] = useState(session.winner_gang_id ?? '');
  const [selectedTerritory, setSelectedTerritory] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gangNameMap = new Map(
    session.participants.map((p) => [p.gang_id, p.gang?.name || 'Unknown'])
  );

  const handleConfirm = async () => {
    if (!winner) {
      toast.error('Please select a winner or draw');
      return false;
    }

    setSubmitting(true);

    const winnerResult = await setSessionWinner(
      session.id,
      winner === 'draw' ? null : winner
    );
    if (!winnerResult.success) {
      toast.error(winnerResult.error || 'Failed to set winner');
      setSubmitting(false);
      return false;
    }

    const completeResult = await completeBattleSession(session.id, {
      campaign_territory_id: selectedTerritory || undefined,
      note: notes || undefined,
    });
    if (!completeResult.success) {
      toast.error(completeResult.error || 'Failed to complete session');
      setSubmitting(false);
      return false;
    }

    toast.success('Battle completed');
    router.refresh();
    return true;
  };

  const sortedTerritories = territories
    .filter((t) => !t.default_gang_territory)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return createPortal(
    <Modal
      title="Complete Battle"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Complete Battle"
      confirmDisabled={!winner || submitting}
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
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted-foreground">
            Winner *
          </label>
          <Combobox
            value={winner}
            onValueChange={setWinner}
            placeholder="Select winner"
            options={[
              { value: 'draw', label: 'Draw' },
              ...session.participants.map((p) => ({
                value: p.gang_id,
                label: p.gang?.name || 'Unknown Gang',
              })),
            ]}
          />
        </div>

        {winner && sortedTerritories.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              {winner === 'draw' ? 'Contested Territory' : 'Claimed Territory'}
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
          </div>
        )}

        {session.campaign_id && (
          <>
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
