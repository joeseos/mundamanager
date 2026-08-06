/**
 * Hatred (X) targets on lasting injuries — reading them, labelling them, linking them.
 *
 * N26 grants Hatred against three different kinds of thing, so the target is
 * stored generically on the effect instance rather than one key family per
 * injury:
 *
 *   fighter_effects.type_specific_data = {
 *     hatred_target_kind:   'gang' | 'gang_type' | 'fighter',
 *     hatred_target_id:     '<uuid as text>',
 *     hatred_target_name:   'Iron Lords',
 *     hatred_target_colour: '#8b0000'   // gang only
 *   }
 *
 * Which kind an injury needs is declared on the effect TYPE as
 * `type_specific_data.hatred_target`, so neither the client nor the RPC keys off
 * injury names. See supabase/functions/add_fighter_injury.sql, the only writer
 * of the instance keys.
 *
 * The name and colour are denormalised snapshots taken when the injury was
 * added. Renaming the gang or fighter afterwards does NOT update them — an
 * accepted trade-off, so the injury still reads sensibly even if the target is
 * later renamed or deleted.
 */

import type { FighterEffect } from '@/types/fighter-effect';

/**
 * Must match `fighter_effect_types.effect_name` and the lasting-injury D66
 * tables for this injury. Lives here rather than beside the tables so renames
 * stay in one place; a DB migration must align with it.
 *
 * Only the N23 tables and rank map need it now — nothing branches on it to
 * decide whether an injury takes a target. That question is answered by
 * {@link requiredHatredTarget}.
 */
export const BITTER_ENMITY_EFFECT_NAME = 'Bitter Enmity' as const;

export type HatredTargetKind = 'gang' | 'gang_type' | 'fighter';

export interface HatredTarget {
  kind: HatredTargetKind;
  id: string;
  name: string;
  /** Gangs only. Null for gang types and fighters, which have no colour. */
  colour: string | null;
}

const HATRED_TARGET_KINDS: readonly HatredTargetKind[] = ['gang', 'gang_type', 'fighter'];

export function isHatredTargetKind(value: unknown): value is HatredTargetKind {
  return typeof value === 'string' && HATRED_TARGET_KINDS.includes(value as HatredTargetKind);
}

/** Non-empty string, or null. Stored colours are variously null or `''`. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asRecord(typeSpecificData: unknown): Record<string, unknown> | null {
  return typeSpecificData && typeof typeSpecificData === 'object'
    ? (typeSpecificData as Record<string, unknown>)
    : null;
}

/**
 * Which kind of target this injury TYPE requires, or null if it needs none.
 * Read from the effect type row (the catalog), not from an instance.
 */
export function requiredHatredTarget(typeSpecificData: unknown): HatredTargetKind | null {
  const kind = asRecord(typeSpecificData)?.hatred_target;
  return isHatredTargetKind(kind) ? kind : null;
}

/**
 * The target recorded on an effect INSTANCE, or null if none was chosen
 * (skirmish play, or the injury takes no target).
 *
 * Falls back to the pre-N26 `bitter_enmity_target_gang_*` keys. That fallback is
 * permanent, not a migration shim: the ~760 historical Bitter Enmity instances
 * were deliberately not backfilled, so this is the only thing keeping them
 * rendering. Nothing writes those keys any more.
 */
export function readHatredTarget(typeSpecificData: unknown): HatredTarget | null {
  const data = asRecord(typeSpecificData);
  if (!data) return null;

  const id = text(data.hatred_target_id);
  if (id) {
    const kind = data.hatred_target_kind;
    return {
      // Older rows could predate the kind key; a bare id has only ever meant a gang.
      kind: isHatredTargetKind(kind) ? kind : 'gang',
      id,
      name: text(data.hatred_target_name) ?? 'Unknown',
      colour: text(data.hatred_target_colour),
    };
  }

  const legacyId = text(data.bitter_enmity_target_gang_id);
  if (legacyId) {
    return {
      kind: 'gang',
      id: legacyId,
      name: text(data.bitter_enmity_target_gang_name) ?? 'Unknown',
      colour: text(data.bitter_enmity_target_gang_colour),
    };
  }

  return null;
}

/**
 * Where a target links to, or null when it isn't a linkable entity.
 * Gang types are catalog entries with no page of their own.
 */
export function hatredTargetHref(target: HatredTarget): string | null {
  switch (target.kind) {
    case 'gang':
      return `/gang/${target.id}`;
    case 'fighter':
      return `/fighter/${target.id}`;
    case 'gang_type':
      return null;
  }
}

/**
 * Label used when aggregating lasting injuries on the gang card, print and the
 * fighter page.
 *
 * Appends the recorded Hatred (X) target when there is one, so all the Enmity
 * injuries read as e.g. `Bitter Enmity (Iron Lords)`, `Eternal Enmity (Escher)`
 * or `Personal Enmity (Sly Marbo)`. Driven by the stored target rather than the
 * injury name, so a new Enmity injury needs no change here.
 *
 * The granted skill (e.g. Berserker) is shown separately on the fighter skills
 * list. Names are snapshots and may be stale — see the module comment.
 */
export function injuryAggregationLabel(injury: FighterEffect): string {
  const target = readHatredTarget(injury.type_specific_data);
  return target ? `${injury.effect_name} (${target.name})` : injury.effect_name;
}
