'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import FighterEffectSelection from '@/components/fighter-effect-selection';
import DiceRoller from '@/components/dice-roller';
import { rollD66, resolveInjuryFor, resolveInjuryRangeByNameFor } from '@/utils/dice';
import { lastingInjuryRankFor } from '@/utils/lastingInjuryRank';
import { requiredHatredTarget } from '@/utils/injuryTarget';
import { InjuryHatredTargetPicker } from '@/components/fighter/injury-hatred-target-picker';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import { addSessionInjury } from '@/app/actions/battle-sessions';
import { addFighterInjury } from '@/app/actions/fighter-injury';
import type { BattleSessionFighter, SessionInjuryRecord } from '@/types/battle-session';

// ---------------------------------------------------------------------------
// InjuryPickerModal
// ---------------------------------------------------------------------------

interface InjuryType {
  id: string;
  effect_name: string;
  type_specific_data: any;
}

export default function InjuryPickerModal({
  fighter,
  editionSlug,
  candidateGangs,
  isSkirmish,
  isSpyrer,
  fighterWeapons,
  onClose,
  onInjuryAdded,
  onBroadcast,
}: {
  fighter: BattleSessionFighter;
  editionSlug?: string | null;
  /** Gangs in THIS battle, own gang excluded — not every gang in the campaign. */
  candidateGangs: CampaignGangWithFighters[];
  isSkirmish: boolean;
  isSpyrer: boolean;
  fighterWeapons: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
  onClose: () => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onBroadcast?: () => void;
}) {
  const [injuryTypes, setInjuryTypes] = useState<InjuryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [selectedInjury, setSelectedInjury] = useState<InjuryType | null>(null);
  const [mode, setMode] = useState<'main' | 'recovery' | 'captured' | 'equipment'>('main');
  const [pendingEquipmentId, setPendingEquipmentId] = useState<string | undefined>(undefined);
  const [effectSelectionValid, setEffectSelectionValid] = useState(false);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] }>(null);
  const [hatredTargetId, setHatredTargetId] = useState('');
  const [hatredGangId, setHatredGangId] = useState('');

  const addMut = useMutation({
    mutationFn: async (params: { fighter_effect_type_id: string; effect_name: string; send_to_recovery: boolean; set_captured: boolean; hatred_target_id?: string | null; target_equipment_id?: string }) => {
      const injuryResult = await addFighterInjury({
        fighter_id: fighter.fighter_id,
        injury_type_id: params.fighter_effect_type_id,
        send_to_recovery: params.send_to_recovery,
        set_captured: params.set_captured,
        hatred_target_id: params.hatred_target_id ?? null,
        target_equipment_id: params.target_equipment_id,
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
      toast.success(isSpyrer ? 'Rig glitch added' : 'Injury added');
      onInjuryAdded(injury);
      onBroadcast?.();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add injury'),
  });

  useEffect(() => {
    const editionQuery = editionSlug ? `&edition_slug=${encodeURIComponent(editionSlug)}` : '';
    fetch(`/api/fighters/injuries?is_spyrer=${isSpyrer}${editionQuery}`)
      .then((r) => r.json())
      .then(setInjuryTypes)
      .catch(() => toast.error(isSpyrer ? 'Failed to load rig glitches' : 'Failed to load injuries'))
      .finally(() => setLoading(false));
  }, [editionSlug, isSpyrer]);

  const injuryNoun = isSpyrer ? 'Rig Glitch' : 'Lasting Injury';
  const injuryTableOpts = { isSpyrer };
  const rankMap = lastingInjuryRankFor(editionSlug, false);

  const formatRange = (name: string): string => {
    const range = resolveInjuryRangeByNameFor(name, editionSlug, injuryTableOpts);
    if (!range) return '';
    const [min, max] = range;
    return min === max ? `${min}` : `${min}-${max}`;
  };

  // Which Hatred (X) target the selected injury needs, if any.
  const hatredTarget = requiredHatredTarget(selectedInjury?.type_specific_data);
  // Gang types are global; the other kinds need opponents, which a skirmish
  // session has none of that share a campaign (the RPC enforces that too).
  const hatredSelectable =
    hatredTarget === 'gang_type' || (!isSkirmish && candidateGangs.length > 0);
  const blockedByHatredTarget = hatredTarget !== null && hatredSelectable && !hatredTargetId;

  const commit = (send_to_recovery: boolean, set_captured: boolean, target_equipment_id?: string) => {
    if (!selectedInjury) return;
    addMut.mutate({
      fighter_effect_type_id: selectedInjury.id,
      effect_name: selectedInjury.effect_name,
      send_to_recovery,
      set_captured,
      hatred_target_id: hatredTarget && hatredTargetId ? hatredTargetId : undefined,
      target_equipment_id,
    });
  };

  const handleAdd = (): false | void => {
    if (!selectedInjury) { toast.error(`Select a ${injuryNoun}`); return false; }
    if (blockedByHatredTarget) {
      toast.error(`Please select the target for ${selectedInjury.effect_name}`);
      return false;
    }
    const tsd = selectedInjury.type_specific_data || {};
    if (tsd.applies_to === 'equipment') {
      if (fighterWeapons.length === 0) {
        toast.error(`${selectedInjury.effect_name} attaches to a weapon, but this fighter has none`);
        return false;
      }
      setMode('equipment');
      return false;
    }
    // Clear any weapon id left from a previous pick.
    setPendingEquipmentId(undefined);
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
        let groupLabel = 'Lasting Injuries';
        if (isSpyrer) {
          groupLabel = 'Rig Glitches';
        } else if (rankMap) {
          const rank = rankMap[injury.effect_name] ?? Infinity;
          if (rank >= 30) groupLabel = 'Mutations / Festering Injuries';
        }
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
          title={`Add ${injuryNoun}`}
          onClose={onClose}
          onConfirm={handleAdd}
          confirmText={`Add ${injuryNoun}`}
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
              resolveNameForRoll={(r) => resolveInjuryFor(r, editionSlug, injuryTableOpts)?.name}
              onRolled={(rolled) => {
                if (!rolled.length) return;
                const name = resolveInjuryFor(rolled[0].roll, editionSlug, injuryTableOpts)?.name;
                const match = injuryTypes.find((i) => i.effect_name === name) ?? (rolled[0].item as InjuryType);
                if (match) { setSelectedId(match.id); setSelectedInjury(match); }
              }}
              onRoll={(roll) => {
                const util = resolveInjuryFor(roll, editionSlug, injuryTableOpts);
                if (!util) return;
                const match = injuryTypes.find((i) => i.effect_name === util.name);
                if (match) { setSelectedId(match.id); setSelectedInjury(match); }
              }}
              buttonText="Roll D66"
            />
            <div className="space-y-2 border-t pt-3">
              <label className="text-sm font-medium">{isSpyrer ? 'Rig Glitches' : 'Lasting Injuries'}</label>
              <Combobox
                value={selectedId}
                onValueChange={(v) => {
                  setSelectedId(v);
                  setSelectedInjury(injuryTypes.find((i) => i.id === v) ?? null);
                  setHatredTargetId('');
                  setHatredGangId('');
                }}
                placeholder={loading ? 'Loading...' : `Select a ${injuryNoun}`}
                disabled={loading}
                options={options}
              />
            </div>
            <InjuryHatredTargetPicker
              hatredTarget={hatredTarget}
              candidateGangs={candidateGangs}
              isSkirmish={isSkirmish}
              editionSlug={editionSlug}
              value={hatredTargetId}
              onChange={setHatredTargetId}
              gangStepValue={hatredGangId}
              onGangStepChange={setHatredGangId}
            />
          </div>
        </Modal>
      )}

      {mode === 'equipment' && selectedInjury && (
        <Modal
          title="Select Weapon"
          content={
            <FighterEffectSelection
              ref={effectSelectionRef}
              equipmentId=""
              effectTypes={[]}
              targetSelectionOnly
              fighterId={fighter.fighter_id}
              modifierEquipmentId=""
              effectTypeId={selectedInjury.id}
              effectName={selectedInjury.effect_name}
              fighterWeapons={fighterWeapons}
              onApplyToTarget={async (equipmentId) => {
                const tsd = selectedInjury.type_specific_data || {};
                setPendingEquipmentId(equipmentId);
                if (tsd.recovery === 'true') { setMode('recovery'); return; }
                if (tsd.captured === 'true') { setMode('captured'); return; }
                commit(false, false, equipmentId);
              }}
              onSelectionComplete={() => {}}
              onCancel={() => setMode('main')}
              onValidityChange={setEffectSelectionValid}
            />
          }
          onClose={() => setMode('main')}
          // Never auto-close: onApplyToTarget owns the next mode.
          onConfirm={async () => { await effectSelectionRef.current?.handleConfirm(); return false; }}
          confirmText="Select Weapon"
          confirmDisabled={!effectSelectionValid}
          width="lg"
        />
      )}

      {mode === 'recovery' && (
        <Modal
          title="Send to Recovery?"
          onClose={() => setMode('main')}
          onConfirm={async () => { commit(true, false, pendingEquipmentId); return false; }}
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
          onConfirm={async () => { commit(false, true, pendingEquipmentId); return false; }}
          confirmText="Yes"
          confirmDisabled={addMut.isPending}
        >
          <p>This injury results in the fighter being captured. Mark as Captured?</p>
        </Modal>
      )}
    </>
  );
}
