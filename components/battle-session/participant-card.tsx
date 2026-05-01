'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import DiceRoller from '@/components/dice-roller';
import { FighterXpModal } from '@/components/fighter/fighter-xp-modal';
import { rollD66, resolveInjuryFromUtil, resolveInjuryRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { CgMoreVerticalO } from 'react-icons/cg';
import { BsFire, BsFillExclamationCircleFill } from 'react-icons/bs';
import { GiPieceSkull, GiSpiderWeb, GiHeavyBullets, GiHealthDecrease, GiWaterDrop, GiSpill } from 'react-icons/gi';
import { IoFlashOutline } from 'react-icons/io5';
import { IoMdEye, IoMdEyeOff } from 'react-icons/io';
import { PiBeerBottleFill } from 'react-icons/pi';
import { WiStars } from 'react-icons/wi';
import { FaUserCheck, FaBan } from 'react-icons/fa';
import {
  removeParticipant,
  updateGangOutcome,
  bulkAddFightersToSession,
  removeFighterFromSession,
  updateSessionXp,
  addSessionInjury,
  removeSessionInjury,
  updateSessionConditions,
} from '@/app/actions/battle-sessions';
import { addFighterInjury } from '@/app/actions/fighter-injury';
import { deleteFighterInjury } from '@/app/actions/fighter-injury';
import type { BattleSessionFull, BattleSessionParticipant, BattleSessionFighter, SessionCondition, SessionInjuryRecord } from '@/types/battle-session';

interface ConditionDefinition {
  key: string;
  name: string;
  colorClass: string;
  icon: ReactNode;
}

const SESSION_CONDITIONS: ConditionDefinition[] = [
  { key: 'blaze', name: 'Blaze', colorClass: 'text-orange-600', icon: <BsFire /> },
  { key: 'insane', name: 'Insane', colorClass: 'text-purple-700', icon: <GiPieceSkull /> },
  { key: 'webbed', name: 'Webbed', colorClass: 'text-neutral-200', icon: <GiSpiderWeb /> },
  { key: 'blind', name: 'Blind', colorClass: 'text-neutral-200', icon: <IoFlashOutline /> },
  { key: 'broken', name: 'Broken', colorClass: 'text-red-700', icon: <BsFillExclamationCircleFill /> },
  { key: 'intoxicated', name: 'Intoxicated', colorClass: 'text-emerald-500', icon: <PiBeerBottleFill /> },
  { key: 'hidden', name: 'Hidden', colorClass: 'text-red-700', icon: <IoMdEyeOff /> },
  { key: 'revealed', name: 'Revealed', colorClass: 'text-neutral-200', icon: <IoMdEye /> },
  { key: 'concussion', name: 'Concussion', colorClass: 'text-red-400', icon: <WiStars /> },
  {
    key: 'out_of_ammo',
    name: 'Out of Ammo',
    colorClass: 'text-neutral-700',
    icon: (
      <span className="relative inline-flex size-4 items-center justify-center">
        <GiHeavyBullets className="size-4" />
        <FaBan className="absolute -right-1 -top-1 size-2.5" />
      </span>
    ),
  },
  { key: 'flesh_wound', name: 'Flesh wound', colorClass: 'text-neutral-200', icon: <GiHealthDecrease /> },
  { key: 'wounds', name: 'Wounds', colorClass: 'text-red-800', icon: <GiWaterDrop /> },
  { key: 'gunked', name: 'Gunked', colorClass: 'text-slate-900', icon: <GiSpill /> },
];

const CONDITION_BY_KEY = new Map(SESSION_CONDITIONS.map((condition) => [condition.key, condition]));

function ConditionBadge({ condition }: { condition: SessionCondition }) {
  const config = CONDITION_BY_KEY.get(condition.key);
  if (!config) {
    return (
      <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {condition.name}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      <span className={config.colorClass}>{config.icon}</span>
      {condition.name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FighterActionModal — XP, Injuries, Remove in one modal
// ---------------------------------------------------------------------------

function FighterActionModal({
  fighter,
  onXpChanged,
  onConditionsChanged,
  onInjuryAdded,
  onInjuryRemoved,
  onRemove,
  onClose,
}: {
  fighter: BattleSessionFighter;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[]) => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onInjuryRemoved: (index: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [showXpModal, setShowXpModal] = useState(false);
  const [showInjuryModal, setShowInjuryModal] = useState(false);
  const [fighterData, setFighterData] = useState<{ xp: number; kills: number; kill_count: number } | null>(null);
  const [loadingXp, setLoadingXp] = useState(false);

  const openXpModal = async () => {
    setLoadingXp(true);
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data } = await supabase
        .from('fighters')
        .select('xp, kills, kill_count')
        .eq('id', fighter.fighter_id)
        .single();
      if (data) { setFighterData(data); setShowXpModal(true); }
    } catch {
      toast.error('Failed to load fighter data');
    } finally {
      setLoadingXp(false);
    }
  };

  const removeInjuryMut = useMutation({
    mutationFn: async ({ index, injury }: { index: number; injury: SessionInjuryRecord }) => {
      const deleteResult = await deleteFighterInjury({
        fighter_id: fighter.fighter_id,
        injury_id: injury.fighter_effect_id,
      });
      if (!deleteResult.success) throw new Error(deleteResult.error || 'Failed to delete injury');

      const removeResult = await removeSessionInjury({ session_fighter_id: fighter.id, injury_index: index });
      if (!removeResult.success) throw new Error(removeResult.error || 'Failed to remove session injury');
    },
    onMutate: ({ index }) => {
      onInjuryRemoved(index);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove injury'),
  });

  const injuries = fighter.session_record?.injuries ?? [];
  const xpEarned = fighter.session_record?.xp_earned ?? 0;
  const conditions = fighter.session_record?.conditions ?? [];

  const EXCLUSIVE_PAIRS: Record<string, string> = {
    hidden: 'revealed',
    revealed: 'hidden',
  };

  const toggleCondition = (condition: ConditionDefinition) => {
    const exists = conditions.some((item) => item.key === condition.key);
    let nextConditions: SessionCondition[];
    if (exists) {
      nextConditions = conditions.filter((item) => item.key !== condition.key);
    } else {
      const excludeKey = EXCLUSIVE_PAIRS[condition.key];
      nextConditions = [
        ...conditions.filter((item) => item.key !== excludeKey),
        { key: condition.key, name: condition.name },
      ];
    }
    onConditionsChanged(nextConditions);
    onClose();
  };

  return (
    <>
      <Modal
        title="Fighter Actions"
        onClose={onClose}
        hideCancel
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={openXpModal}
              disabled={loadingXp}
              variant="outline"
              className="flex-1"
            >
              {loadingXp ? 'Loading...' : 'Add XP'}
            </Button>
            <Button
              onClick={() => setShowInjuryModal(true)}
              variant="outline"
              className="flex-1"
            >
              Add Injury
            </Button>
          </div>
          <div className="space-y-2 border-t pt-3 text-left">
            <h4 className="text-sm font-medium text-neutral-500">Conditions</h4>
            <div className="flex flex-wrap gap-2">
              {SESSION_CONDITIONS.map((condition) => {
                const isActive = conditions.some((c) => c.key === condition.key);
                return (
                  <Button
                    key={condition.key}
                    onClick={() => toggleCondition(condition)}
                    variant={isActive ? "default" : "outline"}
                    className="flex-1 min-w-[140px] justify-center text-xs"
                  >
                    <span className={`${condition.colorClass} mr-1.5 text-base`}>{condition.icon}</span>
                    {condition.name}
                  </Button>
                );
              })}
            </div>
          </div>

          {(xpEarned > 0 || injuries.length > 0 || conditions.length > 0) && (
            <div className="space-y-2 border-t pt-3 text-left">
              <h4 className="text-sm font-medium text-neutral-500">Session Record</h4>
              <div className="flex flex-wrap items-center gap-1 justify-start">
                {xpEarned > 0 && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    +{xpEarned} XP
                  </span>
                )}
                {injuries.map((injury, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  >
                    {injury.effect_name}
                    <button onClick={() => removeInjuryMut.mutate({ index: idx, injury })} className="ml-0.5 hover:text-red-900">
                      ✕
                    </button>
                  </span>
                ))}
                {conditions.map((condition) => (
                  <ConditionBadge key={condition.key} condition={condition} />
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <Button
              variant="destructive"
              onClick={() => { onRemove(); onClose(); }}
              className="w-full"
            >
              Remove Fighter
            </Button>
          </div>
        </div>
      </Modal>

      {showXpModal && fighterData && (
        <FighterXpModal
          isOpen
          fighterId={fighter.fighter_id}
          currentXp={fighterData.xp}
          currentTotalXp={fighterData.xp}
          currentKills={fighterData.kills}
          currentKillCount={fighterData.kill_count}
          onClose={() => setShowXpModal(false)}
          onXpUpdated={(newXp) => {
            const delta = newXp - (fighterData?.xp ?? 0);
            onXpChanged(delta);
            setShowXpModal(false);
            onClose();
          }}
        />
      )}

      {showInjuryModal && (
        <InjuryPickerModal
          fighter={fighter}
          onClose={() => setShowInjuryModal(false)}
          onInjuryAdded={(injury) => {
            onInjuryAdded(injury);
            onClose();
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
              onRoll={(roll) => {
                const util = resolveInjuryFromUtil(roll);
                if (!util) return;
                const match = injuryTypes.find((i) => i.effect_name === util.name);
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

// ---------------------------------------------------------------------------
// FighterRow — table row with optional action modal
// ---------------------------------------------------------------------------

function FighterRow({
  fighter,
  name,
  cost,
  xp,
  injuryCount,
  canEdit,
  onXpChanged,
  onConditionsChanged,
  onInjuryAdded,
  onInjuryRemoved,
  onRemove,
}: {
  fighter: BattleSessionFighter;
  name: string;
  cost: number | undefined;
  xp: number;
  injuryCount: number;
  canEdit: boolean;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[]) => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onInjuryRemoved: (index: number) => void;
  onRemove: () => void;
}) {
  const [showActionModal, setShowActionModal] = useState(false);
  const injuries = fighter.session_record?.injuries ?? [];
  const conditions = fighter.session_record?.conditions ?? [];
  const isReady = conditions.some((c) => c.key === 'ready');
  const displayConditions = conditions.filter((c) => c.key !== 'ready');

  const toggleReady = () => {
    const nextConditions = isReady
      ? conditions.filter((c) => c.key !== 'ready')
      : [...conditions, { key: 'ready', name: 'Ready' }];
    onConditionsChanged(nextConditions);
  };

  return (
    <tr className={`border-b last:border-b-0 ${!isReady && canEdit ? 'opacity-40' : ''}`}>
      <td className="p-1 md:p-2 w-full">
        <div>{cost !== undefined ? `${name} - ${cost}` : name}</div>
        {(xp > 0 || injuryCount > 0 || displayConditions.length > 0 || (!canEdit && injuries.length > 0)) && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {xp > 0 && (
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                +{xp} XP
              </span>
            )}
            {canEdit ? (
              <>
                {injuryCount > 0 && (
                  <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {injuryCount} {injuryCount === 1 ? 'injury' : 'injuries'}
                  </span>
                )}
                {displayConditions.map((condition) => (
                  <ConditionBadge key={condition.key} condition={condition} />
                ))}
              </>
            ) : (
              <>
                {injuries.map((injury, idx) => (
                  <span
                    key={idx}
                    className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  >
                    {injury.effect_name}
                  </span>
                ))}
                {displayConditions.map((condition) => (
                  <ConditionBadge key={condition.key} condition={condition} />
                ))}
              </>
            )}
          </div>
        )}
      </td>
      {canEdit && (
        <td className="p-1 md:p-2 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-4">
            <FaUserCheck
              className={`size-5 cursor-pointer transition-colors duration-200 ${isReady ? 'text-green-500' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
              title={isReady ? 'Ready — click to mark as activated' : 'Activated — click to mark as ready'}
              onClick={toggleReady}
            />
            <CgMoreVerticalO
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-200 text-xl size-6 cursor-pointer"
              title="Click to open action menu"
              onClick={() => setShowActionModal(true)}
            />
          </div>
          {showActionModal && (
            <FighterActionModal
              fighter={fighter}
              onXpChanged={onXpChanged}
              onConditionsChanged={onConditionsChanged}
              onInjuryAdded={onInjuryAdded}
              onInjuryRemoved={onInjuryRemoved}
              onRemove={onRemove}
              onClose={() => setShowActionModal(false)}
            />
          )}
        </td>
      )}
    </tr>
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

  const buildOptimisticFighter = (fighterId: string): BattleSessionFighter => {
    const gf = gangFighters.find((f) => f.id === fighterId);
    return {
      id: `temp-${Date.now()}-${fighterId}`,
      battle_session_id: session.id,
      participant_id: participant.id,
      fighter_id: fighterId,
      session_record: { xp_earned: 0, injuries: [], conditions: [{ key: 'ready', name: 'Ready' }] },
      created_at: new Date().toISOString(),
      fighter: gf ? { id: gf.id, fighter_name: gf.fighter_name, credits: gf.credits, total_cost: gf.credits } : undefined,
    };
  };

  const addFighterMutation = useMutation({
    mutationFn: async (fighterId: string) => {
      const result = await bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_ids: [fighterId],
      });
      if (!result.success) throw new Error(result.error || 'Failed to add fighter');
      return result;
    },
    onMutate: (fighterId) => {
      const prev = localFighters;
      setLocalFighters((cur) => [...cur, buildOptimisticFighter(fighterId)]);
      return { prev };
    },
    onSuccess: (_result, fighterId) => {
      const name = gangFighters.find((gf) => gf.id === fighterId)?.fighter_name;
      toast.success(`${name ?? 'Fighter'} added`);
    },
    onError: (_err, _id, context) => {
      toast.error('Failed to add fighter');
      if (context?.prev) setLocalFighters(context.prev);
    },
  });

  const addAllFightersMutation = useMutation({
    mutationFn: async () => {
      const fighterIds = Array.from(new Set(availableFighters.map((f) => f.id)));
      const result = await bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_ids: fighterIds,
      });
      if (!result.success) throw new Error(result.error || 'Failed to add fighters');
      return { ...result, count: fighterIds.length };
    },
    onMutate: () => {
      const prev = localFighters;
      const fighterIds = Array.from(new Set(availableFighters.map((f) => f.id)));
      const newFighters = fighterIds.map(buildOptimisticFighter);
      setLocalFighters((cur) => [...cur, ...newFighters]);
      return { prev, count: fighterIds.length };
    },
    onSuccess: (_result, _vars, context) => {
      const count = context?.count ?? 0;
      toast.success(`${count} fighter${count !== 1 ? 's' : ''} added`);
    },
    onError: (_err, _vars, context) => {
      toast.error('Failed to add fighters');
      if (context?.prev) setLocalFighters(context.prev);
    },
  });

  const removeFighterMutation = useMutation({
    mutationFn: async (fighterId: string) => {
      const result = await removeFighterFromSession(session.id, fighterId);
      if (!result.success) throw new Error(result.error || 'Failed to remove fighter');
      return result;
    },
    onMutate: (fighterId) => {
      const prev = localFighters;
      setLocalFighters((cur) => cur.filter((f) => f.fighter_id !== fighterId));
      return { prev };
    },
    onError: (_err, _id, context) => {
      toast.error('Failed to remove fighter');
      if (context?.prev) setLocalFighters(context.prev);
    },
  });

  const updateXpMutation = useMutation({
    mutationFn: async ({ sessionFighterId, totalXp }: { sessionFighterId: string; totalXp: number }) => {
      const result = await updateSessionXp({ session_fighter_id: sessionFighterId, xp_earned: totalXp });
      if (!result.success) throw new Error(result.error || 'Failed to record XP');
      return result;
    },
    onMutate: ({ sessionFighterId, totalXp }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, xp_earned: totalXp } }
            : lf
        )
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to record XP');
    },
  });

  const updateConditionsMutation = useMutation({
    mutationFn: async ({ sessionFighterId, conditions }: { sessionFighterId: string; conditions: SessionCondition[] }) => {
      const result = await updateSessionConditions({ session_fighter_id: sessionFighterId, conditions });
      if (!result.success) throw new Error(result.error || 'Failed to update conditions');
      return result;
    },
    onMutate: ({ sessionFighterId, conditions }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, conditions } }
            : lf
        )
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update conditions');
    },
  });

  useEffect(() => {
    setLocalFighters(participant.fighters);
  }, [participant.fighters]);


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
                  {canEdit && <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">Action</th>}
                </tr>
              </thead>
              <tbody>
                {localFighters.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 2 : 1} className="text-muted-foreground italic text-center py-4">
                      {canEdit ? 'No fighters added yet.' : 'No fighters.'}
                    </td>
                  </tr>
                ) : (
                  localFighters.map((f) => {
                    const name = f.fighter?.fighter_name || 'Unknown Fighter';
                    const cost = f.fighter?.total_cost ?? f.fighter?.credits;
                    const xp = f.session_record?.xp_earned ?? 0;
                    const injuryCount = f.session_record?.injuries?.length ?? 0;
                    return (
                      <FighterRow
                        key={f.id}
                        fighter={f}
                        name={name}
                        cost={cost}
                        xp={xp}
                        injuryCount={injuryCount}
                        canEdit={canEdit}
                        onXpChanged={(delta) => {
                          const totalXp = (f.session_record?.xp_earned ?? 0) + delta;
                          updateXpMutation.mutate({ sessionFighterId: f.id, totalXp });
                        }}
                        onConditionsChanged={(conditions) => {
                          updateConditionsMutation.mutate({
                            sessionFighterId: f.id,
                            conditions,
                          });
                        }}
                        onInjuryAdded={(injury) => {
                          setLocalFighters((cur) =>
                            cur.map((lf) =>
                              lf.id === f.id
                                ? { ...lf, session_record: { ...lf.session_record, injuries: [...(lf.session_record?.injuries ?? []), injury] } }
                                : lf
                            )
                          );
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
                        onRemove={() => removeFighterMutation.mutate(f.fighter_id)}
                      />
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
