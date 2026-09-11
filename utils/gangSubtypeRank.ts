import type { EditionSlug } from '@/types/edition';

// Ranks 1-9 are the "Unaffiliated" column, 10+ the "Outlaw / Corrupted" one; anything unranked is
// hidden from both, which is how Outlaw stays out despite the gangs holding it.
const gangSubtypeRankN23: { [key: string]: number } = {
  "aranthian-aligned": 1,
  "crusading": 2,
  "secundan incursion": 3,
  "wasteland": 4,
  "skirmish": 5,
  //
  //"outlaw": 11,
  "chaos corrupted": 12,
  "genestealer infected": 13,
  "malstrain corrupted": 14,
};

// N26 renamed Genestealer Infected to Genestealer Corrupted, which is why these cannot share one
// map with N23.
const gangSubtypeRankN26: { [key: string]: number } = {
  "chaos corrupted": 12,
  "genestealer corrupted": 13,
  "malstrain corrupted": 14,
};

// Keyed by EditionSlug so a new edition is a compile error until it states its own order.
const GANG_SUBTYPE_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: gangSubtypeRankN23,
  n26: gangSubtypeRankN26,
};

/** Unset or unrecognised slug gets no ranking rather than another edition's order. */
export function getGangSubtypeRank(editionSlug?: string | null): { [key: string]: number } {
  if (!editionSlug) return {};
  return GANG_SUBTYPE_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}
