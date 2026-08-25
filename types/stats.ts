import type { EditionSlug } from '@/types/edition';

export interface EditionCounts {
  total: number | null;
  byEdition: Partial<Record<EditionSlug, number>> | null;
}

export interface ActivityStats {
  last2Weeks: EditionCounts | null;
  last1Month: EditionCounts | null;
  last3Months: EditionCounts | null;
  last6Months: EditionCounts | null;
}
