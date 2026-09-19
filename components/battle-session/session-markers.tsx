'use client';

import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { FaRadiation, FaWineBottle } from 'react-icons/fa';
import {
  BsCircle,
  BsDiamond,
  BsFillExclamationCircleFill,
  BsFire,
  BsHexagon,
  BsOctagon,
  BsTriangle,
} from 'react-icons/bs';
import {
  GiBrokenBone,
  GiEnrage,
  GiHealthNormal,
  GiHeavyBullets,
  GiIfrit,
  GiPieceSkull,
  GiSpiderWeb,
  GiSpill,
  GiStrong,
  GiWaterDrop,
} from 'react-icons/gi';
import { IoFlashOutline } from 'react-icons/io5';
import { IoMdEye, IoMdEyeOff } from 'react-icons/io';
import { PiArrowFatLinesDownFill } from 'react-icons/pi';
import { TbArrowBigUpFilled, TbSlash } from 'react-icons/tb';
import { WiStars } from 'react-icons/wi';
import { cn } from '@/app/lib/utils';
import type { SessionCondition } from '@/types/battle-session';
import { MarkerIcon } from '@/components/battle-session/marker-icon';
import {
  hasBlazeCondition,
  hasBrokenCondition,
  hasFearsomeCondition,
  hasFleshWoundCondition,
  hasFrenzyCondition,
  hasGunkedCondition,
  hasInjuredCondition,
  hasIntoxicatedCondition,
  hasN26CompositeBattleMarkers,
  hasRadPoisonedCondition,
  hasSeriouslyInjuredCondition,
  hasSuppressedCondition,
  hasTerrifyingCondition,
} from '@/types/edition';

export type SessionMarkerSection = 'status' | 'wounds' | 'conditions';
export type SessionMarkerKind = 'boolean' | 'numeric';

export type SessionMarkerName = string | { n23?: string; n26?: string };

export interface SessionMarkerN26 {
  shape: IconType;
  symbol: IconType | ReactNode;
  secondary?: IconType;
  overlay?: IconType;
  symbolClassName?: string;
  secondaryClassName?: string;
}

export interface SessionMarkerDef {
  key: string;
  name: SessionMarkerName;
  section: SessionMarkerSection;
  kind: SessionMarkerKind;
  colorClass: string;
  icon?: ReactNode;
  n26?: SessionMarkerN26;
  isAvailable: (editionSlug?: string | null) => boolean;
}

function OutOfAmmoSymbol({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <GiHeavyBullets />
      <TbSlash className="absolute inset-0 m-auto" />
    </span>
  );
}

function FleshWoundSymbol({
  className,
  dropClassName,
}: {
  className?: string;
  dropClassName?: string;
}) {
  const fillsBox = Boolean(className && /\bsize-full\b/.test(className));
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <GiHealthNormal className={fillsBox ? 'size-full' : undefined} />
      <GiWaterDrop
        className={cn(
          'absolute inset-0 m-auto text-red-800',
          dropClassName ?? (fillsBox ? 'size-[40%]' : 'size-2')
        )}
      />
    </span>
  );
}

/** Matches N23 fighter-row grey-circle badges (`size-7` / `size-10`). */
export const N26_MARKER_SIZE_CLASS = 'size-7 md:size-10';

/** Smaller glyphs beside labels in Fighter Actions. */
export const N26_MODAL_MARKER_SIZE_CLASS = 'size-7';

/** Compile-time N26 catalog completeness. Conditions are not a display order. */
export const N26_REQUIRED_KEYS = {
  status: ['suppressed', 'seriously_injured'],
  wounds: ['wounds'],
  conditions: [
    'injured',
    'insane',
    'webbed',
    'out_of_ammo',
    'concussion',
    'rad_poisoned',
    'fearsome',
    'frenzy',
    'intoxicated',
    'terrifying',
    'blind',
    'hidden',
    'revealed',
  ],
} as const;

export const SESSION_MARKERS = [
  {
    key: 'blaze',
    name: 'Blaze',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-orange-500',
    icon: <BsFire />,
    isAvailable: hasBlazeCondition,
  },
  {
    key: 'broken',
    name: 'Broken',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-red-700',
    icon: <BsFillExclamationCircleFill />,
    isAvailable: hasBrokenCondition,
  },
  {
    key: 'gunked',
    name: 'Gunked',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-slate-900',
    icon: <GiSpill />,
    isAvailable: hasGunkedCondition,
  },
  {
    key: 'flesh_wound',
    name: 'Flesh Wounds',
    section: 'wounds',
    kind: 'numeric',
    colorClass: 'text-neutral-400',
    icon: <FleshWoundSymbol className="align-[-3px]" />,
    isAvailable: hasFleshWoundCondition,
  },
  {
    key: 'suppressed',
    name: 'Suppressed',
    section: 'status',
    kind: 'boolean',
    colorClass: 'text-amber-600',
    n26: { shape: BsTriangle, symbol: PiArrowFatLinesDownFill },
    isAvailable: hasSuppressedCondition,
  },
  {
    key: 'seriously_injured',
    name: 'Seriously Injured',
    section: 'status',
    kind: 'boolean',
    colorClass: 'text-red-700',
    n26: { shape: BsTriangle, symbol: GiBrokenBone },
    isAvailable: hasSeriouslyInjuredCondition,
  },
  {
    key: 'wounds',
    name: 'Wounds',
    section: 'wounds',
    kind: 'numeric',
    colorClass: 'text-red-800',
    icon: <GiWaterDrop />,
    n26: { shape: BsDiamond, symbol: GiWaterDrop },
    isAvailable: () => true,
  },
  {
    key: 'injured',
    name: 'Injured / Damaged',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-neutral-400',
    n26: { shape: BsDiamond, symbol: FleshWoundSymbol },
    isAvailable: hasInjuredCondition,
  },
  {
    key: 'insane',
    name: { n23: 'Insane', n26: 'Insanity' },
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-purple-700',
    icon: <GiPieceSkull />,
    n26: { shape: BsDiamond, symbol: GiPieceSkull },
    isAvailable: () => true,
  },
  {
    key: 'webbed',
    name: 'Webbed',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-slate-400',
    icon: <GiSpiderWeb />,
    n26: { shape: BsHexagon, symbol: GiSpiderWeb },
    isAvailable: () => true,
  },
  {
    key: 'out_of_ammo',
    name: 'Out of Ammo',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-neutral-700',
    icon: <OutOfAmmoSymbol className="align-[-3px]" />,
    n26: { shape: BsHexagon, symbol: GiHeavyBullets, overlay: TbSlash },
    isAvailable: () => true,
  },
  {
    key: 'concussion',
    name: 'Concussion',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-amber-400',
    icon: <WiStars />,
    n26: { shape: BsOctagon, symbol: WiStars, symbolClassName: 'size-[90%]' },
    isAvailable: () => true,
  },
  {
    key: 'rad_poisoned',
    name: 'Rad-poisoned',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-lime-500',
    n26: { shape: BsOctagon, symbol: FaRadiation },
    isAvailable: hasRadPoisonedCondition,
  },
  {
    key: 'fearsome',
    name: 'Fearsome',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-rose-600',
    n26: { shape: BsOctagon, symbol: GiIfrit },
    isAvailable: hasFearsomeCondition,
  },
  {
    key: 'frenzy',
    name: 'Frenzy',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-orange-600',
    n26: { shape: BsOctagon, symbol: GiEnrage },
    isAvailable: hasFrenzyCondition,
  },
  {
    key: 'intoxicated',
    name: 'Intoxicated',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-emerald-500',
    icon: <FaWineBottle />,
    n26: { shape: BsOctagon, symbol: FaWineBottle },
    isAvailable: hasIntoxicatedCondition,
  },
  {
    key: 'terrifying',
    name: 'Terrifying',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-red-700',
    n26: {
      shape: BsOctagon,
      symbol: GiIfrit,
      secondary: TbArrowBigUpFilled,
      secondaryClassName: 'size-[44%] text-muted-foreground',
    },
    isAvailable: hasTerrifyingCondition,
  },
  {
    key: 'blind',
    name: 'Blind',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-neutral-400',
    icon: <IoFlashOutline />,
    n26: { shape: BsOctagon, symbol: IoFlashOutline },
    isAvailable: () => true,
  },
  {
    key: 'hidden',
    name: 'Hidden',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-red-700',
    icon: <IoMdEyeOff />,
    n26: { shape: BsOctagon, symbol: IoMdEyeOff },
    isAvailable: () => true,
  },
  {
    key: 'revealed',
    name: 'Revealed',
    section: 'conditions',
    kind: 'boolean',
    colorClass: 'text-neutral-400',
    icon: <IoMdEye />,
    n26: { shape: BsOctagon, symbol: IoMdEye },
    isAvailable: () => true,
  },
] as const satisfies readonly SessionMarkerDef[];

type SessionMarkerEntry = (typeof SESSION_MARKERS)[number];
type KeysIn<S extends keyof typeof N26_REQUIRED_KEYS> = Extract<
  SessionMarkerEntry,
  { section: S }
>['key'];
type AssertContains<Required extends readonly string[], Actual> =
  Required[number] extends Actual ? true : never;

const _assertN26Status: AssertContains<typeof N26_REQUIRED_KEYS.status, KeysIn<'status'>> = true;
const _assertN26Wounds: AssertContains<typeof N26_REQUIRED_KEYS.wounds, KeysIn<'wounds'>> = true;
const _assertN26Conditions: AssertContains<
  typeof N26_REQUIRED_KEYS.conditions,
  KeysIn<'conditions'>
> = true;

void _assertN26Status;
void _assertN26Wounds;
void _assertN26Conditions;

const N23_SECTION_ORDER = {
  status: [] as const,
  wounds: ['flesh_wound', 'wounds'],
} as const;

export const CONDITION_BY_KEY = new Map<string, SessionMarkerDef>(
  SESSION_MARKERS.map((marker) => [marker.key, marker])
);

export interface MarkersForEdition {
  status: SessionMarkerDef[];
  wounds: SessionMarkerDef[];
  conditions: SessionMarkerDef[];
}

export function markerName(
  def: Pick<SessionMarkerDef, 'name' | 'key'>,
  editionSlug?: string | null
): string {
  if (typeof def.name === 'string') return def.name;
  return hasN26CompositeBattleMarkers(editionSlug)
    ? (def.name.n26 ?? def.name.n23 ?? def.key)
    : (def.name.n23 ?? def.name.n26 ?? def.key);
}

function sortSection(
  markers: SessionMarkerDef[],
  order: readonly string[]
): SessionMarkerDef[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...markers].sort((a, b) => {
    const aRank = rank.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
}

export function markersForEdition(editionSlug?: string | null): MarkersForEdition {
  const grouped: MarkersForEdition = { status: [], wounds: [], conditions: [] };
  for (const marker of SESSION_MARKERS) {
    if (!marker.isAvailable(editionSlug)) continue;
    grouped[marker.section].push(marker);
  }
  const order = hasN26CompositeBattleMarkers(editionSlug) ? N26_REQUIRED_KEYS : N23_SECTION_ORDER;
  return {
    status: sortSection(grouped.status, order.status),
    wounds: sortSection(grouped.wounds, order.wounds),
    conditions: grouped.conditions,
  };
}

const FIGHTER_ROW_STATUS_KEYS = ['suppressed', 'seriously_injured'] as const;
const FIGHTER_ROW_WOUND_KEYS = ['wounds', 'flesh_wound'] as const;
const FIGHTER_ROW_INJURED_KEYS = ['injured'] as const;
const FIGHTER_ROW_VISIBILITY_KEYS = ['hidden', 'revealed'] as const;

/** Badge order on the fighter row: status, wounds, injured, other conditions A–Z, hidden/revealed. */
export function groupFighterRowConditionBadges(
  conditions: SessionCondition[],
  editionSlug?: string | null
): SessionCondition[][] {
  const pick = (keys: readonly string[]) =>
    keys
      .map((key) => conditions.find((condition) => condition.key === key))
      .filter((condition): condition is SessionCondition => condition != null);

  const reserved = new Set<string>([
    ...FIGHTER_ROW_STATUS_KEYS,
    ...FIGHTER_ROW_WOUND_KEYS,
    ...FIGHTER_ROW_INJURED_KEYS,
    ...FIGHTER_ROW_VISIBILITY_KEYS,
  ]);
  const others = conditions
    .filter((condition) => !reserved.has(condition.key))
    .sort((a, b) => {
      const defA = CONDITION_BY_KEY.get(a.key);
      const defB = CONDITION_BY_KEY.get(b.key);
      return markerName(defA ?? { name: a.name, key: a.key }, editionSlug).localeCompare(
        markerName(defB ?? { name: b.name, key: b.key }, editionSlug)
      );
    });

  return [
    pick(FIGHTER_ROW_STATUS_KEYS),
    pick(FIGHTER_ROW_WOUND_KEYS),
    pick(FIGHTER_ROW_INJURED_KEYS),
    others,
    pick(FIGHTER_ROW_VISIBILITY_KEYS),
  ].filter((group) => group.length > 0);
}

export function SessionMarkerGlyph({
  def,
  editionSlug,
  className,
  title,
  decorative = false,
}: {
  def: SessionMarkerDef;
  editionSlug?: string | null;
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  const label = title ?? markerName(def, editionSlug);
  if (hasN26CompositeBattleMarkers(editionSlug) && def.n26) {
    return (
      <MarkerIcon
        shape={def.n26.shape}
        symbol={def.n26.symbol}
        secondary={def.n26.secondary}
        overlay={def.n26.overlay}
        symbolClassName={def.n26.symbolClassName}
        secondaryClassName={def.n26.secondaryClassName}
        className={cn('size-full', className)}
        title={decorative ? undefined : label}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative || undefined}
      />
    );
  }
  return (
    <span
      className={className}
      title={decorative ? undefined : label}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      {def.icon}
    </span>
  );
}

export function ReadyActivatedIcon({
  className,
  title,
  onClick,
}: {
  className?: string;
  title?: string;
  onClick?: () => void;
}) {
  const label = title ?? 'Ready';
  const glyph = (
    <MarkerIcon shape={BsCircle} symbol={GiStrong} className="size-full" symbolClassName="h-[72%] w-[80%]" aria-hidden />
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          'inline-flex shrink-0 items-center justify-center appearance-none border-0 bg-transparent p-0 cursor-pointer',
          className,
        )}
        title={label}
        aria-label={label}
        onClick={onClick}
      >
        {glyph}
      </button>
    );
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      title={label}
      aria-label={label}
    >
      {glyph}
    </span>
  );
}
