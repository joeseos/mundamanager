import type { DefaultImageCredit } from '@/types/gang';

export const CAMPAIGN_PORTRAIT_STYLES = ['colour', 'black & white', 'ai-assisted'] as const;

const STYLE_RANK: Record<string, number> = {
  colour: 0,
  'black & white': 1,
  'ai-assisted': 2,
};

export interface CampaignPortrait {
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

export function toCampaignPortrait(row: {
  id: string;
  storage_path: string;
  credit: unknown;
  group_label: string;
  style: string;
  label: string | null;
}): CampaignPortrait {
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

/** Gallery section for a campaign type. Types have no parent or variant aliases. */
export function catalogueSlotForCampaignType(
  campaignTypeName: string | null | undefined
): CatalogueSlot | null {
  const name = campaignTypeName?.trim();
  if (!name) return null;
  return { groupLabel: name, label: null };
}

export function compareCampaignPortraits(a: CampaignPortrait, b: CampaignPortrait): number {
  const styleDiff = (STYLE_RANK[a.style] ?? 99) - (STYLE_RANK[b.style] ?? 99);
  if (styleDiff !== 0) return styleDiff;
  if (!a.label && b.label) return -1;
  if (a.label && !b.label) return 1;
  const labelDiff = (a.label ?? '').localeCompare(b.label ?? '', undefined, { sensitivity: 'base' });
  if (labelDiff !== 0) return labelDiff;
  return a.storage_path.localeCompare(b.storage_path);
}

/**
 * Portraits for one catalogue slot. When a labelled slot has no rows of its own,
 * fall back to the section's unlabelled portraits.
 */
export function portraitsInSlot(
  portraits: CampaignPortrait[],
  slot: CatalogueSlot | null,
  fallbackToUnlabelled: boolean
): CampaignPortrait[] {
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
  return [...pool].sort(compareCampaignPortraits);
}

export function defaultPortraitForSlot(
  portraits: CampaignPortrait[],
  slot: CatalogueSlot | null
): CampaignPortrait | null {
  return portraitsInSlot(portraits, slot, true)[0] ?? null;
}

export function alternativePortraits(
  portraits: CampaignPortrait[],
  selected: CampaignPortrait | null,
  campaignSlot: CatalogueSlot | null
): CampaignPortrait[] {
  const slot = selected
    ? { groupLabel: selected.group_label, label: selected.label }
    : campaignSlot;
  return portraitsInSlot(portraits, slot, selected == null)
    .filter((portrait) => portrait.id !== selected?.id)
    .slice(0, 2);
}

export function gallerySections(
  portraits: CampaignPortrait[],
  currentGroupLabel: string | null
): { groupLabel: string; portraits: CampaignPortrait[] }[] {
  const byGroup = new Map<string, CampaignPortrait[]>();
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
      portraits: [...(byGroup.get(groupLabel) ?? [])].sort(compareCampaignPortraits),
    }));
}

export function portraitCaption(portrait: CampaignPortrait): string {
  return [portrait.label, portrait.style].filter(Boolean).join(' · ');
}
