'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MdOutlinePersonalInjury } from 'react-icons/md';
import { LuTrash2 } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import DiceRoller from '@/components/dice-roller';
import { FighterXpModal } from '@/components/fighter/fighter-xp-modal';
import { rollD66, resolveInjuryFromUtil, resolveInjuryRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import {
  removeParticipant,
  updateGangOutcome,
  bulkAddFightersToSession,
  removeFighterFromSession,
  updateSessionXp,
  addSessionInjury,
  removeSessionInjury,
} from '@/app/actions/battle-sessions';
import { addFighterInjury } from '@/app/actions/fighter-injury';
import { deleteFighterInjury } from '@/app/actions/fighter-injury';
import type { BattleSessionFull, BattleSessionParticipant, BattleSessionFighter, SessionInjuryRecord } from '@/types/battle-session';

// ---------------------------------------------------------------------------
// Sub-components for List cell rendering
// ---------------------------------------------------------------------------

function XpCell({ fighter, onXpChanged }: { fighter: BattleSessionFighter; onXpChanged: (delta: number) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [fighterData, setFighterData] = useState<{ xp: number; kills: number; kill_count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const openModal = async () => {
    setLoading(true);
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data } = await supabase
        .from('fighters')
        .select('xp, kills, kill_count')
        .eq('id', fighter.fighter_id)
        .single();
      if (data) { setFighterData(data); setShowModal(true); }
    } catch {
      toast.error('Failed to load fighter data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        disabled={loading}
        title="Add XP"
        className="rounded-lg bg-neutral-900 px-1.5 h-6 text-xs text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        +XP
      </button>
      {showModal && fighterData && (
        <FighterXpModal
          isOpen
          fighterId={fighter.fighter_id}
          currentXp={fighterData.xp}
          currentTotalXp={fighterData.xp}
          currentKills={fighterData.kills}
          currentKillCount={fighterData.kill_count}
          helperFighterName={fighter.fighter?.fighter_name}
          onClose={() => setShowModal(false)}
          onXpUpdated={(newXp) => {
            const delta = newXp - (fighterData?.xp ?? 0);
            onXpChanged(delta);
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// InjuryPickerModal
// ---------------------------------------------------------------------------

interface InjuryType {
  id: string;
  effect_name: string;
  type_specific_data: any;
}

function InjuryPickerModal({
  fighter,
  onClose,
  onInjuryAdded,
}: {
  fighter: BattleSessionFighter;
  onClose: () => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
}) {
  const [injuryTypes, setInjuryTypes] = useState<InjuryType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [selectedInjury, setSelectedInjury] = useState<InjuryType | null>(null);
  const [mode, setMode] = useState<'main' | 'recovery' | 'captured'>('main');

  const addMut = useMutation({
    mutationFn: async (params: { fighter_effect_type_id: string; effect_name: string; send_to_recovery: boolean; set_captured: boolean }) => {
      const injuryResult = await addFighterInjury({
        fighter_id: fighter.fighter_id,
        injury_type_id: params.fighter_effect_type_id,
        send_to_recovery: params.send_to_recovery,
        set_captured: params.set_captured,
      });
      if (!injuryResult.success) throw new Error(injuryResult.error || 'Failed to add injury');

      const sessionInjury: SessionInjuryRecord = {
        fighter_effect_id: injuryResult.injury!.id,
        fighter_effect_type_id: params.fighter_effect_type_id,
        effect_name: params.effect_name,
        send_to_recovery: params.send_to_recovery,
        set_captured: params.set_captured,
      };

      await addSessionInjury({ session_fighter_id: fighter.id, injury: sessionInjury });
      return sessionInjury;
    },
    onSuccess: (injury) => {
      toast.success('Injury added');
      onInjuryAdded(injury);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add injury'),
  });

  useEffect(() => {
    setLoading(true);
    fetch('/api/fighters/injuries?is_spyrer=false')
      .then((r) => r.json())
      .then(setInjuryTypes)
      .catch(() => toast.error('Failed to load injuries'))
      .finally(() => setLoading(false));
  }, []);

  const formatRange = (name: string): string => {
    const range = resolveInjuryRangeFromUtilByName(name);
    if (!range) return '';
    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  const commit = (send_to_recovery: boolean, set_captured: boolean) => {
    if (!selectedInjury) return;
    addMut.mutate({
      fighter_effect_type_id: selectedInjury.id,
      effect_name: selectedInjury.effect_name,
      send_to_recovery,
      set_captured,
    });
  };

  const handleAdd = (): false | void => {
    if (!selectedInjury) { toast.error('Select an injury'); return false; }
    const tsd = selectedInjury.type_specific_data || {};
    if (tsd.recovery === 'true') { setMode('recovery'); return false; }
    if (tsd.captured === 'true') { setMode('captured'); return false; }
    commit(false, false);
  };

  const options = Object.entries(
    injuryTypes
      .slice()
      .sort((a, b) => {
        const rangeA = formatRange(a.effect_name);
        const rangeB = formatRange(b.effect_name);
        if (!rangeA && !rangeB) return 0;
        if (!rangeA) return 1;
        if (!rangeB) return -1;
        const minA = parseInt(rangeA.split('-')[0]);
        const minB = parseInt(rangeB.split('-')[0]);
        return minA - minB;
      })
      .reduce((groups, injury) => {
        const rank = lastingInjuryRank[injury.effect_name] ?? Infinity;
        let groupLabel = 'Other Injuries';
        if (rank <= 29) groupLabel = 'Lasting Injuries';
        else if (rank >= 30) groupLabel = 'Mutations / Festering Injuries';
        if (!groups[groupLabel]) groups[groupLabel] = [];
        groups[groupLabel].push(injury);
        return groups;
      }, {} as Record<string, InjuryType[]>)
  ).flatMap(([groupLabel, injuries]) => [
    {
      value: `__header_${groupLabel}`,
      label: <span className="font-bold text-sm">{groupLabel}</span>,
      displayValue: groupLabel,
      disabled: true,
    },
    ...injuries.map((injury) => {
      const range = formatRange(injury.effect_name);
      const displayText = range ? `${range} ${injury.effect_name}` : injury.effect_name;
      return {
        value: injury.id,
        label: range ? (
          <>
            <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>
            {injury.effect_name}
          </>
        ) : injury.effect_name,
        displayValue: displayText,
      };
    }),
  ]);

  return (
    <>
      {mode === 'main' && (
        <Modal
          title="Add Lasting Injury"
          helper={fighter.fighter?.fighter_name}
          onClose={onClose}
          onConfirm={handleAdd}
          confirmText="Add Lasting Injury"
          confirmDisabled={!selectedId || addMut.isPending}
          width="md"
        >
          <div className="space-y-4">
            <DiceRoller
              items={injuryTypes}
              getRange={(i) => {
                const d = (i as InjuryType).type_specific_data || {};
                return typeof d.d66_min === 'number' ? { min: d.d66_min, max: d.d66_max } : null;
              }}
              getName={(i) => (i as InjuryType).effect_name}
              inline
              rollFn={rollD66}
              resolveNameForRoll={(r) => resolveInjuryFromUtil(r)?.name}
              onRolled={(rolled) => {
                if (!rolled.length) return;
                const name = resolveInjuryFromUtil(rolled[0].roll)?.name;
                const match = injuryTypes.find((i) => i.effect_name === name) ?? (rolled[0].item as InjuryType);
                if (match) { setSelectedId(match.id); setSelectedInjury(match); }
              }}
              buttonText="Roll D66"
            />
            <div className="space-y-2 border-t pt-3">
              <label className="text-sm font-medium">Lasting Injuries</label>
              <Combobox
                value={selectedId}
                onValueChange={(v) => {
                  setSelectedId(v);
                  setSelectedInjury(injuryTypes.find((i) => i.id === v) ?? null);
                }}
                placeholder={loading ? 'Loading...' : 'Select a Lasting Injury'}
                disabled={loading}
                options={options}
              />
            </div>
          </div>
        </Modal>
      )}

      {mode === 'recovery' && (
        <Modal
          title="Send to Recovery?"
          onClose={() => setMode('main')}
          onConfirm={async () => { commit(true, false); return false; }}
          confirmText="Yes"
        >
          <p>Send this fighter into Recovery?</p>
        </Modal>
      )}

      {mode === 'captured' && (
        <Modal
          title="Mark as Captured?"
          onClose={() => setMode('main')}
          onConfirm={async () => { commit(false, true); return false; }}
          confirmText="Yes"
        >
          <p>This injury results in the fighter being captured. Mark as Captured?</p>
        </Modal>
      )}
    </>
  );
}

function InjuriesCell({
  fighter,
  editable,
  onInjuryAdded,
  onInjuryRemoved,
}: {
  fighter: BattleSessionFighter;
  editable: boolean;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onInjuryRemoved: (index: number) => void;
}) {
  const [showModal, setShowModal] = useState(false);

  const removeMut = useMutation({
    mutationFn: async (index: number) => {
      const injury = fighter.session_record.injuries[index];
      await deleteFighterInjury({
        fighter_id: fighter.fighter_id,
        injury_id: injury.fighter_effect_id,
      });
      await removeSessionInjury({ session_fighter_id: fighter.id, injury_index: index });
    },
    onMutate: (index) => {
      onInjuryRemoved(index);
    },
    onError: () => toast.error('Failed to remove injury'),
  });

  const injuries = fighter.session_record?.injuries ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {injuries.map((injury, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {injury.effect_name}
            {editable && (
              <button onClick={() => removeMut.mutate(idx)} className="ml-0.5 hover:text-red-900">
                ✕
              </button>
            )}
          </span>
        ))}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModal(true)}
            title="Add Injury"
            className="text-xs px-1.5 h-6"
          >
            <MdOutlinePersonalInjury className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showModal && (
        <InjuryPickerModal
          fighter={fighter}
          onClose={() => setShowModal(false)}
          onInjuryAdded={onInjuryAdded}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParticipantCard
// ---------------------------------------------------------------------------

interface ParticipantCardProps {
  participant: BattleSessionParticipant & { fighters: BattleSessionFighter[] };
  session: BattleSessionFull;
  userId: string;
  isOwner: boolean;
  editable?: boolean;
}

export default function ParticipantCard({
  participant,
  session,
  userId,
  isOwner,
  editable = false,
}: ParticipantCardProps) {
  const router = useRouter();
  const [creditsEarned, setCreditsEarned] = useState(participant.credits_earned);
  const [repChange, setRepChange] = useState(participant.reputation_change);
  const [localFighters, setLocalFighters] = useState<BattleSessionFighter[]>(participant.fighters);
  const [fightersRequested, setFightersRequested] = useState(false);

  const isMyGang = participant.user_id === userId;
  const canEdit = editable && isMyGang;

  const { data: gangFighters = [], isLoading: loadingFighters } = useQuery({
    queryKey: ['gang-fighters', participant.gang_id],
    queryFn: async () => {
      const res = await fetch(`/api/fighters?gang_id=${participant.gang_id}&loadouts=true`);
      if (!res.ok) throw new Error('Failed to fetch fighters');
      const data = await res.json();
      return (data || []).flatMap((f: any) => {
        const loadouts: { id: string; loadout_name: string; loadout_total: number }[] = f.loadouts || [];
        if (loadouts.length === 0) {
          return [{ id: f.id, fighter_name: f.fighter_name, credits: f.total_cost ?? f.credits }];
        }
        return loadouts.map((l: any) => ({
          id: f.id,
          fighter_name: f.fighter_name,
          credits: l.loadout_total,
          loadout_id: l.id,
          loadout_name: l.loadout_name,
        }));
      }) as { id: string; fighter_name: string; credits: number; loadout_id?: string; loadout_name?: string }[];
    },
    enabled: canEdit && fightersRequested,
    staleTime: 5 * 60 * 1000,
  });

  const selectedFighterIds = new Set(localFighters.map((f) => f.fighter_id));
  const availableFighters = gangFighters.filter((f) => !selectedFighterIds.has(f.id));

  const totalInjuries = localFighters.reduce((sum, f) => sum + (f.session_record?.injuries?.length ?? 0), 0);
  const crewRating = localFighters.reduce(
    (sum, f) => sum + (f.fighter?.total_cost ?? f.fighter?.credits ?? 0),
    0
  );

  const removeMutation = useMutation({
    mutationFn: () => removeParticipant(session.id, participant.id),
    onSuccess: () => router.refresh(),
    onError: () => toast.error('Failed to remove participant'),
  });

  const prevCreditsRef = useRef(participant.credits_earned);
  const prevRepRef = useRef(participant.reputation_change);

  const gangOutcomeMutation = useMutation({
    mutationFn: (params: { field: 'credits' | 'reputation'; newValue: number }) => {
      const prevValue = params.field === 'credits' ? prevCreditsRef.current : prevRepRef.current;
      const delta = params.newValue - prevValue;
      if (delta === 0) return Promise.resolve({ success: true });
      const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
      const absValue = Math.abs(delta);
      return updateGangOutcome({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        ...(params.field === 'credits'
          ? { credits_change: absValue, credits_operation: operation }
          : { reputation_change: absValue, reputation_operation: operation }),
      });
    },
    onMutate: (params) => {
      const prev = params.field === 'credits' ? prevCreditsRef.current : prevRepRef.current;
      if (params.field === 'credits') prevCreditsRef.current = params.newValue;
      else prevRepRef.current = params.newValue;
      return { prev, field: params.field };
    },
    onError: (_err, _params, context) => {
      if (context?.field === 'credits') {
        prevCreditsRef.current = context.prev;
        setCreditsEarned(context.prev);
      } else if (context?.field === 'reputation') {
        prevRepRef.current = context.prev;
        setRepChange(context.prev);
      }
      toast.error('Failed to update gang outcome');
    },
  });

  const addFighterMutation = useMutation({
    mutationFn: (fighterId: string) =>
      bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_ids: [fighterId],
      }),
    onSuccess: (result, fighterId) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to add fighter');
        return;
      }
      const name = gangFighters.find((gf) => gf.id === fighterId)?.fighter_name;
      toast.success(`${name ?? 'Fighter'} added`);
      router.refresh();
    },
    onError: () => {
      toast.error('Failed to add fighter');
    },
  });

  const addAllFightersMutation = useMutation({
    mutationFn: () => {
      const fighterIds = Array.from(new Set(availableFighters.map((f) => f.id)));
      return bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_ids: fighterIds,
      }).then((result) => ({ ...result, count: fighterIds.length }));
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to add fighters');
        return;
      }
      toast.success(`${result.count} fighter${result.count !== 1 ? 's' : ''} added`);
      router.refresh();
    },
    onError: () => {
      toast.error('Failed to add fighters');
    },
  });

  const removeFighterMutation = useMutation({
    mutationFn: (fighterId: string) => removeFighterFromSession(session.id, fighterId),
    onMutate: (fighterId) => {
      const prev = localFighters;
      setLocalFighters((cur) => cur.filter((f) => f.fighter_id !== fighterId));
      return { prev };
    },
    onSuccess: () => router.refresh(),
    onError: (_err, _id, context) => {
      toast.error('Failed to remove fighter');
      setLocalFighters(context!.prev);
    },
  });

  const isMutating =
    addFighterMutation.isPending ||
    addAllFightersMutation.isPending ||
    removeFighterMutation.isPending;

  useEffect(() => {
    if (!isMutating) {
      setLocalFighters(participant.fighters);
    }
  }, [participant.fighters, isMutating]);


  return (
    <div>
      {/* Gang Header */}
      <div className="py-2">
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {participant.gang?.name || 'Unknown Gang'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-neutral-500">
              <span>Player: {participant.profile?.username || 'Unknown'}</span>
              <span>Crew Rating: {crewRating}</span>
              <span>Fighters: {localFighters.length}</span>
              {totalInjuries > 0 && (
                <span className="text-red-500">{totalInjuries} injuries</span>
              )}
            </div>
          </div>
          {(isOwner || isMyGang) && editable && (
            <Button
              variant="destructive"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="px-3.5"
            >
              Remove
            </Button>
          )}
        </div>
        {canEdit && (
          <div className="mt-2 flex gap-2">
            <Combobox
              options={availableFighters.map((f) => ({
                value: f.loadout_id ? `${f.id}:${f.loadout_id}` : f.id,
                label: f.loadout_name
                  ? `${f.fighter_name} (${f.loadout_name}) - ${f.credits}`
                  : `${f.fighter_name} - ${f.credits}`,
              }))}
              value=""
              onValueChange={(key) => {
                if (!key) return;
                const fighterId = key.split(':')[0];
                addFighterMutation.mutate(fighterId);
              }}
              placeholder="Add fighter..."
              className="flex-1 min-w-0"
              disabled={loadingFighters || addFighterMutation.isPending}
              onFocus={() => setFightersRequested(true)}
            />
            <Button
              onClick={() => {
                setFightersRequested(true);
                addAllFightersMutation.mutate();
              }}
              disabled={addAllFightersMutation.isPending || loadingFighters}
              className="whitespace-nowrap"
            >
              Add All
            </Button>
          </div>
        )}
      </div>

      <div className="pb-6">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="p-1 md:p-2 text-left font-medium w-full">Fighter</th>
                  <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">XP</th>
                  <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">Injuries</th>
                  {canEdit && <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">Action</th>}
                </tr>
              </thead>
              <tbody>
                {localFighters.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 4 : 3} className="text-muted-foreground italic text-center py-4">
                      {canEdit ? 'No fighters added yet.' : 'No fighters.'}
                    </td>
                  </tr>
                ) : (
                  localFighters.map((f) => {
                    const name = f.fighter?.fighter_name || 'Unknown Fighter';
                    const cost = f.fighter?.total_cost ?? f.fighter?.credits;
                    return (
                      <tr key={f.id} className="border-b last:border-b-0">
                        <td className="p-1 md:p-2 w-full">{cost !== undefined ? `${name} - ${cost}` : name}</td>
                        <td className="p-1 md:p-2 text-right whitespace-nowrap">
                          {(f.session_record?.xp_earned ?? 0) > 0 && (
                            <span className="mr-1 text-xs text-neutral-500">+{f.session_record.xp_earned}</span>
                          )}
                          {canEdit ? (
                            <XpCell
                              fighter={f}
                              onXpChanged={(delta) => {
                                setLocalFighters((cur) =>
                                  cur.map((lf) =>
                                    lf.id === f.id
                                      ? { ...lf, session_record: { ...lf.session_record, xp_earned: (lf.session_record?.xp_earned ?? 0) + delta } }
                                      : lf
                                  )
                                );
                                updateSessionXp({ session_fighter_id: f.id, xp_earned: (f.session_record?.xp_earned ?? 0) + delta });
                              }}
                            />
                          ) : null}
                        </td>
                        <td className="p-1 md:p-2 text-right whitespace-nowrap">
                          <InjuriesCell
                            fighter={f}
                            editable={canEdit}
                            onInjuryAdded={(injury) => {
                              setLocalFighters((cur) =>
                                cur.map((lf) =>
                                  lf.id === f.id
                                    ? { ...lf, session_record: { ...lf.session_record, injuries: [...(lf.session_record?.injuries ?? []), injury] } }
                                    : lf
                                )
                              );
                              router.refresh();
                            }}
                            onInjuryRemoved={(index) => {
                              setLocalFighters((cur) =>
                                cur.map((lf) =>
                                  lf.id === f.id
                                    ? { ...lf, session_record: { ...lf.session_record, injuries: lf.session_record.injuries.filter((_, i) => i !== index) } }
                                    : lf
                                )
                              );
                            }}
                          />
                        </td>
                        {canEdit && (
                          <td className="p-1 md:p-2 text-right whitespace-nowrap">
                            <Button
                              variant="outline_remove"
                              size="sm"
                              onClick={() => removeFighterMutation.mutate(f.fighter_id)}
                              className="text-xs px-1.5 h-6"
                              title="Remove fighter"
                            >
                              <LuTrash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Gang-level outcomes */}
          {canEdit && (
            <div className="flex gap-4 border-t border-neutral-100 pt-3 dark:border-neutral-700">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-neutral-500">Credits Earned</label>
                <input
                  type="number"
                  value={creditsEarned}
                  onChange={(e) => setCreditsEarned(Number(e.target.value))}
                  onBlur={() => gangOutcomeMutation.mutate({ field: 'credits', newValue: creditsEarned })}
                  className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-neutral-500">Reputation Change</label>
                <input
                  type="number"
                  value={repChange}
                  onChange={(e) => setRepChange(Number(e.target.value))}
                  onBlur={() => gangOutcomeMutation.mutate({ field: 'reputation', newValue: repChange })}
                  className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>
            </div>
          )}

          {/* Read-only gang outcomes */}
          {!canEdit && (participant.credits_earned !== 0 || participant.reputation_change !== 0) && (
            <div className="flex gap-4 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700">
              {participant.credits_earned !== 0 && (
                <span>Credits: {participant.credits_earned > 0 ? '+' : ''}{participant.credits_earned}</span>
              )}
              {participant.reputation_change !== 0 && (
                <span>Reputation: {participant.reputation_change > 0 ? '+' : ''}{participant.reputation_change}</span>
              )}
            </div>
          )}
        </div>
    </div>
  );
}
