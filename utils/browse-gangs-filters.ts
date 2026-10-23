import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';
import { isUuid } from '@/utils/uuid';

/** The Browse Gangs filters, as kept in the /gangs query string. */
export interface PublicGangFilters {
  edition: EditionSlug;
  userId: string | null;
  gangTypeId: string | null;
  subtypeId: string | null;
  minRating: number | null;
  maxRating: number | null;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// Ids are matched and cached in lower case, as Postgres prints them
const uuidParam = (value: string | string[] | undefined): string | null => {
  const id = firstParam(value);
  return isUuid(id) ? id.toLowerCase() : null;
};

/** A rating typed in the form or read from the URL; blank or non-numeric is no filter. */
export const parseRating = (value: string | undefined): number | null => {
  const rating = Number(value);
  return value?.trim() && Number.isFinite(rating) ? rating : null;
};

/** Filters from the /gangs query string; anything malformed is dropped. */
export function parsePublicGangFilters(searchParams: SearchParams): PublicGangFilters {
  const page = Number(firstParam(searchParams.page));

  return {
    edition: firstParam(searchParams.edition) === EDITION_N23 ? EDITION_N23 : EDITION_N26,
    userId: uuidParam(searchParams.user),
    gangTypeId: uuidParam(searchParams.type),
    subtypeId: uuidParam(searchParams.subtype),
    minRating: parseRating(firstParam(searchParams.minRating)),
    maxRating: parseRating(firstParam(searchParams.maxRating)),
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** The /gangs URL for these filters, read back by parsePublicGangFilters. */
export function browseGangsHref(filters: Omit<PublicGangFilters, 'page'>, page = 1): string {
  const params = new URLSearchParams({ edition: filters.edition });
  if (filters.userId) params.set('user', filters.userId);
  if (filters.gangTypeId) params.set('type', filters.gangTypeId);
  if (filters.subtypeId) params.set('subtype', filters.subtypeId);
  if (filters.minRating !== null) params.set('minRating', String(filters.minRating));
  if (filters.maxRating !== null) params.set('maxRating', String(filters.maxRating));
  if (page > 1) params.set('page', String(page));
  return `/gangs?${params}`;
}
