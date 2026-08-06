/**
 * Hatred (X) targets on lasting injuries.
 *
 * The kind an injury needs is declared on the effect TYPE as
 * `type_specific_data.hatred_target`; the pick is stored on the INSTANCE as
 * `hatred_target_*`. Nothing keys off injury names. Written only by
 * supabase/functions/add_fighter_injury.sql.
 *
 * Name and colour are snapshots from when the injury was added, deliberately
 * not kept in sync if the target is later renamed.
 */

import type { FighterEffect } from '@/types/fighter-effect';

/** Must match `fighter_effect_types.effect_name`; the N23 D66 tables key on it. */
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

/** The kind this injury TYPE requires (catalog row), or null if none. */
export function requiredHatredTarget(typeSpecificData: unknown): HatredTargetKind | null {
  const kind = asRecord(typeSpecificData)?.hatred_target;
  return isHatredTargetKind(kind) ? kind : null;
}

/**
 * The target recorded on an effect INSTANCE, or null if none was chosen.
 *
 * The `bitter_enmity_target_gang_*` fallback is permanent, not a migration
 * shim: the ~760 historical rows were deliberately not backfilled, so it is the
 * only thing keeping them rendering.
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

/** Link target, or null for gang types — they have no page of their own. */
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

/** `Bitter Enmity (Iron Lords)` for the gang card, print and fighter page. */
export function injuryAggregationLabel(injury: FighterEffect): string {
  const target = readHatredTarget(injury.type_specific_data);
  return target ? `${injury.effect_name} (${target.name})` : injury.effect_name;
}
