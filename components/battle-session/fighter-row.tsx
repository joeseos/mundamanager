'use client';

import { useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import type { GangFighter } from '@/types/gang';
import Modal from '@/components/ui/modal';
import { LuClipboard } from 'react-icons/lu';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import { CgMoreVerticalO } from 'react-icons/cg';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { TbMeatOff } from 'react-icons/tb';
import { FaRegAddressCard, FaMedkit } from 'react-icons/fa';
import {
  CONDITION_BY_KEY,
  N26_MARKER_SIZE_CLASS,
  markerSizeClass,
  ReadyActivatedIcon,
  SessionMarkerGlyph,
  groupFighterRowConditionBadges,
  markerName,
} from '@/components/battle-session/session-markers';
import FighterActionModal from '@/components/battle-session/fighter-action-modal';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import FighterCard from '@/components/gang/fighter-card';
import type { BattleSessionFighter, SessionCondition, SessionInjuryRecord } from '@/types/battle-session';
import { hasN26CompositeBattleMarkers } from '@/types/edition';

function ConditionBadge({
  condition,
  iconOnly = false,
  editionSlug,
}: {
  condition: SessionCondition;
  iconOnly?: boolean;
  editionSlug?: string | null;
}) {
  const config = CONDITION_BY_KEY.get(condition.key);
  const displayName = config ? markerName(config, editionSlug) : condition.name;
  const conditionLabel = condition.value != null && condition.value > 0
    ? `${condition.value} ${displayName}`
    : displayName;
  if (!config) {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-1 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {condition.name}
      </span>
    );
  }

  const useComposite = hasN26CompositeBattleMarkers(editionSlug) && Boolean(config.n26);

  if (iconOnly) {
    return (
      <span
        className={
          useComposite
            ? `relative inline-flex ${N26_MARKER_SIZE_CLASS} shrink-0 items-center justify-center`
            : 'relative inline-flex size-7 md:size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
        }
        title={conditionLabel}
        aria-label={conditionLabel}
      >
        <span className={`${config.colorClass} ${markerSizeClass(useComposite, 'text-xl md:text-2xl', 'size-full')}`}>
          <SessionMarkerGlyph def={config} editionSlug={editionSlug} decorative />
        </span>
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
      <span className={`${config.colorClass} text-base`}>
        <SessionMarkerGlyph def={config} editionSlug={editionSlug} decorative />
      </span>
      {conditionLabel}
    </span>
  );
}

function FighterRowConditionBadges({
  conditions,
  editionSlug,
}: {
  conditions: SessionCondition[];
  editionSlug?: string | null;
}) {
  return groupFighterRowConditionBadges(conditions, editionSlug).map((group, index) => (
    <Fragment key={group.map((condition) => condition.key).join('-')}>
      {index > 0 && (
        <span className="px-0.5 text-muted-foreground" aria-hidden>
          ∙
        </span>
      )}
      {group.map((condition) => (
        <ConditionBadge key={condition.key} condition={condition} iconOnly editionSlug={editionSlug} />
      ))}
    </Fragment>
  ));
}

// ---------------------------------------------------------------------------
// FighterRow — table row with optional action modal
// ---------------------------------------------------------------------------

export default function FighterRow({
  fighter,
  name,
  loadoutName,
  cost,
  xp,
  participationXp,
  injuryCount,
  canInteract,
  battleActive,
  hasTwoActivations,
  gangFighter,
  gangId,
  campaignId,
  editionSlug,
  candidateGangs,
  isSkirmish,
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
  /** Shown in its own column when set (post-battle). */
  participationXp?: number;
  injuryCount: number;
  canInteract: boolean;
  battleActive: boolean;
  hasTwoActivations: boolean;
  gangFighter: GangFighter | undefined;
  gangId: string;
  campaignId?: string | null;
  editionSlug?: string | null;
  candidateGangs: CampaignGangWithFighters[];
  isSkirmish: boolean;
  onXpChanged: (delta: number) => void;
  onConditionsChanged: (conditions: SessionCondition[], leftBattlefield?: boolean) => void;
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
  // Not hasTwoActivations — that's a special-rules flag some non-Spyrers carry.
  const isSpyrer = gangFighter?.is_spyrer ?? false;
  const injuryCountLabel = isSpyrer
    ? `${injuryCount} ${injuryCount === 1 ? 'Glitch' : 'Glitches'}`
    : `${injuryCount} ${injuryCount === 1 ? 'Injury' : 'Injuries'}`;
  const leftBattlefield = fighter.session_record?.left_battlefield === true;
  const activations = fighter.session_record?.activations ?? 1;
  const isReady = activations > 0;
  const maxActivations = hasTwoActivations ? 2 : 1;

  const toggleReady = () => {
    const next = activations > 0 ? activations - 1 : maxActivations;
    onActivationsChange(next);
  };

  const iconColor = activations >= 2 ? 'text-orange-500' : activations === 1 ? 'text-green-500' : 'text-muted-foreground/30';
  const readyTitle = leftBattlefield
    ? 'Left the battlefield'
    : activations > 0 ? `${activations} activation${activations !== 1 ? 's' : ''} remaining` : 'Activated';
  const fighterType = gangFighter?.fighter_type;
  const fighterSubtypeDisplay = formatFighterSubtypeDisplay(gangFighter?.fighter_subtypes, editionSlug);
  // Second row format: type (subtype)
  const fighterDetails = [
    fighterType,
    fighterSubtypeDisplay ? `(${fighterSubtypeDisplay})` : '',
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
            {(xp > 0 || injuryCount > 0 || conditions.length > 0 || leftBattlefield || (!canInteract && !battleActive && injuries.length > 0)) && (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {leftBattlefield && (
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    Left Battlefield
                  </span>
                )}
                {xp > 0 && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    +{xp} XP
                  </span>
                )}
                {canInteract || battleActive ? (
                  <>
                    {injuryCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        {injuryCountLabel}
                      </span>
                    )}
                    <FighterRowConditionBadges conditions={conditions} editionSlug={editionSlug} />
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
                    <FighterRowConditionBadges conditions={conditions} editionSlug={editionSlug} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
      {participationXp !== undefined && (
        <td className={`p-1 md:p-2 text-right whitespace-nowrap align-top ${participationXp === 0 ? 'text-muted-foreground' : ''}`}>
          {participationXp}
        </td>
      )}
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
            <ReadyActivatedIcon
              className={`size-6 ${iconColor} ${leftBattlefield ? '' : 'transition-colors duration-200 cursor-pointer hover:text-muted-foreground'}`}
              title={readyTitle}
              onClick={leftBattlefield ? undefined : toggleReady}
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
              editionSlug={editionSlug}
              candidateGangs={candidateGangs}
              isSkirmish={isSkirmish}
              isSpyrer={isSpyrer}
              fighterWeapons={(gangFighter?.weapons ?? []).map((w) => ({
                id: w.fighter_weapon_id,
                name: w.weapon_name,
                equipment_category: w.equipment_category,
                effect_names: w.effect_names,
              }))}
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
              <ReadyActivatedIcon
                className={`size-6 ${iconColor}`}
                title={readyTitle}
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
