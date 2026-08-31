export interface GangOrigin {
  id: string;
  origin_name: string;
  category_name: string;
}

export interface GangOriginCategory {
  id: string;
  category_name: string;
}

export interface GangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
  note?: string;
  edition_id?: string | null;
  gang_origin_category_id?: string;
  available_origins?: GangOrigin[];
}

export interface Equipment {
  id: string;
  equipment_name: string;
  equipment_category: string;
}

export interface StashItem {
  id: string;
  cost: number;
  type: 'vehicle' | 'equipment';
  vehicle_id?: string;
  vehicle_name?: string;
  equipment_name?: string;
  equipment_type?: 'weapon' | 'wargear' | 'vehicle_upgrade' | 'vehicle_wargear' | 'ammo';
  equipment_category?: string;
  equipment_id?: string;
  custom_equipment_id?: string;
  cost_resource?: { name: string; amount: number } | null;
}

export interface DefaultImageCredit {
  name: string;
  url: string;
  suffix?: string;
}

export interface DefaultImageEntry {
  url: string;
  credit?: DefaultImageCredit;
}

/**
 * Normalises raw default_image_urls from Supabase.
 * Handles both the legacy string[] format and the new object[] format,
 * so the app works before and after the data migration.
 */
export function normaliseDefaultImageUrls(
  raw: unknown[] | null | undefined
): DefaultImageEntry[] | undefined {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      return { url: entry };
    }
    return entry as DefaultImageEntry;
  });
}

/** Shown when a gang portrait URL fails to load. */
export const UNKNOWN_GANG_IMAGE_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/unknown_gang_cropped_web.webp';

/**
 * Custom upload, then the selected type default. Empty or missing `.url`
 * entries fall through so the caller can show a letter placeholder.
 */
export function resolveGangImageUrl(options: {
  imageUrl?: string | null;
  defaultGangImage?: number | null;
  defaultImageUrls?: DefaultImageEntry[] | null;
}): string | undefined {
  const { imageUrl, defaultGangImage, defaultImageUrls } = options;
  if (imageUrl) return imageUrl;

  if (
    defaultGangImage !== null &&
    defaultGangImage !== undefined &&
    Array.isArray(defaultImageUrls) &&
    defaultGangImage >= 0 &&
    defaultGangImage < defaultImageUrls.length
  ) {
    const url = defaultImageUrls[defaultGangImage]?.url;
    if (url) return url;
  }

  return undefined;
}

export interface ResourceUpdate {
  resource_id: string;
  resource_name?: string;  // Optional - can be looked up
  is_custom: boolean;
  quantity_delta: number;
  reason?: string;
}
