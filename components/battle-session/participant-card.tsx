'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sortParticipantFightersByPositioning } from '@/utils/fighter-positioning';

import { useMutation } from '@tanstack/react-query';
import type { GangFighter } from '@/app/lib/shared/gang-data';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { LuPlus, LuMinus, LuClipboard, LuSlash } from 'react-icons/lu';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import CrewSelectionModal from '@/components/battle-session/crew-selection-modal';
import DiceRoller from '@/components/dice-roller';
import { FighterXpModal } from '@/components/fighter/fighter-xp-modal';
import { rollD66, rollNd6Outcome, resolveInjuryFromUtil, resolveInjuryRangeFromUtilByName } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { CgMoreVerticalO } from 'react-icons/cg';
import { BsFire, BsFillExclamationCircleFill } from 'react-icons/bs';
import { GiPieceSkull, GiSpiderWeb, GiHeavyBullets, GiHealthNormal, GiWaterDrop, GiSpill, GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { IoFlashOutline, IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { TbMeatOff } from 'react-icons/tb';
import { IoMdEye, IoMdEyeOff } from 'react-icons/io';
import { PiBeerBottleFill } from 'react-icons/pi';
import { WiStars } from 'react-icons/wi';
import { FaRegAddressCard, FaUserCheck, FaMedkit } from 'react-icons/fa';
import {
  removeParticipant,
  updateParticipantRole,
  updateGangOutcome,
  updateParticipantResources,
  bulkAddFightersToSession,
  removeFighterFromSession,
  updateFighterLoadout,
  updateSessionXp,
  addSessionInjury,
  updateSessionConditions,
  updateActivations,
  updateSessionNote,
  toggleParticipantReady,
} from '@/app/actions/battle-sessions';
import { addFighterInjury } from '@/app/actions/fighter-injury';
import { createGangLog } from '@/app/actions/logs/gang-logs';
import { updateFighterXp } from '@/app/actions/edit-fighter';
import FighterCard from '@/components/gang/fighter-card';
import type { BattleSessionFull, BattleSessionParticipant, BattleSessionFighter, SessionCondition, SessionInjuryRecord } from '@/types/battle-session';

interface ConditionDefinition {
  key: string;
  name: string;
  colorClass: string;
  icon: ReactNode;
}

// Condition tokens that are displayed in the fighter row of the participant card
const SESSION_CONDITIONS: ConditionDefinition[] = [
  { key: 'blaze', name: 'Blaze', colorClass: 'text-orange-500', icon: <BsFire /> },
  { key: 'insane', name: 'Insane', colorClass: 'text-purple-700', icon: <GiPieceSkull /> },
  { key: 'webbed', name: 'Webbed', colorClass: 'text-neutral-400', icon: <GiSpiderWeb /> },
  { key: 'blind', name: 'Blind', colorClass: 'text-neutral-400', icon: <IoFlashOutline /> },
  { key: 'broken', name: 'Broken', colorClass: 'text-red-700', icon: <BsFillExclamationCircleFill /> },
  { key: 'intoxicated', name: 'Intoxicated', colorClass: 'text-emerald-500', icon: <PiBeerBottleFill /> },
  { key: 'hidden', name: 'Hidden', colorClass: 'text-red-700', icon: <IoMdEyeOff /> },
  { key: 'revealed', name: 'Revealed', colorClass: 'text-neutral-400', icon: <IoMdEye /> },
  { key: 'concussion', name: 'Concussion', colorClass: 'text-red-400', icon: <WiStars /> },
  {
    key: 'out_of_ammo',
    name: 'Out of Ammo',
    colorClass: 'text-neutral-700',
    icon: (
      <span className="relative inline-flex items-center justify-center align-[-3px]">
        <GiHeavyBullets />
        <LuSlash className="absolute inset-0 m-auto" />
      </span>
    ),
  },
  { key: 'gunked', name: 'Gunked', colorClass: 'text-slate-900', icon: <GiSpill /> },
];

const NUMERIC_CONDITIONS: ConditionDefinition[] = [
  {
    key: 'flesh_wound',
    name: 'Flesh Wounds',
    colorClass: 'text-neutral-400',
    icon: (
      <span className="relative inline-flex items-center justify-center align-[-3px]">
        <GiHealthNormal />
        <GiWaterDrop className="absolute inset-0 m-auto text-red-800 size-2" />
      </span>
    ),
  },
  { key: 'wounds', name: 'Wounds', colorClass: 'text-red-800', icon: <GiWaterDrop /> },
];

const CONDITION_BY_KEY = new Map([...SESSION_CONDITIONS, ...NUMERIC_CONDITIONS].map((condition) => [condition.key, condition]));

const DUAL_ACTIVATION_RULES = ['Spyre Hunter', 'Aranthian Beauty Plating'];
const hasDualActivation = (rules?: string[]) =>
  rules?.some((r) => DUAL_ACTIVATION_RULES.includes(r)) ?? false;

function ConditionBadge({
  condition,
  iconOnly = false,
}: {
  condition: SessionCondition;
  iconOnly?: boolean;
}) {
  const config = CONDITION_BY_KEY.get(condition.key);
  const conditionLabel = condition.value != null && condition.value > 0
    ? `${condition.value} ${condition.name}`
    : condition.name;
  if (!config) {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-1 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {condition.name}
      </span>
    );
  }

  if (iconOnly) {
    return (
      <span
        className="relative inline-flex size-7 md:size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        title={conditionLabel}
      >
        <span className={`${config.colorClass} text-xl md:text-2xl`}>{config.icon}</span>
        {condition.value != null && condition.value > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold leading-none text-white dark:bg-neutral-200 dark:text-neutral-900">
            {condition.value}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      <span className={`${config.colorClass} text-base`}>{config.icon}</span>
      {conditionLabel}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FighterActionModal — XP, Injuries, Remove in one modal
// ---------------------------------------------------------------------------

function FighterActionModal({
  fighter,
  gangId,
  campaignId,
  onXpChanged,
  onConditionsChanged,
  onInjuryAdded,
  onBroadcast,
  onClose,
}: {
  fighter: BattleSessionFighter;
  gangId: string;
  campaignId?: string | null;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[]) => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onBroadcast?: () => void;
  onClose: () => void;
}) {
  const [showXpModal, setShowXpModal] = useState(false);
  const [showInjuryModal, setShowInjuryModal] = useState(false);
  const [fighterData, setFighterData] = useState<{ xp: number; kills: number; kill_count: number } | null>(null);
  const [loadingXp, setLoadingXp] = useState(false);
  const [draftConditions, setDraftConditions] = useState<SessionCondition[]>(
    fighter.session_record?.conditions ?? []
  );

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

  const currentConditions = fighter.session_record?.conditions ?? [];

  const EXCLUSIVE_PAIRS: Record<string, string> = {
    hidden: 'revealed',
    revealed: 'hidden',
  };

  const toggleCondition = (condition: ConditionDefinition) => {
    const exists = draftConditions.some((item) => item.key === condition.key);
    if (exists) {
      setDraftConditions(draftConditions.filter((item) => item.key !== condition.key));
    } else {
      const excludeKey = EXCLUSIVE_PAIRS[condition.key];
      setDraftConditions([
        ...draftConditions.filter((item) => item.key !== excludeKey),
        { key: condition.key, name: condition.name },
      ]);
    }
  };

  const adjustNumericCondition = (key: string, name: string, delta: number) => {
    const existing = draftConditions.find((c) => c.key === key);
    const currentValue = existing?.value ?? 0;
    const newValue = Math.max(0, currentValue + delta);
    if (newValue === 0) {
      setDraftConditions(draftConditions.filter((c) => c.key !== key));
    } else if (existing) {
      setDraftConditions(draftConditions.map((c) => c.key === key ? { ...c, value: newValue } : c));
    } else {
      setDraftConditions([...draftConditions, { key, name, value: newValue }]);
    }
  };

  const hasConditionChanges = JSON.stringify(draftConditions) !== JSON.stringify(currentConditions);

  return (
    <>
      <Modal
        title="Fighter Actions"
        onClose={onClose}
        onConfirm={async () => {
          onConditionsChanged(draftConditions);
          return true;
        }}
        confirmText="Confirm"
        confirmDisabled={!hasConditionChanges}
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
              Add Lasting Injury
            </Button>
          </div>
          <div className="space-y-2 border-t pt-3 text-left">
            <h4 className="text-sm font-medium text-neutral-500">Wounds & Flesh Wounds</h4>
            <div className="flex flex-col gap-2">
              {NUMERIC_CONDITIONS.map((nc) => {
                const current = draftConditions.find((c) => c.key === nc.key)?.value ?? 0;
                return (
                  <div key={nc.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`${nc.colorClass} text-2xl`}>{nc.icon}</span>
                      <span className="text-sm">{nc.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                        onClick={() => adjustNumericCondition(nc.key, nc.name, -1)}
                        disabled={current === 0}
                      >
                        <LuMinus className="h-4 w-4" />
                      </Button>
                      <span className="w-6 text-center">{current}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                        onClick={() => adjustNumericCondition(nc.key, nc.name, 1)}
                      >
                        <LuPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-2 border-t pt-3 text-left">
            <h4 className="text-sm font-medium text-neutral-500">Conditions</h4>
            <div className="flex flex-wrap gap-2">
              {SESSION_CONDITIONS.map((condition) => {
                const isActive = draftConditions.some((c) => c.key === condition.key);
                return (
                  <Button
                    key={condition.key}
                    onClick={() => toggleCondition(condition)}
                    variant={isActive ? "default" : "outline"}
                    className="flex-1 min-w-[140px] justify-center text-xs md:text-sm"
                  >
                    <span className={`${condition.colorClass} mr-1.5 text-xl`}>{condition.icon}</span>
                    {condition.name}
                  </Button>
                );
              })}
            </div>
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
          gangId={gangId}
          campaignId={campaignId ?? undefined}
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
          onBroadcast={onBroadcast}
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
  onBroadcast,
}: {
  fighter: BattleSessionFighter;
  onClose: () => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onBroadcast?: () => void;
}) {
  const [injuryTypes, setInjuryTypes] = useState<InjuryType[]>([]);
  const [loading, setLoading] = useState(true);
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
      onBroadcast?.();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add injury'),
  });

  useEffect(() => {
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
          confirmDisabled={addMut.isPending}
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
          confirmDisabled={addMut.isPending}
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
  loadoutName,
  cost,
  xp,
  injuryCount,
  canInteract,
  battleActive,
  isSpyrer,
  gangFighter,
  gangId,
  campaignId,
  onXpChanged,
  onConditionsChanged,
  onActivationsChange,
  onInjuryAdded,
  onNoteChanged,
  onBroadcast,
}: {
  fighter: BattleSessionFighter;
  name: string;
  loadoutName: string | undefined;
  cost: number | undefined;
  xp: number;
  injuryCount: number;
  canInteract: boolean;
  battleActive: boolean;
  isSpyrer: boolean;
  gangFighter: GangFighter | undefined;
  gangId: string;
  campaignId?: string | null;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[]) => void;
  onActivationsChange: (activations: number) => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onNoteChanged: (note: string) => void;
  onBroadcast?: () => void;
}) {
  const [showActionModal, setShowActionModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const injuries = fighter.session_record?.injuries ?? [];
  const conditions = fighter.session_record?.conditions ?? [];
  const note = fighter.session_record?.note ?? '';
  const activations = fighter.session_record?.activations ?? 1;
  const isReady = activations > 0;
  const maxActivations = isSpyrer ? 2 : 1;

  const toggleReady = () => {
    const next = activations > 0 ? activations - 1 : maxActivations;
    onActivationsChange(next);
  };

  const iconColor = activations >= 2 ? 'text-orange-500' : activations === 1 ? 'text-green-500' : 'text-muted-foreground/30';
  const fighterType = gangFighter?.fighter_type;
  const fighterClass = gangFighter?.fighter_class;
  // Second row format: type (class)
  const fighterDetails = [
    fighterType,
    fighterClass ? `(${fighterClass})` : '',
  ].filter(Boolean).join(' ');

  return (
    <tr className={`border-b last:border-b-0 ${!isReady ? 'opacity-40' : ''}`}>
      <td className="p-1 md:p-2 w-full align-top">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* First row format: label + fighter name [loadout] */}
            <div className="flex items-center gap-1 flex-wrap">
              {gangFighter?.label && (
                <span className="inline-flex shrink-0 items-center rounded-sm bg-card px-1 text-xs font-bold font-mono uppercase border border-border">
                  {gangFighter.label}
                </span>
              )}
              <span>
                {name}
                {loadoutName && (
                  <span className="text-muted-foreground"> [{loadoutName}]</span>
                )}
              </span>
              {gangFighter?.killed && <IoSkull className="text-gray-300" title="Killed" aria-label="Killed" />}
              {gangFighter?.retired && <MdChair className="text-muted-foreground" title="Retired" aria-label="Retired" />}
              {gangFighter?.enslaved && <GiCrossedChains className="text-sky-200" title="Enslaved" aria-label="Enslaved" />}
              {gangFighter?.starved && <TbMeatOff className="text-red-500" title="Starved" aria-label="Starved" />}
              {gangFighter?.recovery && <FaMedkit className="text-blue-500" title="In recovery" aria-label="In recovery" />}
              {gangFighter?.captured && <GiHandcuffs className="text-red-600" title="Captured" aria-label="Captured" />}
            </div>
            {fighterDetails && (
              <div className="text-xs text-muted-foreground">{fighterDetails}</div>
            )}
            {(xp > 0 || injuryCount > 0 || conditions.length > 0 || (!canInteract && !battleActive && injuries.length > 0)) && (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {xp > 0 && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    +{xp} XP
                  </span>
                )}
                {canInteract || battleActive ? (
                  <>
                    {injuryCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        {injuryCount} {injuryCount === 1 ? 'injury' : 'injuries'}
                      </span>
                    )}
                    {conditions.map((condition) => (
                      <ConditionBadge key={condition.key} condition={condition} iconOnly />
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
                    {conditions.map((condition) => (
                      <ConditionBadge key={condition.key} condition={condition} iconOnly />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="p-1 md:p-2 text-right text-muted-foreground whitespace-nowrap align-top">
        {cost !== undefined ? (cost === 0 ? '*' : cost) : '—'}
      </td>
      {canInteract ? (
        <td className="p-1 md:p-2 align-top">
          <div className="grid grid-cols-2 gap-2.5 items-start justify-items-center w-fit ml-auto md:flex md:items-start md:justify-end md:w-auto">
            {gangFighter && (
              <FaRegAddressCard
                className="size-6 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer transition-colors duration-200"
                title="View fighter card"
                onClick={() => setShowInfoModal(true)}
              />
            )}
            <LuClipboard
              className={`size-6 transition-colors duration-200 cursor-pointer hover:text-muted-foreground ${note ? 'text-amber-500' : 'text-muted-foreground/30'}`}
              title={note || 'Add note'}
              onClick={() => { setNoteDraft(note); setShowNoteModal(true); }}
            />
            <FaUserCheck
              className={`size-6 transition-colors duration-200 ${iconColor} cursor-pointer hover:text-muted-foreground`}
              title={activations > 0 ? `${activations} activation${activations !== 1 ? 's' : ''} remaining` : 'Activated'}
              onClick={toggleReady}
            />
            <CgMoreVerticalO
              className="size-6 text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-200 cursor-pointer"
              title="Click to open action menu"
              onClick={() => setShowActionModal(true)}
            />
          </div>
          {showActionModal && createPortal(
            <FighterActionModal
              fighter={fighter}
              gangId={gangId}
              campaignId={campaignId}
              onXpChanged={onXpChanged}
              onConditionsChanged={onConditionsChanged}
              onInjuryAdded={onInjuryAdded}
              onBroadcast={onBroadcast}
              onClose={() => setShowActionModal(false)}
            />,
            document.body
          )}
        </td>
      ) : battleActive ? (
        <td className="p-1 md:p-2 text-right align-top max-md:whitespace-normal md:whitespace-nowrap">
          <div className="grid grid-cols-2 gap-2 items-start justify-items-center w-fit ml-auto md:flex md:items-start md:justify-end md:gap-4 md:w-auto">
            {gangFighter && (
              <FaRegAddressCard
                className="size-6 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer transition-colors duration-200"
                title="View fighter card"
                onClick={() => setShowInfoModal(true)}
              />
            )}
            {note && (
              <LuClipboard
                className="size-6 text-amber-500 cursor-pointer hover:text-amber-400 transition-colors duration-200"
                title={note}
                onClick={() => { setNoteDraft(note); setShowNoteModal(true); }}
              />
            )}
            {battleActive && (
              <FaUserCheck
                className={`size-6 ${iconColor}`}
                title={activations > 0 ? `${activations} activation${activations !== 1 ? 's' : ''} remaining` : 'Activated'}
              />
            )}
          </div>
        </td>
      ) : null}
      {showInfoModal && gangFighter && createPortal(
        <div
          className="fixed inset-0 flex justify-center items-center z-[100] px-[10px] bg-black/50 dark:bg-neutral-700/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowInfoModal(false);
          }}
        >
          <div className="relative max-w-2xl w-full">
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="absolute -top-3 -right-3 z-10 bg-neutral-700 hover:bg-neutral-500 text-white rounded-full size-8 flex items-center justify-center text-lg transition-colors shadow-md"
            >
              ×
            </button>
            <div className="max-h-svh overflow-y-auto">
              <FighterCard
                {...gangFighter}
                name={gangFighter.fighter_name}
                type={gangFighter.fighter_type}
                skills={gangFighter.skills}
                effects={gangFighter.effects as any}
                vehicle={gangFighter.vehicles?.[0]}
                // Prevent hover scale from creating modal scrollbars; gang-page cards do not pass this prop.
                disableHoverEffects
                advancements={{ characteristics: {}, skills: {} }}
                base_stats={{
                  movement: gangFighter.movement,
                  weapon_skill: gangFighter.weapon_skill,
                  ballistic_skill: gangFighter.ballistic_skill,
                  strength: gangFighter.strength,
                  toughness: gangFighter.toughness,
                  wounds: gangFighter.wounds,
                  initiative: gangFighter.initiative,
                  attacks: gangFighter.attacks,
                  leadership: gangFighter.leadership,
                  cool: gangFighter.cool,
                  willpower: gangFighter.willpower,
                  intelligence: gangFighter.intelligence,
                }}
                current_stats={{
                  movement: gangFighter.movement,
                  weapon_skill: gangFighter.weapon_skill,
                  ballistic_skill: gangFighter.ballistic_skill,
                  strength: gangFighter.strength,
                  toughness: gangFighter.toughness,
                  wounds: gangFighter.wounds,
                  initiative: gangFighter.initiative,
                  attacks: gangFighter.attacks,
                  leadership: gangFighter.leadership,
                  cool: gangFighter.cool,
                  willpower: gangFighter.willpower,
                  intelligence: gangFighter.intelligence,
                }}
                disableLink
              />
            </div>
          </div>
        </div>,
        document.body
      )}
      {showNoteModal && createPortal(
        <Modal
          title="Fighter Note"
          onClose={() => setShowNoteModal(false)}
          onConfirm={canInteract ? async () => {
            onNoteChanged(noteDraft.trim());
            return true;
          } : undefined}
          confirmText="Save"
          confirmDisabled={noteDraft.trim() === note}
        >
          {canInteract ? (
            <div>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note here..."
                maxLength={250}
                autoFocus
              />
              <p className={`mt-1 text-xs ${noteDraft.length > 250 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {noteDraft.length}/250
              </p>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{note || 'No note.'}</p>
          )}
        </Modal>,
        document.body
      )}
    </tr>
  );
}

function BattleParticipationModal({
  crewFighters,
  gangFightersList,
  onConfirm,
  onClose,
}: {
  crewFighters: BattleSessionFighter[];
  gangFightersList: GangFighter[];
  onConfirm: (xpByFighterId: Record<string, number>) => void;
  onClose: () => void;
}) {
  const crewLoadouts = useMemo(
    () => new Map(crewFighters.map((f) => [f.fighter_id, f.loadout_id])),
    [crewFighters]
  );

  const uniqueFighters = useMemo(() => {
    const seen = new Set<string>();
    const result: GangFighter[] = [];
    for (const gf of gangFightersList) {
      if (seen.has(gf.id)) continue;
      const crewLoadoutId = crewLoadouts.get(gf.id);
      if (crewLoadoutId !== undefined && gf.active_loadout_id === (crewLoadoutId ?? undefined)) {
        seen.add(gf.id);
        result.push(gf);
      }
    }
    for (const gf of gangFightersList) {
      if (seen.has(gf.id)) continue;
      seen.add(gf.id);
      result.push(gf);
    }
    return result;
  }, [gangFightersList, crewLoadouts]);

  const [xpAmounts, setXpAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(uniqueFighters.map((gf) => [gf.id, crewLoadouts.has(gf.id) ? 1 : 0]))
  );

  const adjust = (id: string, delta: number) =>
    setXpAmounts((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] ?? 0) + delta) }));

  const totalXp = Object.values(xpAmounts).reduce((sum, v) => sum + v, 0);

  return (
    <Modal
      title="Participation XP"
      onClose={onClose}
      onConfirm={async () => {
        const filtered = Object.fromEntries(
          Object.entries(xpAmounts).filter(([, xp]) => xp > 0)
        );
        onConfirm(filtered);
        return true;
      }}
      confirmText="Confirm"
      confirmDisabled={totalXp === 0}
    >
      <div className="space-y-3">
        {uniqueFighters.map((gf) => {
          const details = [gf.fighter_type, gf.fighter_class ? `(${gf.fighter_class})` : ''].filter(Boolean).join(' ');
          return (
            <div key={gf.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{gf.fighter_name}</div>
                {details && <div className="text-xs text-muted-foreground">{details}</div>}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                  onClick={() => adjust(gf.id, -1)}
                  disabled={(xpAmounts[gf.id] ?? 0) === 0}
                >
                  <LuMinus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center">{xpAmounts[gf.id] ?? 0}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                  onClick={() => adjust(gf.id, 1)}
                >
                  <LuPlus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ParticipantCard
// ---------------------------------------------------------------------------

interface ParticipantCardProps {
  participant: BattleSessionParticipant & { fighters: BattleSessionFighter[] };
  session: BattleSessionFull;
  userId: string;
  // Session creator or arbitrator: may manage participants (remove, set roles)
  canManage: boolean;
  // Campaign OWNER/ARBITRATOR (or site admin): may edit any participant's data,
  // unlike the session creator who only manages the session itself
  isArbitrator?: boolean;
  editable?: boolean;
  battleActive?: boolean;
  gangFightersList?: GangFighter[];
  positioning?: Record<string, any> | null;
  onBroadcast?: () => void;
}

export default function ParticipantCard({
  participant,
  session,
  userId,
  canManage,
  isArbitrator = false,
  editable = false,
  battleActive = false,
  gangFightersList = [],
  positioning,
  onBroadcast,
}: ParticipantCardProps) {
  const [creditsDelta, setCreditsDelta] = useState('');
  const [repDelta, setRepDelta] = useState('');
  const [localCreditsEarned, setLocalCreditsEarned] = useState(participant.credits_earned);
  const [localRepChange, setLocalRepChange] = useState(participant.reputation_change);
  const [resourceDeltas, setResourceDeltas] = useState<Record<string, string>>({});
  const [localResourceChanges, setLocalResourceChanges] = useState(participant.resource_changes ?? []);
  const [localFighters, setLocalFighters] = useState<BattleSessionFighter[]>(participant.fighters);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [showParticipationModal, setShowParticipationModal] = useState(false);
  const [tradingPostRoll, setTradingPostRoll] = useState<{ dice: number[]; total: number; modifier: number; grandTotal: number } | null>(null);
  const [tradingPostModifier, setTradingPostModifier] = useState('');
  const [localRole, setLocalRole] = useState<'attacker' | 'defender' | 'none'>(participant.role);

  const [readyOverride, setReadyOverride] = useState<boolean | null>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current); }, []);
  const [prevReadyProp, setPrevReadyProp] = useState(participant.ready);
  if (prevReadyProp !== participant.ready) {
    setPrevReadyProp(participant.ready);
    if (readyOverride !== null) setReadyOverride(null);
  }
  const localReady = readyOverride ?? participant.ready;
  const isMyGang = participant.user_id === userId;
  const isPostBattle = session.status === 'post_battle';
  const canEdit = editable && (isMyGang || isArbitrator) && !isPostBattle;
  const canInteract = battleActive && (isMyGang || isArbitrator);
  const canPostBattle = isPostBattle && (isMyGang || isArbitrator);
  const canEditRole = editable && (canManage || isMyGang) && !isPostBattle;

  const handleRoleChange = (role: 'attacker' | 'defender' | 'none') => {
    setLocalRole(role);
    updateParticipantRole(session.id, participant.id, role).then((result) => {
      if (result.success) {
        onBroadcast?.();
      } else {
        setLocalRole(participant.role);
        toast.error(result.error || 'Failed to update role');
      }
    });
  };

  // Map expanded gang fighters (one entry per loadout) to crew modal format
  const gangFighters = useMemo(() => {
    return gangFightersList.map((gf) => ({
      id: gf.id,
      fighter_name: gf.fighter_name,
      label: gf.label,
      fighter_type: gf.fighter_type,
      credits: gf.loadout_cost ?? gf.credits,
      loadout_id: gf.active_loadout_id,
      loadout_name: gf.active_loadout_name,
      killed: gf.killed,
      retired: gf.retired,
      enslaved: gf.enslaved,
      starved: gf.starved,
      recovery: gf.recovery,
      captured: gf.captured,
      fighter_class: gf.fighter_class,
      owner_id: gf.owner_id,
      owner_name: gf.owner_name,
    }));
  }, [gangFightersList]);

  const selectedFighterIds = new Set(localFighters.map((f) => f.fighter_id));
  const selectedFighters = new Map<string, string | undefined>(
    localFighters.map((f) => [f.fighter_id, f.loadout_id ?? undefined])
  );
  const availableFighters = gangFighters.filter((f) => !selectedFighterIds.has(f.id));

  const sortedLocalFighters = useMemo(() => {
    return sortParticipantFightersByPositioning(localFighters, positioning);
  }, [localFighters, positioning]);

  const totalInjuries = localFighters.reduce((sum, f) => sum + (f.session_record?.injuries?.length ?? 0), 0);
  const crewRating = localFighters.reduce((sum, f) => {
    const match = gangFighters.find(
      (gf) => gf.id === f.fighter_id && gf.loadout_id === (f.loadout_id ?? undefined)
    ) ?? gangFighters.find((gf) => gf.id === f.fighter_id);
    return sum + (match?.credits ?? f.fighter?.credits ?? 0);
  }, 0);

  const removeMutation = useMutation({
    mutationFn: () => removeParticipant(session.id, participant.id),
    onSuccess: () => onBroadcast?.(),
    onError: () => toast.error('Failed to remove participant'),
  });

  const gangOutcomeMutation = useMutation({
    mutationFn: (deltaStr: string) => {
      const delta = parseInt(deltaStr) || 0;
      if (delta === 0) return Promise.resolve({ success: true });
      const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
      return updateGangOutcome({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        credits_change: Math.abs(delta),
        credits_operation: operation,
      });
    },
    onMutate: (deltaStr: string) => {
      const prev = localCreditsEarned;
      const delta = parseInt(deltaStr) || 0;
      setLocalCreditsEarned((cur) => cur + delta);
      setCreditsDelta('');
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalCreditsEarned(context.prev);
      toast.error('Failed to update credits');
    },
  });

  const repOutcomeMutation = useMutation({
    mutationFn: (deltaStr: string) => {
      const delta = parseInt(deltaStr) || 0;
      if (delta === 0) return Promise.resolve({ success: true });
      const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
      return updateGangOutcome({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        reputation_change: Math.abs(delta),
        reputation_operation: operation,
      });
    },
    onMutate: (deltaStr: string) => {
      const prev = localRepChange;
      const delta = parseInt(deltaStr) || 0;
      setLocalRepChange((cur) => cur + delta);
      setRepDelta('');
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalRepChange(context.prev);
      toast.error('Failed to update reputation');
    },
  });

  const campaignGangId = session.campaign_gang_ids?.[participant.gang_id];

  const resourceOutcomeMutation = useMutation({
    mutationFn: (params: { resource_id: string; resource_name: string; is_custom: boolean; deltaStr: string }) => {
      const delta = parseInt(params.deltaStr) || 0;
      if (delta === 0 || !campaignGangId) return Promise.resolve({ success: true });
      return updateParticipantResources({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        campaign_gang_id: campaignGangId,
        resource: {
          resource_id: params.resource_id,
          resource_name: params.resource_name,
          is_custom: params.is_custom,
          quantity_delta: delta,
        },
      });
    },
    onMutate: (params) => {
      const delta = parseInt(params.deltaStr) || 0;
      const prev = [...localResourceChanges];
      setLocalResourceChanges((cur) => {
        const updated = [...cur];
        const idx = updated.findIndex((r) => r.resource_id === params.resource_id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], quantity_delta: updated[idx].quantity_delta + delta };
        } else {
          updated.push({
            resource_id: params.resource_id,
            resource_name: params.resource_name,
            is_custom: params.is_custom,
            quantity_delta: delta,
          });
        }
        return updated;
      });
      setResourceDeltas((cur) => ({ ...cur, [params.resource_id]: '' }));
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalResourceChanges(context.prev);
      toast.error('Failed to update resource');
    },
  });

  const buildOptimisticFighter = (fighterId: string, loadoutId?: string): BattleSessionFighter => {
    const gf = gangFighters.find((f) => f.id === fighterId && (!loadoutId || f.loadout_id === loadoutId))
      ?? gangFighters.find((f) => f.id === fighterId);
    const fullGf = gangFightersList.find((f) => f.id === fighterId);
    const isDual = hasDualActivation(fullGf?.special_rules);
    return {
      id: `temp-${Date.now()}-${fighterId}`,
      battle_session_id: session.id,
      participant_id: participant.id,
      fighter_id: fighterId,
      loadout_id: loadoutId,
      session_record: { xp_earned: 0, injuries: [], conditions: [], activations: isDual ? 2 : 1 },
      created_at: new Date().toISOString(),
      fighter: gf ? { id: gf.id, fighter_name: gf.fighter_name, credits: gf.credits, special_rules: fullGf?.special_rules } : undefined,
    };
  };

  const _addFighterMutation = useMutation({
    mutationFn: async (entry: { fighter_id: string; loadout_id?: string }) => {
      const result = await bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_entries: [entry],
      });
      if (!result.success) throw new Error(result.error || 'Failed to add fighter');
      return result;
    },
    onMutate: (entry) => {
      const prev = localFighters;
      setLocalFighters((cur) => [...cur, buildOptimisticFighter(entry.fighter_id, entry.loadout_id)]);
      return { prev };
    },
    onSuccess: (_result, entry) => {
      const name = gangFighters.find((gf) => gf.id === entry.fighter_id)?.fighter_name;
      toast.success(`${name ?? 'Fighter'} added`);
      onBroadcast?.();
    },
    onError: (_err, _id, context) => {
      toast.error('Failed to add fighter');
      if (context?.prev) setLocalFighters(context.prev);
    },
  });

  const _addAllFightersMutation = useMutation({
    mutationFn: async () => {
      const seen = new Set<string>();
      const entries = availableFighters
        .filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
        .map((f) => ({ fighter_id: f.id, loadout_id: f.loadout_id }));
      const result = await bulkAddFightersToSession({
        session_id: session.id,
        participant_id: participant.id,
        fighter_entries: entries,
      });
      if (!result.success) throw new Error(result.error || 'Failed to add fighters');
      return { ...result, count: entries.length };
    },
    onMutate: () => {
      const prev = localFighters;
      const seen = new Set<string>();
      const entries = availableFighters
        .filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
        .map((f) => ({ fighter_id: f.id, loadout_id: f.loadout_id }));
      const newFighters = entries.map((e) => buildOptimisticFighter(e.fighter_id, e.loadout_id));
      setLocalFighters((cur) => [...cur, ...newFighters]);
      return { prev, count: entries.length };
    },
    onSuccess: (_result, _vars, context) => {
      const count = context?.count ?? 0;
      toast.success(`${count} fighter${count !== 1 ? 's' : ''} added`);
      onBroadcast?.();
    },
    onError: (_err, _vars, context) => {
      toast.error('Failed to add fighters');
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
    onSuccess: () => onBroadcast?.(),
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
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update conditions');
    },
  });

  const updateActivationsMutation = useMutation({
    mutationFn: async ({ sessionFighterId, activations }: { sessionFighterId: string; activations: number }) => {
      const result = await updateActivations({ session_fighter_id: sessionFighterId, activations });
      if (!result.success) throw new Error(result.error || 'Failed to update activations');
      return result;
    },
    onMutate: ({ sessionFighterId, activations }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, activations } }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update activations');
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ sessionFighterId, note }: { sessionFighterId: string; note: string }) => {
      const result = await updateSessionNote({ session_fighter_id: sessionFighterId, note });
      if (!result.success) throw new Error(result.error || 'Failed to update note');
      return result;
    },
    onMutate: ({ sessionFighterId, note }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, note: note || undefined } }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update note');
    },
  });

  const [prevFighters, setPrevFighters] = useState(participant.fighters);
  if (participant.fighters !== prevFighters) {
    setPrevFighters(participant.fighters);
    setLocalFighters(participant.fighters);
  }

  const [prevCreditsEarned, setPrevCreditsEarned] = useState(participant.credits_earned);
  if (participant.credits_earned !== prevCreditsEarned) {
    setPrevCreditsEarned(participant.credits_earned);
    setLocalCreditsEarned(participant.credits_earned);
  }

  const [prevRepChange, setPrevRepChange] = useState(participant.reputation_change);
  if (participant.reputation_change !== prevRepChange) {
    setPrevRepChange(participant.reputation_change);
    setLocalRepChange(participant.reputation_change);
  }

  const [prevRole, setPrevRole] = useState(participant.role);
  if (participant.role !== prevRole) {
    setPrevRole(participant.role);
    setLocalRole(participant.role);
  }



  return (
    <div>
      {/* Gang Header */}
      <div className="py-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {participant.gang?.name || 'Unknown Gang'}
              </span>
              {localRole !== 'none' && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  localRole === 'attacker'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {localRole === 'attacker' ? 'Attacker' : 'Defender'}
                </span>
              )}
              {editable && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  localReady
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}>
                  {localReady ? 'Ready' : 'Not Ready'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                Player:
                {participant.profile?.username ? (
                  <Link href={`/user/${participant.user_id}`}>
                    <Badge variant="outline" className="flex items-center gap-1 hover:bg-accent transition-colors">
                      {participant.profile.patreon_tier_id && (
                        <PatreonSupporterIcon
                          patreonTierId={participant.profile.patreon_tier_id}
                          patreonTierTitle={participant.profile.patreon_tier_title}
                        />
                      )}
                      {participant.profile.username}
                    </Badge>
                  </Link>
                ) : (
                  ' Unknown'
                )}
              </span>
              <span>Crew Rating: {crewRating}</span>
              {(() => {
                const exoticBeastCount = localFighters.filter((f) => {
                  const fc = gangFightersList.find((gf) => gf.id === f.fighter_id)?.fighter_class?.toLowerCase() ?? '';
                  return fc === 'exotic beast' || fc === 'exotic beast specialist';
                }).length;
                const crewCount = localFighters.length - exoticBeastCount;
                return (
                  <span>
                    Crew Size: {crewCount}
                    {exoticBeastCount > 0 && (
                      <span className="text-neutral-400"> (Excluding {exoticBeastCount} Exotic Beast{exoticBeastCount !== 1 ? 's' : ''})</span>
                    )}
                  </span>
                );
              })()}
              {totalInjuries > 0 && (
                <span className="text-red-500">{totalInjuries} injuries</span>
              )}
            </div>
          </div>
          {(canEdit || canPostBattle || ((canManage || isMyGang) && editable && !isPostBattle)) && (
            <div className="flex gap-2 self-end sm:self-auto">
              {canPostBattle && localFighters.length > 0 && (
                <Button
                  variant="default"
                  onClick={() => setShowParticipationModal(true)}
                >
                  Participation XP
                </Button>
              )}
              {(canEdit || canPostBattle) && (
                <>
                  <Button
                    variant={localReady ? 'default' : 'outline'}
                    onClick={async () => {
                      const prev = localReady;
                      setReadyOverride(!prev);
                      readyTimeoutRef.current = setTimeout(() => setReadyOverride(null), 10000);
                      const result = await toggleParticipantReady(session.id, participant.id);
                      if (!result.success) {
                        if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
                        setReadyOverride(null);
                        toast.error(result.error || 'Failed to toggle ready');
                      } else {
                        onBroadcast?.();
                      }
                    }}
                    disabled={readyOverride !== null}
                  >
                    {localReady ? 'Unready' : 'Ready'}
                  </Button>
                  {canEdit && (
                    <Button onClick={() => setShowCrewModal(true)}>
                      Select Crew
                    </Button>
                  )}
                </>
              )}
              {(canManage || isMyGang) && editable && !isPostBattle && (
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
          )}
        </div>
        {canEditRole && (
          <div className="mt-2 flex items-center gap-4">
            {(['attacker', 'defender', 'none'] as const).map((role) => (
              <label key={role} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`role-${participant.id}`}
                  checked={localRole === role}
                  onChange={() => handleRoleChange(role)}
                  className="h-4 w-4 text-foreground focus:ring-black border-border"
                />
                {role === 'attacker' ? 'Attacker' : role === 'defender' ? 'Defender' : 'None'}
              </label>
            ))}
          </div>
        )}
        {showCrewModal && (
          <CrewSelectionModal
            gangId={participant.gang_id}
            gangFighters={gangFighters}
            selectedFighters={selectedFighters}
            loading={false}
            onClose={() => setShowCrewModal(false)}
            onConfirm={async (toAdd, toRemove, toUpdate) => {
              const snapshot = [...localFighters];

              if (toAdd.length > 0) {
                const newFighters = toAdd.map((e) => buildOptimisticFighter(e.fighter_id, e.loadout_id));
                setLocalFighters((cur) => [...cur, ...newFighters]);
              }
              if (toRemove.length > 0) {
                const removeSet = new Set(toRemove);
                setLocalFighters((cur) => cur.filter((f) => !removeSet.has(f.fighter_id)));
              }
              if (toUpdate.length > 0) {
                setLocalFighters((cur) =>
                  cur.map((f) => {
                    const match = toUpdate.find((e) => e.fighter_id === f.fighter_id);
                    return match ? { ...f, loadout_id: match.loadout_id } : f;
                  })
                );
              }

              const results = await Promise.all([
                toAdd.length > 0
                  ? bulkAddFightersToSession({
                      session_id: session.id,
                      participant_id: participant.id,
                      fighter_entries: toAdd,
                    })
                  : { success: true as const, error: undefined },
                ...toRemove.map((id) => removeFighterFromSession(session.id, id, participant.id)),
                ...toUpdate.map((entry) => updateFighterLoadout(session.id, entry.fighter_id, entry.loadout_id, participant.id)),
              ]);

              const failed = results.filter((r) => !r.success);
              if (failed.length > 0) {
                setLocalFighters(snapshot);
                toast.error(failed[0].error || 'Failed to update crew');
                return false;
              }

              toast.success('Crew updated');
              onBroadcast?.();
              return true;
            }}
          />
        )}
        {showParticipationModal && (
          <BattleParticipationModal
            crewFighters={localFighters}
            gangFightersList={gangFightersList}
            onClose={() => setShowParticipationModal(false)}
            onConfirm={(xpByFighterId) => {
              const entries = Object.entries(xpByFighterId);
              setLocalFighters((cur) =>
                cur.map((f) => {
                  const xp = xpByFighterId[f.fighter_id];
                  return xp
                    ? { ...f, session_record: { ...f.session_record, xp_earned: (f.session_record?.xp_earned ?? 0) + xp } }
                    : f;
                })
              );
              const calls = entries.flatMap(([fighterId, xp]) => {
                const sessionFighter = localFighters.find((lf) => lf.fighter_id === fighterId);
                const persistCalls: Promise<{ success: boolean }>[] = [
                  updateFighterXp({ fighter_id: fighterId, xp_to_add: xp }),
                ];
                if (sessionFighter) {
                  const totalXp = (sessionFighter.session_record?.xp_earned ?? 0) + xp;
                  persistCalls.push(updateSessionXp({ session_fighter_id: sessionFighter.id, xp_earned: totalXp }));
                }
                return persistCalls;
              });
              Promise.all(calls).then((results) => {
                const failed = results.filter((r) => !r.success);
                if (failed.length > 0) {
                  toast.error('Failed to update participation XP');
                } else {
                  toast.success(`Participation XP updated for ${entries.length} fighter${entries.length !== 1 ? 's' : ''}`);
                }
                onBroadcast?.();
              });
              setShowParticipationModal(false);
            }}
          />
        )}
      </div>

      <div className="pb-6">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="p-1 md:p-2 text-left font-medium w-full">Fighter</th>
                  <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">Value</th>
                  {(canInteract || battleActive) && <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap min-w-[3.6rem]">{canInteract ? 'Actions' : 'Status'}</th>}
                </tr>
              </thead>
              <tbody>
                {localFighters.length === 0 ? (
                  <tr>
                    <td colSpan={(canInteract || battleActive) ? 3 : 2} className="text-muted-foreground italic text-center py-4">
                      {canEdit ? 'No fighters added yet.' : 'No fighters.'}
                    </td>
                  </tr>
                ) : (
                  sortedLocalFighters.map((f) => {
                    const match = gangFighters.find(
                      (gf) => gf.id === f.fighter_id && gf.loadout_id === (f.loadout_id ?? undefined)
                    ) ?? gangFighters.find((gf) => gf.id === f.fighter_id);
                    const fullMatch = gangFightersList.find(
                      (gf) => gf.id === f.fighter_id && gf.active_loadout_id === (f.loadout_id ?? undefined)
                    ) ?? gangFightersList.find((gf) => gf.id === f.fighter_id);
                    const rawName = match?.fighter_name ?? f.fighter?.fighter_name ?? 'Unknown Fighter';
                    const fighterClass = (fullMatch?.fighter_class ?? '').toLowerCase();
                    const isAssociatedExoticBeast =
                      (fighterClass === 'exotic beast' || fighterClass === 'exotic beast specialist') &&
                      Boolean(fullMatch?.owner_id);
                    const name = isAssociatedExoticBeast ? `— ${rawName}` : rawName;
                    const cost = match?.credits ?? f.fighter?.credits;
                    const xp = f.session_record?.xp_earned ?? 0;
                    const injuryCount = f.session_record?.injuries?.length ?? 0;
                    return (
                      <FighterRow
                        key={f.id}
                        fighter={f}
                        name={name}
                        loadoutName={match?.loadout_name}
                        cost={cost}
                        xp={xp}
                        injuryCount={injuryCount}
                        canInteract={canInteract}
                        battleActive={battleActive}
                        isSpyrer={hasDualActivation(fullMatch?.special_rules) || hasDualActivation(f.fighter?.special_rules)}
                        gangFighter={fullMatch}
                        gangId={participant.gang_id}
                        campaignId={session.campaign_id}
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
                        onActivationsChange={(activations) => {
                          updateActivationsMutation.mutate({
                            sessionFighterId: f.id,
                            activations,
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
                        onNoteChanged={(note) => {
                          updateNoteMutation.mutate({ sessionFighterId: f.id, note });
                        }}
                        onBroadcast={onBroadcast}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {canInteract && (
            <div className="border-t border-neutral-100 pt-3 dark:border-neutral-700">
              <label className="mb-1 block text-sm text-neutral-500">
                Credits Earned
                <span className="text-xs text-muted-foreground"> (Current: {localCreditsEarned})</span>
              </label>
              <div className="flex items-center gap-2 max-w-[250px]">
                <input
                  type="tel"
                  inputMode="url"
                  pattern="-?[0-9]+"
                  value={creditsDelta}
                  onChange={(e) => setCreditsDelta(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
                <Button
                  size="sm"
                  onClick={() => gangOutcomeMutation.mutate(creditsDelta)}
                  disabled={!creditsDelta || (parseInt(creditsDelta) || 0) === 0 || gangOutcomeMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          )}

          {!canInteract && battleActive && localCreditsEarned !== 0 && (
            <div className="border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700">
              <span>Credits: {localCreditsEarned > 0 ? '+' : ''}{localCreditsEarned}</span>
            </div>
          )}
        </div>

          {canPostBattle && (
            <div className="border-t border-neutral-100 pt-3 dark:border-neutral-700 grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-full">
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-sm text-neutral-500">Trading Post Roll</span>
                  {tradingPostRoll && (
                    <span className="text-xs text-muted-foreground">
                      Roll {tradingPostRoll.total} ({tradingPostRoll.dice.join(', ')})
                      {tradingPostRoll.modifier !== 0 && ` ${tradingPostRoll.modifier > 0 ? '+' : ''}${tradingPostRoll.modifier} = ${tradingPostRoll.grandTotal}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-nowrap">
                  <Button
                    size="sm"
                    onClick={() => {
                      const result = rollNd6Outcome(2);
                      const mod = parseInt(tradingPostModifier) || 0;
                      const grandTotal = result.total + mod;
                      setTradingPostRoll({
                        dice: result.dice,
                        total: result.total,
                        modifier: mod,
                        grandTotal,
                      });
                      const desc = mod !== 0
                        ? `Roll ${result.total} (${result.dice.join(', ')}) ${mod > 0 ? '+' : ''}${mod} = ${grandTotal}`
                        : `Roll ${result.total} (${result.dice.join(', ')})`;
                      createGangLog({
                        gang_id: participant.gang_id,
                        action_type: 'trading_post_roll',
                        description: desc,
                      });
                    }}
                  >
                    Roll
                  </Button>
                  <input
                    type="tel"
                    inputMode="url"
                    value={tradingPostModifier}
                    onChange={(e) => setTradingPostModifier(e.target.value)}
                    placeholder="Modifier"
                    className="w-20 rounded-sm border border-neutral-300 px-2 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800 shrink-0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-500">
                  Reputation Change
                  <span className="text-xs text-muted-foreground"> (Current: {localRepChange})</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="url"
                    pattern="-?[0-9]+"
                    value={repDelta}
                    onChange={(e) => setRepDelta(e.target.value)}
                    placeholder="+/-"
                    className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                  />
                  <Button
                    size="sm"
                    onClick={() => repOutcomeMutation.mutate(repDelta)}
                    disabled={!repDelta || (parseInt(repDelta) || 0) === 0 || repOutcomeMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-500">
                  Credits Earned
                  <span className="text-xs text-muted-foreground"> (Current: {localCreditsEarned})</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="url"
                    pattern="-?[0-9]+"
                    value={creditsDelta}
                    onChange={(e) => setCreditsDelta(e.target.value)}
                    placeholder="+/-"
                    className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                  />
                  <Button
                    size="sm"
                    onClick={() => gangOutcomeMutation.mutate(creditsDelta)}
                    disabled={!creditsDelta || (parseInt(creditsDelta) || 0) === 0 || gangOutcomeMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              {session.campaign_resources && campaignGangId && session.campaign_resources.map((res) => {
                const current = localResourceChanges.find((r) => r.resource_id === res.id);
                const currentDelta = current?.quantity_delta ?? 0;
                return (
                  <div key={res.id}>
                    <label className="mb-1 block text-sm text-neutral-500">
                      {res.resource_name}
                      <span className="text-xs text-muted-foreground"> (Current: {currentDelta})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        inputMode="url"
                        pattern="-?[0-9]+"
                        value={resourceDeltas[res.id] ?? ''}
                        onChange={(e) => setResourceDeltas((cur) => ({ ...cur, [res.id]: e.target.value }))}
                        placeholder="+/-"
                        className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                      />
                      <Button
                        size="sm"
                        onClick={() => resourceOutcomeMutation.mutate({
                          resource_id: res.id,
                          resource_name: res.resource_name,
                          is_custom: res.is_custom,
                          deltaStr: resourceDeltas[res.id] ?? '',
                        })}
                        disabled={
                          !resourceDeltas[res.id] ||
                          (parseInt(resourceDeltas[res.id]) || 0) === 0 ||
                          resourceOutcomeMutation.isPending
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isPostBattle && !isMyGang && !isArbitrator && (localRepChange !== 0 || localCreditsEarned !== 0 || localResourceChanges.some((r) => r.quantity_delta !== 0)) && (
            <div className="border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700 flex gap-4 flex-wrap">
              {localRepChange !== 0 && (
                <span>Reputation: {localRepChange > 0 ? '+' : ''}{localRepChange}</span>
              )}
              {localCreditsEarned !== 0 && (
                <span>Credits: {localCreditsEarned > 0 ? '+' : ''}{localCreditsEarned}</span>
              )}
              {localResourceChanges.filter((r) => r.quantity_delta !== 0).map((r) => (
                <span key={r.resource_id}>
                  {r.resource_name}: {r.quantity_delta > 0 ? '+' : ''}{r.quantity_delta}
                </span>
              ))}
            </div>
          )}
    </div>
  );
}
