/**
 * N26 promotion recipes (keep-type and type-change).
 *
 * - Prospect → Ganger+Specialist (+ specialisation pick, +15 rating, mapped skill)
 * - Ganger → Champion (keep type, grant Inspiring, rating unchanged)
 * - Champion → Leader (change type, rebuild subtypes, grant Inspiring if missing)
 *
 * NOTE: Specialisation/skill UUIDs below are production catalog ids used as a
 * preferred lookup cache. Skills fall back to name resolution in the server
 * actions; specialisation ids do not — a wrong id fails the
 * fighters.fighter_specialisation_id FK. Prefer resolving from the DB
 * (fighter_specialisations / fighter_defaults) if these ever drift.
 */

import { hasFighterSpecialisations } from '@/types/edition';

export const N26_PROSPECT_PROMOTION_CREDITS = 15;

/** N26 fighter_subtypes row. Specialisation is only valid with this subtype. */
export const N26_SPECIALIST_SUBTYPE_ID = '12d6cc2c-21ed-4b5a-b552-6c72d2e96042';
export const N26_SPECIALIST_SUBTYPE_NAME = 'Specialist';

export type N26SpecialistSubtypeCatalog = Array<{ id: string; subtype_name: string }>;

function n26SpecialistSubtypeName(
  catalog?: N26SpecialistSubtypeCatalog | null
): string {
  return catalog?.find(row => row.id === N26_SPECIALIST_SUBTYPE_ID)?.subtype_name
    ?? N26_SPECIALIST_SUBTYPE_NAME;
}

export function hasN26SpecialistSubtype(
  subtypes?: string[] | null,
  catalog?: N26SpecialistSubtypeCatalog | null
): boolean {
  return (subtypes ?? []).includes(n26SpecialistSubtypeName(catalog));
}

/** True when this edition uses specialisations but the fighter is not a Specialist. */
export function shouldClearSpecialisationForSubtypes(
  editionSlug?: string | null,
  subtypes?: string[] | null
): boolean {
  return hasFighterSpecialisations(editionSlug) && !hasN26SpecialistSubtype(subtypes);
}

/** Catalog ids for the eight houseless specialisations offered on Prospect promotion. */
export const N26_PROSPECT_SPECIALISATIONS = [
  {
    id: 'f16c7f9c-3fcc-4384-81c8-14a9e863dc28',
    name: 'Heavy',
    skillName: 'Bulging Biceps',
    preferredSkillId: '6d63b65d-cd66-4571-b782-e5829ed31455',
  },
  {
    id: '71a99cf2-5a95-4328-b053-ece6cf70818f',
    name: 'Gunner',
    skillName: 'Hip-shooting',
    preferredSkillId: 'd493dac2-a8c4-4623-bee8-7450e9c89bf2',
  },
  {
    id: '6ba5f84f-1bba-4b33-9837-20750e272b7f',
    name: 'Gunslinger',
    skillName: 'Gunfighter',
    preferredSkillId: '201a4108-8db1-417c-94d8-28863bebee58',
  },
  {
    id: '575d0857-1d6d-41f3-ae41-a2d529d648e2',
    name: 'Scout',
    skillName: 'Clamber',
    preferredSkillId: '1a738b6f-e3c1-47b7-b723-4dd5535332fb',
  },
  {
    id: '1d32f47b-3788-4fc9-a80a-a20ed63e1601',
    name: 'Sniper',
    skillName: 'Precision Shot',
    preferredSkillId: 'bc28a44e-15ba-41d5-9b01-d6b5a4ba7dca',
  },
  {
    id: 'f9a96b0e-ec6e-4888-b122-84d9d5b8f62a',
    name: 'Brawler',
    skillName: 'Berserker',
    preferredSkillId: '6404ec90-490c-4017-9bb0-49fd3b23e688',
  },
  {
    id: '83f5f0f8-43bc-4c2c-b1d0-e8a2e092e98c',
    name: 'Medic',
    skillName: 'Medicate',
    preferredSkillId: '4fb6fe77-8c78-4dfa-8131-408e1204de20',
  },
  {
    id: '5ca912ac-a74f-4320-a6b2-affb159b95ce',
    name: 'Tech',
    skillName: 'Munitioneer',
    preferredSkillId: '8d6aa417-a6a6-4a91-ae77-ea9d9bbcf7bb',
  },
] as const;

export type N26ProspectSpecialisation = (typeof N26_PROSPECT_SPECIALISATIONS)[number];

export function getN26ProspectSpecialisation(
  specialisationId: string
): N26ProspectSpecialisation | undefined {
  return N26_PROSPECT_SPECIALISATIONS.find((s) => s.id === specialisationId);
}

export function getN26ProspectSpecialisationBySkillName(
  skillName: string
): N26ProspectSpecialisation | undefined {
  return N26_PROSPECT_SPECIALISATIONS.find((s) => s.skillName === skillName);
}

/** True when this skill is one of the eight Prospect-promotion grants. */
export function isN26ProspectPromotionSkillName(skillName: string): boolean {
  return N26_PROSPECT_SPECIALISATIONS.some((s) => s.skillName === skillName);
}

/**
 * True when this skill matches the fighter's specialisation map (name/id).
 * Not sufficient alone for undo — native specialised Gangers share these
 * specialisations. Use {@link isN26ProspectPromotionUndoCandidate} for demotion.
 */
export function isN26ProspectPromotionSkillGrant(
  fighterSpecialisationId: string | null | undefined,
  skillId: string | null | undefined,
  skillName: string
): boolean {
  if (!fighterSpecialisationId) return false;
  const spec = getN26ProspectSpecialisation(fighterSpecialisationId);
  if (!spec) return false;
  return skillId === spec.preferredSkillId || skillName === spec.skillName;
}

/**
 * True when deleting this skill should undo an N26 Prospect keep-type promotion.
 * Requires: specialisation→skill match, post-promo subtypes (Ganger+Specialist),
 * and a Prospect catalog type (keep-type left fighter_type_id on a Prospect row;
 * native specialised Gangers are Ganger+Specialist in catalog).
 */
export function isN26ProspectPromotionUndoCandidate(args: {
  editionSlug?: string | null;
  currentSubtypes?: string[] | null;
  catalogSubtypes?: string[] | null;
  fighterSpecialisationId?: string | null;
  skillId?: string | null;
  skillName: string;
  /** When true, edition has prospectSpecialisationPromotion. */
  editionAllowsProspectPromotion: boolean;
}): boolean {
  if (!args.editionAllowsProspectPromotion) return false;
  if (!isN26ProspectPromotionSkillGrant(
    args.fighterSpecialisationId,
    args.skillId,
    args.skillName
  )) {
    return false;
  }
  const current = args.currentSubtypes ?? [];
  if (!current.includes('Ganger') || !current.includes('Specialist')) return false;
  const catalog = args.catalogSubtypes ?? [];
  // Keep-type: catalog stayed Prospect. Native specialists are Ganger in catalog.
  if (!catalog.includes('Prospect') || catalog.includes('Ganger')) return false;
  return true;
}

/**
 * True when deleting this Prospect-promotion skill must be blocked until
 * Champion/Leader is undone first.
 *
 * Catalog Prospect holds through Ganger/Champion keep-type, but Champion→Leader
 * rewrites fighter_type_id to a Leader row — and Leader undo does not restore
 * the previous type. Provenance:
 * - Leader subtype: block (type may already be Leader catalog)
 * - Champion subtype: block when catalog is keep-type Prospect, or catalog is
 *   Leader (post type-change / post Leader-undo)
 */
export function isN26ProspectPromotionSkillBlockedByHigherRank(args: {
  editionAllowsProspectPromotion: boolean;
  fighterSpecialisationId?: string | null;
  skillId?: string | null;
  skillName: string;
  currentSubtypes?: string[] | null;
  catalogSubtypes?: string[] | null;
}): boolean {
  if (!args.editionAllowsProspectPromotion) return false;
  if (!isN26ProspectPromotionSkillGrant(
    args.fighterSpecialisationId,
    args.skillId,
    args.skillName
  )) {
    return false;
  }
  const current = args.currentSubtypes ?? [];
  const catalog = args.catalogSubtypes ?? [];
  if (current.includes('Leader')) return true;
  if (!current.includes('Champion')) return false;
  const keepTypeProspect =
    catalog.includes('Prospect') && !catalog.includes('Ganger');
  return keepTypeProspect || catalog.includes('Leader');
}

/** Drop Prospect; ensure Ganger + Specialist; keep every other subtype. */
export function buildN26ProspectPromotionSubtypes(currentSubtypes: string[]): string[] {
  const next = currentSubtypes.filter((s) => s !== 'Prospect');
  for (const required of ['Ganger', 'Specialist'] as const) {
    if (!next.includes(required)) next.push(required);
  }
  return next;
}

/**
 * Reverse of promotion subtypes: drop Ganger + Specialist that promotion adds,
 * restore Prospect. Other subtypes are kept.
 */
export function buildN26ProspectDemotionSubtypes(currentSubtypes: string[]): string[] {
  const next = currentSubtypes.filter((s) => s !== 'Ganger' && s !== 'Specialist');
  if (!next.includes('Prospect')) next.push('Prospect');
  return next;
}

// --- Ganger → Champion -------------------------------------------------------

/** Preferred catalog id for Inspiring (granted on Ganger→Champion keep-type). */
export const N26_CHAMPION_PROMOTION_SKILL_ID = 'c32a8813-abe9-48f6-bf49-ee27df97d8ae';
export const N26_CHAMPION_PROMOTION_SKILL_NAME = 'Inspiring';

/** Drop Ganger; ensure Champion; keep every other subtype (e.g. Specialist). */
export function buildN26GangerChampionPromotionSubtypes(currentSubtypes: string[]): string[] {
  const next = currentSubtypes.filter((s) => s !== 'Ganger');
  if (!next.includes('Champion')) next.push('Champion');
  return next;
}

/**
 * Reverse of Ganger→Champion: drop Champion, restore Ganger.
 * Other subtypes (e.g. Specialist) are kept.
 */
export function buildN26GangerChampionDemotionSubtypes(currentSubtypes: string[]): string[] {
  const next = currentSubtypes.filter((s) => s !== 'Champion');
  if (!next.includes('Ganger')) next.push('Ganger');
  return next;
}

/**
 * Client-side hint: skill name is Inspiring and fighter currently looks like a
 * keep-type Champion (has Champion, no Ganger). Server still verifies catalog type.
 */
export function isN26GangerChampionPromotionSkillName(skillName: string): boolean {
  return skillName === N26_CHAMPION_PROMOTION_SKILL_NAME;
}

/**
 * True when deleting this skill should undo an N26 Ganger→Champion promotion.
 * Requires current subtypes (Champion without Ganger) plus Inspiring by id/name.
 * Callers that can load the catalog type should also require that the fighter's
 * fighter_type_id is a Ganger catalog row (not a starting Champion).
 */
export function isN26GangerChampionPromotionSkillGrant(
  currentSubtypes: string[] | null | undefined,
  skillId: string | null | undefined,
  skillName: string
): boolean {
  const subtypes = currentSubtypes ?? [];
  if (!subtypes.includes('Champion') || subtypes.includes('Ganger')) return false;
  return (
    skillId === N26_CHAMPION_PROMOTION_SKILL_ID ||
    skillName === N26_CHAMPION_PROMOTION_SKILL_NAME
  );
}

// --- Champion → Leader -------------------------------------------------------

const N26_LEADER_PROMOTION_REMOVED_SUBTYPES = [
  'Loner',
  'Champion',
  'Ganger',
  'Prospect',
] as const;

/** Drop Loner/Champion/Ganger/Prospect; ensure Leader; keep every other subtype. */
export function buildN26ChampionLeaderPromotionSubtypes(currentSubtypes: string[]): string[] {
  const removed = new Set<string>(N26_LEADER_PROMOTION_REMOVED_SUBTYPES);
  const next = currentSubtypes.filter((s) => !removed.has(s));
  if (!next.includes('Leader')) next.push('Leader');
  return next;
}

/**
 * Reverse of Champion→Leader subtypes: drop Leader, restore Champion.
 * Does not re-add Loner/Ganger/Prospect.
 */
export function buildN26ChampionLeaderDemotionSubtypes(currentSubtypes: string[]): string[] {
  const next = currentSubtypes.filter((s) => s !== 'Leader');
  if (!next.includes('Champion')) next.push('Champion');
  return next;
}

/**
 * True when deleting this skill should undo an N26 Champion→Leader promotion grant.
 * Requires Leader (no Champion) plus Inspiring. Server also verifies catalog type.
 */
export function isN26LeaderPromotionSkillGrant(
  currentSubtypes: string[] | null | undefined,
  skillId: string | null | undefined,
  skillName: string
): boolean {
  const subtypes = currentSubtypes ?? [];
  if (!subtypes.includes('Leader') || subtypes.includes('Champion')) return false;
  return (
    skillId === N26_CHAMPION_PROMOTION_SKILL_ID ||
    skillName === N26_CHAMPION_PROMOTION_SKILL_NAME
  );
}
