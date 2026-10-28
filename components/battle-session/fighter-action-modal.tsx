'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Counter } from '@/components/ui/counter';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Modal from '@/components/ui/modal';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import {
  markerSizeClass,
  SessionMarkerGlyph,
  markerName,
  markersForEdition,
  type SessionMarkerDef,
} from '@/components/battle-session/session-markers';
import InjuryPickerModal from '@/components/battle-session/injury-picker-modal';
import type { BattleSessionFighter, SessionCondition, SessionInjuryRecord } from '@/types/battle-session';
import { canLeaveBattlefield, hasFleshWoundCondition, hasN26CompositeBattleMarkers } from '@/types/edition';

const FighterXpModal = dynamic(
  () => import('@/components/fighter/fighter-xp-modal').then((mod) => mod.FighterXpModal),
  { ssr: false }
);

function MarkerToggleButton({
  condition,
  editionSlug,
  isActive,
  onToggle,
}: {
  condition: SessionMarkerDef;
  editionSlug?: string | null;
  isActive: boolean;
  onToggle: () => void;
}) {
  const name = markerName(condition, editionSlug);
  const useComposite = hasN26CompositeBattleMarkers(editionSlug);
  return (
    <Button
      onClick={onToggle}
      variant={isActive ? 'default' : 'outline'}
      className="min-w-[140px] flex-1 max-w-[calc(50%-0.25rem)] justify-start pl-2 text-left text-xs md:pl-6 md:text-sm"
    >
      <span className={`${condition.colorClass} mr-1.5 ${markerSizeClass(useComposite, 'text-xl')}`}>
        <SessionMarkerGlyph def={condition} editionSlug={editionSlug} decorative />
      </span>
      {name}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// FighterActionModal — XP, Lasting Injuries, Remove in one modal
// ---------------------------------------------------------------------------

export default function FighterActionModal({
  fighter,
  gangId,
  campaignId,
  editionSlug,
  candidateGangs,
  isSkirmish,
  isSpyrer,
  fighterWeapons,
  onXpChanged,
  onConditionsChanged,
  onInjuryAdded,
  onBroadcast,
  onClose,
}: {
  fighter: BattleSessionFighter;
  gangId: string;
  campaignId?: string | null;
  editionSlug?: string | null;
  candidateGangs: CampaignGangWithFighters[];
  isSkirmish: boolean;
  isSpyrer: boolean;
  fighterWeapons: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[], leftBattlefield?: boolean) => void;
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
  // Compared against the value the modal opened with, not the live prop, so a
  // realtime change made elsewhere while it is open isn't sent back reversed.
  const [initialLeftBattlefield] = useState(fighter.session_record?.left_battlefield === true);
  const [draftLeftBattlefield, setDraftLeftBattlefield] = useState(initialLeftBattlefield);

  // Conditions the edition doesn't use aren't offered. CONDITION_BY_KEY still
  // looks up a stored key from another edition. The glyph only falls back when
  // that definition has `icon`; N26-only markers stay label-only outside composite mode.
  const showFleshWounds = hasFleshWoundCondition(editionSlug);
  const useCompositeMarkers = hasN26CompositeBattleMarkers(editionSlug);
  const { status: statusMarkers, wounds: woundMarkers, conditions: conditionMarkers } =
    markersForEdition(editionSlug);
  const visibilityMarkerKeys = new Set(['hidden', 'revealed']);
  const injuredMarker = conditionMarkers.find((c) => c.key === 'injured');
  const mainConditionMarkers = conditionMarkers
    .filter((c) => !visibilityMarkerKeys.has(c.key) && c.key !== 'injured')
    .sort((a, b) => markerName(a, editionSlug).localeCompare(markerName(b, editionSlug)));
  const visibilityMarkers = conditionMarkers.filter((c) => visibilityMarkerKeys.has(c.key));

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

  const toggleCondition = (condition: SessionMarkerDef) => {
    const exists = draftConditions.some((item) => item.key === condition.key);
    const name = markerName(condition, editionSlug);
    if (exists) {
      setDraftConditions(draftConditions.filter((item) => item.key !== condition.key));
    } else {
      const excludeKey = EXCLUSIVE_PAIRS[condition.key];
      setDraftConditions([
        ...draftConditions.filter((item) => item.key !== excludeKey),
        { key: condition.key, name },
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
  const hasLeftBattlefieldChange = draftLeftBattlefield !== initialLeftBattlefield;

  return (
    <>
      <Modal
        title="Fighter Actions"
        onClose={onClose}
        onConfirm={async () => {
          onConditionsChanged(draftConditions, hasLeftBattlefieldChange ? draftLeftBattlefield : undefined);
          return true;
        }}
        confirmText="Confirm"
        confirmDisabled={!hasConditionChanges && !hasLeftBattlefieldChange}
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
              {isSpyrer ? 'Add Rig Glitch' : 'Add Lasting Injury'}
            </Button>
          </div>
          {useCompositeMarkers && statusMarkers.length > 0 && (
            <div className="space-y-2 border-t pt-3 text-left">
              <h4 className="text-sm font-medium text-neutral-500">Status</h4>
              <div className="flex flex-wrap gap-2">
                {statusMarkers.map((condition) => (
                  <MarkerToggleButton
                    key={condition.key}
                    condition={condition}
                    editionSlug={editionSlug}
                    isActive={draftConditions.some((c) => c.key === condition.key)}
                    onToggle={() => toggleCondition(condition)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2 border-t pt-3 text-left">
            <h4 className="text-sm font-medium text-neutral-500">
              {useCompositeMarkers
                ? 'Wounds'
                : showFleshWounds
                  ? 'Wounds & Flesh Wounds'
                  : 'Wounds'}
            </h4>
            <div className="flex flex-col gap-2">
              {woundMarkers.map((nc) => {
                const current = draftConditions.find((c) => c.key === nc.key)?.value ?? 0;
                const name = markerName(nc, editionSlug);
                return (
                  <div key={nc.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`${nc.colorClass} ${markerSizeClass(useCompositeMarkers, 'text-2xl')}`}>
                        <SessionMarkerGlyph def={nc} editionSlug={editionSlug} decorative />
                      </span>
                      <span className="text-sm">{name}</span>
                    </div>
                    <Counter
                      value={current}
                      min={0}
                      onDecrement={() => adjustNumericCondition(nc.key, name, -1)}
                      onIncrement={() => adjustNumericCondition(nc.key, name, 1)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-2 border-t pt-3 text-left">
            <h4 className="text-sm font-medium text-neutral-500">Conditions</h4>
            {injuredMarker && (
              <div className="flex flex-wrap gap-2 border-b pb-2">
                <MarkerToggleButton
                  condition={injuredMarker}
                  editionSlug={editionSlug}
                  isActive={draftConditions.some((c) => c.key === injuredMarker.key)}
                  onToggle={() => toggleCondition(injuredMarker)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {mainConditionMarkers.map((condition) => (
                <MarkerToggleButton
                  key={condition.key}
                  condition={condition}
                  editionSlug={editionSlug}
                  isActive={draftConditions.some((c) => c.key === condition.key)}
                  onToggle={() => toggleCondition(condition)}
                />
              ))}
            </div>
            {visibilityMarkers.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t pt-2">
                {visibilityMarkers.map((condition) => (
                  <MarkerToggleButton
                    key={condition.key}
                    condition={condition}
                    editionSlug={editionSlug}
                    isActive={draftConditions.some((c) => c.key === condition.key)}
                    onToggle={() => toggleCondition(condition)}
                  />
                ))}
              </div>
            )}
          </div>
          {canLeaveBattlefield(editionSlug) && (
            <div className="space-y-2 border-t pt-3 text-left">
              <h4 className="text-sm font-medium text-neutral-500">Removed from Play</h4>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`left-battlefield-${fighter.id}`}
                  checked={draftLeftBattlefield}
                  onCheckedChange={(checked) => setDraftLeftBattlefield(checked === true)}
                />
                <Label htmlFor={`left-battlefield-${fighter.id}`} className="text-sm">
                  Left the Battlefield
                </Label>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {showXpModal && fighterData && (
        <FighterXpModal
          fighterId={fighter.fighter_id}
          currentXp={fighterData.xp}
          currentTotalXp={fighterData.xp}
          currentKills={fighterData.kills}
          currentKillCount={fighterData.kill_count}
          gangId={gangId}
          campaignId={campaignId ?? undefined}
          targetGangIds={candidateGangs.map((g) => g.gang_id)}
          editionSlug={editionSlug}
          hideBattleParticipation
          onClose={() => setShowXpModal(false)}
          // Back to this modal rather than closing it, which would drop unsaved drafts.
          onXpUpdated={(newXp) => {
            const delta = newXp - (fighterData?.xp ?? 0);
            onXpChanged(delta);
            setShowXpModal(false);
          }}
        />
      )}

      {showInjuryModal && (
        <InjuryPickerModal
          fighter={fighter}
          editionSlug={editionSlug}
          candidateGangs={candidateGangs}
          isSkirmish={isSkirmish}
          isSpyrer={isSpyrer}
          fighterWeapons={fighterWeapons}
          onClose={() => setShowInjuryModal(false)}
          onInjuryAdded={onInjuryAdded}
          onBroadcast={onBroadcast}
        />
      )}
    </>
  );
}
