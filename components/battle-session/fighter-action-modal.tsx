'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { LuTrash2 } from 'react-icons/lu';
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
import { InjuriesList } from '@/components/fighter/fighter-injury-list';
import { addSessionInjury, removeSessionInjury } from '@/app/actions/battle-sessions';
import type { GangFighter } from '@/types/gang';
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
  gangFighter,
  onXpChanged,
  onConditionsChanged,
  onInjuryAdded,
  onInjuryRemoved,
  onBroadcast,
  onClose,
}: {
  fighter: BattleSessionFighter;
  gangId: string;
  campaignId?: string | null;
  editionSlug?: string | null;
  candidateGangs: CampaignGangWithFighters[];
  gangFighter: GangFighter | undefined;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[], leftBattlefield?: boolean) => void;
  onInjuryAdded: (injury: SessionInjuryRecord) => void;
  onInjuryRemoved: (injuryId: string) => void;
  onBroadcast?: () => void;
  onClose: () => void;
}) {
  const [showXpModal, setShowXpModal] = useState(false);
  const [showInjuryModal, setShowInjuryModal] = useState(false);
  const [injuryToRemove, setInjuryToRemove] = useState<SessionInjuryRecord | null>(null);
  const sessionInjuries = fighter.session_record?.injuries ?? [];
  const isSpyrer = gangFighter?.is_spyrer ?? false;
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
              onClick={() => setShowXpModal(true)}
              variant="outline"
              className="flex-1"
              disabled={!gangFighter}
            >
              Add XP
            </Button>
            <Button
              onClick={() => setShowInjuryModal(true)}
              variant="outline"
              className="flex-1"
              disabled={!gangFighter}
            >
              {isSpyrer ? 'Add Rig Glitch' : 'Add Lasting Injury'}
            </Button>
          </div>
          {sessionInjuries.length > 0 && (
            <div className="space-y-2 border-t pt-3 text-left">
              <h4 className="text-sm font-medium text-neutral-500">
                {isSpyrer ? 'Rig Glitches This Battle' : 'Lasting Injuries This Battle'}
              </h4>
              <ul className="space-y-1">
                {sessionInjuries.map((injury) => (
                  <li key={injury.fighter_effect_id} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{injury.effect_name}</span>
                    <Button
                      variant="outline_remove"
                      size="sm"
                      className="text-xs px-1.5 h-6"
                      title="Remove"
                      onClick={() => setInjuryToRemove(injury)}
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {showXpModal && gangFighter && (
        <FighterXpModal
          fighterId={fighter.fighter_id}
          currentXp={gangFighter.xp}
          currentTotalXp={gangFighter.xp}
          currentKills={gangFighter.kills}
          currentKillCount={gangFighter.kill_count}
          gangId={gangId}
          campaignId={campaignId ?? undefined}
          targetGangIds={candidateGangs.map((g) => g.gang_id)}
          editionSlug={editionSlug}
          hideBattleParticipation
          onClose={() => setShowXpModal(false)}
          // Back to this modal rather than closing it, which would drop unsaved drafts.
          onXpUpdated={(newXp) => {
            const delta = newXp - gangFighter.xp;
            onXpChanged(delta);
            setShowXpModal(false);
          }}
        />
      )}

      {showInjuryModal && gangFighter && (
        <Modal
          title={isSpyrer ? 'Add Rig Glitches' : 'Add Lasting Injuries'}
          helper={gangFighter.fighter_name}
          onClose={() => setShowInjuryModal(false)}
          width="md"
        >
          <InjuriesList
            addFormOnly
            onRequestClose={() => setShowInjuryModal(false)}
            injuries={[
              ...(gangFighter.effects?.injuries ?? []),
              ...(gangFighter.effects?.['rig-glitches'] ?? []),
            ]}
            fighterId={fighter.fighter_id}
            fighterGangId={gangId}
            fighterCampaigns={campaignId ? [{ campaign_id: campaignId }] : []}
            candidateGangs={campaignId ? candidateGangs : []}
            fighterRecovery={gangFighter.recovery}
            fighterKilled={gangFighter.killed}
            fighterCaptured={gangFighter.captured}
            editionSlug={editionSlug}
            // This modal only opens for the gang's owner or the arbitrator.
            userPermissions={{ canEdit: true }}
            fighter_subtypes={gangFighter.fighter_subtypes}
            is_spyrer={isSpyrer}
            kill_count={gangFighter.kill_count ?? 0}
            skills={gangFighter.skills}
            fighterWeapons={gangFighter.weapons.map((w) => ({
              id: w.fighter_weapon_id,
              name: w.weapon_name,
              equipment_category: w.equipment_category,
              effect_names: w.effect_names,
            }))}
            onInjuryAdded={(injury, status) => {
              const sessionInjury: SessionInjuryRecord = {
                fighter_effect_id: injury.id,
                fighter_effect_type_id: injury.fighter_effect_type_id,
                effect_name: injury.effect_name,
                ...status,
              };
              addSessionInjury({ session_fighter_id: fighter.id, injury: sessionInjury })
                .then((result) => {
                  if (!result.success) throw new Error(result.error);
                  onInjuryAdded(sessionInjury);
                  onBroadcast?.();
                })
                .catch((err) =>
                  toast.error(err instanceof Error && err.message ? err.message : 'Failed to record the injury in this battle')
                );
            }}
          />
        </Modal>
      )}

      {injuryToRemove && (
        <Modal
          title={isSpyrer ? 'Remove Rig Glitch' : 'Remove Lasting Injury'}
          helper={gangFighter?.fighter_name}
          content={
            <div className="space-y-2">
              <p>
                Remove <strong>{injuryToRemove.effect_name}</strong>? It is deleted from the fighter and from this battle.
              </p>
              {(injuryToRemove.send_to_recovery || injuryToRemove.set_captured) && (
                <p className="text-sm text-muted-foreground">
                  The fighter stays {[injuryToRemove.send_to_recovery && 'in Recovery', injuryToRemove.set_captured && 'Captured'].filter(Boolean).join(' and ')}. Change that on the fighter page.
                </p>
              )}
            </div>
          }
          confirmText="Remove"
          onClose={() => setInjuryToRemove(null)}
          onConfirm={async () => {
            const result = await removeSessionInjury({
              session_fighter_id: fighter.id,
              injury_id: injuryToRemove.fighter_effect_id,
            });
            if (!result.success) {
              toast.error(result.error || 'Failed to remove the injury');
              return false;
            }
            onInjuryRemoved(injuryToRemove.fighter_effect_id);
            onBroadcast?.();
            toast.success(`${injuryToRemove.effect_name} removed`);
            return true;
          }}
        />
      )}
    </>
  );
}
