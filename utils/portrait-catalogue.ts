import type { DefaultImageCredit } from '@/types/gang';
import { isValidHttpUrl } from '@/utils/http-url';
import { isUuid } from '@/utils/uuid';

export const PORTRAIT_STYLES = ['colour', 'black & white', 'ai-assisted'] as const;

const STYLE_RANK: Record<string, number> = {
  colour: 0,
  'black & white': 1,
  'ai-assisted': 2,
};

export const PORTRAIT_COGWHEEL_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp';

const PUBLIC_STORAGE_BASE =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/';

export const PORTRAIT_CATALOGUES = {
  gang: {
    table: 'gang_portraits',
    bucket: 'gang-type-images',
    publicBase: `${PUBLIC_STORAGE_BASE}gang-type-images/`,
    queryKey: 'gang-portraits',
    adminQueryKey: 'admin-gang-portraits',
    requiresCampaignType: false,
  },
  campaign: {
    table: 'campaign_portraits',
    bucket: 'campaign-type-images',
    publicBase: `${PUBLIC_STORAGE_BASE}campaign-type-images/`,
    queryKey: 'campaign-portraits',
    adminQueryKey: 'admin-campaign-portraits',
    requiresCampaignType: true,
  },
} as const;

export type PortraitCatalogueKey = keyof typeof PORTRAIT_CATALOGUES;

export function isPortraitCatalogueKey(value: string): value is PortraitCatalogueKey {
  return value === 'gang' || value === 'campaign';
}

export interface Portrait {
  id: string;
  storage_path: string;
  credit: DefaultImageCredit | null;
  group_label: string;
  style: string;
  label: string | null;
  campaign_type_id?: string | null;
}

export interface CatalogueSlot {
  groupLabel: string;
  label: string | null;
  /** Campaigns match on this id so two types with the same name stay apart. */
  campaignTypeId?: string;
}

function portraitCredit(value: unknown): DefaultImageCredit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DefaultImageCredit;
}

export function portraitPublicUrl(
  publicBase: string,
  storagePath: string | null | undefined
): string | undefined {
  const path = storagePath?.replace(/^\/+/, '');
  if (!path) return undefined;
  return `${publicBase}${path}`;
}

export function toPortrait(row: {
  id: string;
  storage_path: string;
  credit: unknown;
  group_label: string;
  style: string;
  label: string | null;
  campaign_type_id?: string | null;
}): Portrait {
  return {
    id: row.id,
    storage_path: row.storage_path,
    credit: portraitCredit(row.credit),
    group_label: row.group_label,
    style: row.style,
    label: row.label?.trim() ? row.label : null,
    campaign_type_id: row.campaign_type_id ?? null,
  };
}

export function joinedCampaignTypeName(
  joined: { campaign_type_name?: string | null } | { campaign_type_name?: string | null }[] | null | undefined
): string | null {
  const row = Array.isArray(joined) ? joined[0] : joined;
  const name = row?.campaign_type_name?.trim();
  return name || null;
}

/** Campaign rows have no stored section name. The live type name comes from the join. */
export function toCampaignPortrait(row: {
  id: string;
  storage_path: string;
  credit: unknown;
  style: string;
  campaign_type_id: string;
  campaign_types?: { campaign_type_name?: string | null } | { campaign_type_name?: string | null }[] | null;
}): Portrait {
  return toPortrait({
    id: row.id,
    storage_path: row.storage_path,
    credit: row.credit,
    group_label: joinedCampaignTypeName(row.campaign_types) ?? 'Campaign',
    style: row.style,
    label: null,
    campaign_type_id: row.campaign_type_id,
  });
}

export function comparePortraits(a: Portrait, b: Portrait): number {
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
function sameCatalogueGroup(portrait: Portrait, slot: CatalogueSlot): boolean {
  if (slot.campaignTypeId) return portrait.campaign_type_id === slot.campaignTypeId;
  return portrait.group_label === slot.groupLabel;
}

export function portraitsInSlot(
  portraits: Portrait[],
  slot: CatalogueSlot | null,
  fallbackToUnlabelled: boolean
): Portrait[] {
  if (!slot) return [];
  const exact = portraits.filter(
    (portrait) => sameCatalogueGroup(portrait, slot) && portrait.label === slot.label
  );
  const pool =
    exact.length > 0 || !fallbackToUnlabelled || slot.label === null
      ? exact
      : portraits.filter(
          (portrait) => sameCatalogueGroup(portrait, slot) && portrait.label === null
        );
  return [...pool].sort(comparePortraits);
}

export function defaultPortraitForSlot(
  portraits: Portrait[],
  slot: CatalogueSlot | null
): Portrait | null {
  return portraitsInSlot(portraits, slot, true)[0] ?? null;
}

export function alternativePortraits(
  portraits: Portrait[],
  selected: Portrait | null,
  catalogueSlot: CatalogueSlot | null
): Portrait[] {
  const slot: CatalogueSlot | null = selected
    ? {
        groupLabel: selected.group_label,
        label: selected.label,
        ...(selected.campaign_type_id ? { campaignTypeId: selected.campaign_type_id } : {}),
      }
    : catalogueSlot;
  return portraitsInSlot(portraits, slot, selected == null)
    .filter((portrait) => portrait.id !== selected?.id)
    .slice(0, 2);
}

export function gallerySections(
  portraits: Portrait[],
  currentSectionKey: string | null
): { key: string; groupLabel: string; portraits: Portrait[] }[] {
  const byGroup = new Map<string, { groupLabel: string; portraits: Portrait[] }>();
  for (const portrait of portraits) {
    const key = portrait.campaign_type_id || portrait.group_label;
    const groupLabel = portrait.group_label.trim() || 'Campaign';
    const section = byGroup.get(key);
    if (section) {
      section.portraits.push(portrait);
    } else {
      byGroup.set(key, { groupLabel, portraits: [portrait] });
    }
  }

  return [...byGroup.entries()]
    .sort(([keyA, sectionA], [keyB, sectionB]) => {
      if (currentSectionKey) {
        if (keyA === currentSectionKey) return -1;
        if (keyB === currentSectionKey) return 1;
      }
      return sectionA.groupLabel.localeCompare(sectionB.groupLabel, undefined, { sensitivity: 'base' });
    })
    .map(([key, section]) => ({
      key,
      groupLabel: section.groupLabel,
      portraits: [...section.portraits].sort(comparePortraits),
    }));
}

export function portraitCaption(portrait: Portrait): string {
  return [portrait.label, portrait.style].filter(Boolean).join(' · ');
}

type PortraitCredit = { name: string; url?: string; suffix?: string };

export type GangPortraitWrite = {
  storage_path: string;
  group_label: string;
  style: string;
  label: string | null;
  credit: PortraitCredit;
};

export type CampaignPortraitWrite = {
  storage_path: string;
  style: string;
  credit: PortraitCredit;
  campaign_type_id: string;
};

export type PortraitWrite = GangPortraitWrite | CampaignPortraitWrite;

const PORTRAIT_STYLE_SET = new Set<string>(PORTRAIT_STYLES);

function trimmedText(value: unknown, field: string, max: number): { error: string } | { data: string } {
  if (typeof value !== 'string') return { error: `${field} is required` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required` };
  if (trimmed.length > max) return { error: `${field} must be ${max} characters or less` };
  return { data: trimmed };
}

function optionalText(value: unknown, field: string, max: number): { error: string } | { data: string | null } {
  if (value === undefined || value === null) return { data: null };
  if (typeof value !== 'string') return { error: `${field} must be text` };
  const trimmed = value.trim();
  if (!trimmed) return { data: null };
  if (trimmed.length > max) return { error: `${field} must be ${max} characters or less` };
  return { data: trimmed };
}

function isSafeStoragePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.length > 1024) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return false;
  if (/\s/.test(path)) return false;
  return true;
}

export function validatePortraitWrite(
  body: {
    storage_path?: unknown;
    group_label?: unknown;
    style?: unknown;
    label?: unknown;
    credit_name?: unknown;
    credit_url?: unknown;
    credit_suffix?: unknown;
    campaign_type_id?: unknown;
  },
  options: { requireCampaignTypeId: true }
): { error: string } | { data: CampaignPortraitWrite };
export function validatePortraitWrite(
  body: {
    storage_path?: unknown;
    group_label?: unknown;
    style?: unknown;
    label?: unknown;
    credit_name?: unknown;
    credit_url?: unknown;
    credit_suffix?: unknown;
    campaign_type_id?: unknown;
  },
  options: { requireCampaignTypeId: false }
): { error: string } | { data: GangPortraitWrite };
export function validatePortraitWrite(
  body: {
    storage_path?: unknown;
    group_label?: unknown;
    style?: unknown;
    label?: unknown;
    credit_name?: unknown;
    credit_url?: unknown;
    credit_suffix?: unknown;
    campaign_type_id?: unknown;
  },
  options: { requireCampaignTypeId: boolean }
): { error: string } | { data: PortraitWrite } {
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!isSafeStoragePath(storagePath)) {
    return { error: 'storage_path must be a non-empty path without a leading slash' };
  }

  const style = typeof body.style === 'string' ? body.style.trim() : '';
  if (!PORTRAIT_STYLE_SET.has(style)) {
    return { error: 'style must be colour, black & white, or ai-assisted' };
  }

  const label = optionalText(body.label, 'label', 200);
  if ('error' in label) return label;

  const creditName = trimmedText(body.credit_name, 'credit_name', 200);
  if ('error' in creditName) return creditName;

  const creditUrl = optionalText(body.credit_url, 'credit_url', 2000);
  if ('error' in creditUrl) return creditUrl;
  if (creditUrl.data && !isValidHttpUrl(creditUrl.data)) {
    return { error: 'credit_url must be an http or https URL' };
  }

  const creditSuffix = optionalText(body.credit_suffix, 'credit_suffix', 200);
  if ('error' in creditSuffix) return creditSuffix;

  const credit: PortraitCredit = { name: creditName.data };
  if (creditUrl.data) credit.url = creditUrl.data;
  if (creditSuffix.data) credit.suffix = creditSuffix.data;

  if (options.requireCampaignTypeId) {
    if (!isUuid(body.campaign_type_id)) {
      return { error: 'campaign_type_id is required' };
    }
    return {
      data: {
        storage_path: storagePath,
        style,
        credit,
        campaign_type_id: body.campaign_type_id,
      },
    };
  }

  const groupLabel = trimmedText(body.group_label, 'group_label', 200);
  if ('error' in groupLabel) return groupLabel;

  return {
    data: {
      storage_path: storagePath,
      group_label: groupLabel.data,
      style,
      label: label.data,
      credit,
    },
  };
}
