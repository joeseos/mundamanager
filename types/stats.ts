import type { EditionSlug } from '@/types/edition';

export interface EditionCounts {
  total: number;
  byEdition: Partial<Record<EditionSlug, number>> | null;
}

export interface ActivityStats {
  last2Weeks: EditionCounts;
  last1Month: EditionCounts;
  last3Months: EditionCounts;
  last6Months: EditionCounts;
}
