import type { DefaultImageCredit } from '@/types/gang';

export const GANG_PORTRAIT_STYLES = ['colour', 'black & white', 'ai-assisted'] as const;

const STYLE_RANK: Record<string, number> = {
  colour: 0,
  'black & white': 1,
  'ai-assisted': 2,
};

/** n23 gang type names whose catalogue section uses the n26 name. */
const CATALOGUE_GROUP_BY_GANG_TYPE: Record<string, string> = {
  'Helot Chaos Cults': 'Chaos Helots',
  'Ironhead Squat Prospectors': 'Ironhead Squats',
  'Underhive Outcasts': 'Outcasts',
  'Slave Ogryns': 'Free Ogryns',
  'Spyre Hunting Party': 'Spyre Hunters',
  'Malstrain Genestealers': 'The Malstrain',
};

export interface GangPortrait {
  id: string;
  storage_path: string;
  credit: DefaultImageCredit | null;
  group_label: string;
  style: string;
  label: string | null;
}

function portraitCredit(value: unknown): DefaultImageCredit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DefaultImageCredit;
}

export function toGangPortrait(row: {
  id: string;
  storage_path: string;
  credit: unknown;
  group_label: string;
  style: string;
  label: string | null;
}): GangPortrait {
  return {
    id: row.id,
    storage_path: row.storage_path,
    credit: portraitCredit(row.credit),
    group_label: row.group_label,
    style: row.style,
    label: row.label?.trim() ? row.label : null,
  };
}

export interface CatalogueSlot {
  groupLabel: string;
  label: string | null;
}

export function catalogueGroupLabel(gangTypeName: string): string {
  return CATALOGUE_GROUP_BY_GANG_TYPE[gangTypeName] ?? gangTypeName;
}

export function catalogueSlotForGangType(
  gangType: { gang_type: string; is_custom?: boolean; parent_gang_type_id?: string | null },
  parentGangTypeName: string | null
): CatalogueSlot | null {
  if (gangType.is_custom) return null;
  if (gangType.parent_gang_type_id) {
    if (!parentGangTypeName) return null;
    return {
      groupLabel: catalogueGroupLabel(parentGangTypeName),
      label: gangType.gang_type,
    };
  }
  return { groupLabel: catalogueGroupLabel(gangType.gang_type), label: null };
}

export function compareGangPortraits(a: GangPortrait, b: GangPortrait): number {
  const styleDiff = (STYLE_RANK[a.style] ?? 99) - (STYLE_RANK[b.style] ?? 99);
  if (styleDiff !== 0) return styleDiff;
  if (!a.label && b.label) return -1;
  if (a.label && !b.label) return 1;
  const labelDiff = (a.label ?? '').localeCompare(b.label ?? '', undefined, { sensitivity: 'base' });
  if (labelDiff !== 0) return labelDiff;
  return a.storage_path.localeCompare(b.storage_path);
}

/**
 * Portraits for one catalogue slot. When a variant has no rows of its own,
 * fall back to the parent section's unlabelled portraits.
 */
export function portraitsInSlot(
  portraits: GangPortrait[],
  slot: CatalogueSlot | null,
  fallbackToUnlabelled: boolean
): GangPortrait[] {
  if (!slot) return [];
  const exact = portraits.filter(
    (portrait) => portrait.group_label === slot.groupLabel && portrait.label === slot.label
  );
  const pool =
    exact.length > 0 || !fallbackToUnlabelled || slot.label === null
      ? exact
      : portraits.filter(
          (portrait) => portrait.group_label === slot.groupLabel && portrait.label === null
        );
  return [...pool].sort(compareGangPortraits);
}

export function defaultPortraitForSlot(
  portraits: GangPortrait[],
  slot: CatalogueSlot | null
): GangPortrait | null {
  return portraitsInSlot(portraits, slot, true)[0] ?? null;
}

export function alternativePortraits(
  portraits: GangPortrait[],
  selected: GangPortrait | null,
  gangSlot: CatalogueSlot | null
): GangPortrait[] {
  const slot = selected
    ? { groupLabel: selected.group_label, label: selected.label }
    : gangSlot;
  return portraitsInSlot(portraits, slot, selected == null)
    .filter((portrait) => portrait.id !== selected?.id)
    .slice(0, 2);
}

export function gallerySections(
  portraits: GangPortrait[],
  currentGroupLabel: string | null
): { groupLabel: string; portraits: GangPortrait[] }[] {
  const byGroup = new Map<string, GangPortrait[]>();
  for (const portrait of portraits) {
    const list = byGroup.get(portrait.group_label) ?? [];
    list.push(portrait);
    byGroup.set(portrait.group_label, list);
  }

  return [...byGroup.keys()]
    .sort((a, b) => {
      if (currentGroupLabel) {
        if (a === currentGroupLabel) return -1;
        if (b === currentGroupLabel) return 1;
      }
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    })
    .map((groupLabel) => ({
      groupLabel,
      portraits: [...(byGroup.get(groupLabel) ?? [])].sort(compareGangPortraits),
    }));
}

export function portraitCaption(portrait: GangPortrait): string {
  return [portrait.label, portrait.style].filter(Boolean).join(' · ');
}
