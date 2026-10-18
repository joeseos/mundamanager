import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Drizzle schema for the tables read over the direct database connection
 * (utils/db/client.ts). The tables themselves are defined by
 * supabase/migrations; these definitions mirror supabase/schema/schema.public.sql
 * and must be kept in step with it when a migration changes these tables.
 *
 * Column types are chosen so values come back exactly as the Data API returns
 * them: numeric and bigint as numbers, timestamps and dates as ISO strings,
 * jsonb untouched. Relational queries read nested rows as JSON built by
 * Postgres, which already encodes every value the way the Data API does.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// jsonb is passed through as Postgres returned it. Drizzle's own jsonb() would
// JSON.parse string values again, turning e.g. the string "2" into the number 2.
const json = customType<{ data: Json }>({ dataType: () => 'jsonb' });
const jsonArray = customType<{ data: Json[] }>({ dataType: () => 'jsonb[]' });

export const alignment = pgEnum('alignment', ['Outlaw', 'Law Abiding', 'Unaligned']);

export const gangs = pgTable('gangs', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  user_id: uuid('user_id'),
  name: text('name'),
  gang_type: text('gang_type'),
  credits: numeric('credits', { mode: 'number' }),
  last_updated: timestamp('last_updated', { withTimezone: true, mode: 'string' }),
  reputation: numeric('reputation', { mode: 'number' }),
  rating: numeric('rating', { mode: 'number' }),
  id: uuid('id').defaultRandom().primaryKey(),
  gang_type_id: uuid('gang_type_id'),
  alignment: alignment('alignment'),
  positioning: json('positioning'),
  note: text('note'),
  alliance_id: uuid('alliance_id'),
  gang_subtypes: json('gang_subtypes'),
  gang_colour: text('gang_colour'),
  image_url: text('image_url'),
  note_backstory: text('note_backstory'),
  gang_affiliation_id: uuid('gang_affiliation_id'),
  gang_origin_id: uuid('gang_origin_id'),
  wealth: numeric('wealth', { mode: 'number' }),
  hidden: boolean('hidden').default(false),
  is_favourite: boolean('is_favourite').default(false).notNull(),
  favourite_order: integer('favourite_order'),
  custom_gang_type_id: uuid('custom_gang_type_id'),
  note_private: text('note_private'),
  note_private_updated_at: timestamp('note_private_updated_at', { withTimezone: true, mode: 'string' }),
  trade_points: numeric('trade_points', { mode: 'number' }).default(0).notNull(),
  gang_portrait_id: uuid('gang_portrait_id'),
});

export const fighters = pgTable('fighters', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  fighter_name: text('fighter_name'),
  fighter_type: text('fighter_type'),
  credits: numeric('credits', { mode: 'number' }),
  movement: numeric('movement', { mode: 'number' }),
  weapon_skill: numeric('weapon_skill', { mode: 'number' }),
  ballistic_skill: numeric('ballistic_skill', { mode: 'number' }),
  strength: numeric('strength', { mode: 'number' }),
  toughness: numeric('toughness', { mode: 'number' }),
  wounds: numeric('wounds', { mode: 'number' }),
  initiative: numeric('initiative', { mode: 'number' }),
  leadership: numeric('leadership', { mode: 'number' }),
  cool: numeric('cool', { mode: 'number' }),
  willpower: numeric('willpower', { mode: 'number' }),
  intelligence: numeric('intelligence', { mode: 'number' }),
  attacks: numeric('attacks', { mode: 'number' }),
  id: uuid('id').defaultRandom().primaryKey(),
  fighter_type_id: uuid('fighter_type_id'),
  gang_id: uuid('gang_id'),
  kills: numeric('kills', { mode: 'number' }).default(0),
  xp: numeric('xp', { mode: 'number' }).default(0),
  special_rules: jsonArray('special_rules'),
  position: integer('position').default(0).notNull(),
  total_xp: numeric('total_xp', { mode: 'number' }).default(0),
  free_skill: boolean('free_skill'),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  starved: boolean('starved').default(false).notNull(),
  killed: boolean('killed').default(false).notNull(),
  retired: boolean('retired').default(false).notNull(),
  enslaved: boolean('enslaved').default(false).notNull(),
  note: text('note'),
  cost_adjustment: numeric('cost_adjustment', { mode: 'number' }).default(0),
  label: text('label'),
  recovery: boolean('recovery').default(false),
  user_id: uuid('user_id').default(sql`auth.uid()`),
  fighter_specialisation_id: uuid('fighter_specialisation_id'),
  fighter_specialisation: text('fighter_specialisation'),
  fighter_pet_id: uuid('fighter_pet_id'),
  image_url: text('image_url'),
  note_backstory: text('note_backstory'),
  captured: boolean('captured').default(false),
  fighter_gang_legacy_id: uuid('fighter_gang_legacy_id'),
  custom_fighter_type_id: uuid('custom_fighter_type_id'),
  current_loadout: integer('current_loadout'),
  kill_count: numeric('kill_count', { mode: 'number' }),
  active_loadout_id: uuid('active_loadout_id'),
  selected_archetype_id: uuid('selected_archetype_id'),
  captured_by_gang_id: uuid('captured_by_gang_id'),
  save: numeric('save', { mode: 'number' }),
  fighter_subtypes: json('fighter_subtypes').default(sql`'[]'::jsonb`).notNull(),
  is_vehicle: boolean('is_vehicle').default(false).notNull(),
  starting_xp: numeric('starting_xp', { mode: 'number' }),
  fighter_variant: text('fighter_variant'),
  promoted_from_prospect: boolean('promoted_from_prospect').default(false).notNull(),
});

export const fighterGangLegacy = pgTable('fighter_gang_legacy', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  name: text('name'),
  fighter_type_id: uuid('fighter_type_id'),
  edition_id: uuid('edition_id'),
});

export const fighterTypes = pgTable('fighter_types', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  fighter_type: text('fighter_type'),
  gang_type: text('gang_type'),
  cost: numeric('cost', { mode: 'number' }),
  movement: numeric('movement', { mode: 'number' }),
  weapon_skill: numeric('weapon_skill', { mode: 'number' }),
  ballistic_skill: numeric('ballistic_skill', { mode: 'number' }),
  strength: numeric('strength', { mode: 'number' }),
  toughness: numeric('toughness', { mode: 'number' }),
  wounds: numeric('wounds', { mode: 'number' }),
  initiative: numeric('initiative', { mode: 'number' }),
  leadership: numeric('leadership', { mode: 'number' }),
  cool: numeric('cool', { mode: 'number' }),
  willpower: numeric('willpower', { mode: 'number' }),
  intelligence: numeric('intelligence', { mode: 'number' }),
  attacks: numeric('attacks', { mode: 'number' }),
  id: uuid('id').defaultRandom().primaryKey(),
  gang_type_id: uuid('gang_type_id').notNull(),
  special_rules: jsonArray('special_rules'),
  free_skill: boolean('free_skill'),
  is_gang_addition: boolean('is_gang_addition').default(false),
  limitation: numeric('limitation', { mode: 'number' }),
  alignment: alignment('alignment'),
  fighter_specialisation_id: uuid('fighter_specialisation_id'),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  fighter_specialisation: text('fighter_specialisation'),
  alliance_id: uuid('alliance_id'),
  alliance_crew_name: text('alliance_crew_name'),
  is_spyrer: boolean('is_spyrer').default(false),
  delegation_cost: numeric('delegation_cost', { mode: 'number' }),
  is_dramatis_personae: boolean('is_dramatis_personae').default(false).notNull(),
  edition_id: uuid('edition_id'),
  save: numeric('save', { mode: 'number' }),
  fighter_subtypes: json('fighter_subtypes').default(sql`'[]'::jsonb`).notNull(),
  starting_xp: numeric('starting_xp', { mode: 'number' }),
  is_vehicle: boolean('is_vehicle').default(false).notNull(),
  fighter_variant: text('fighter_variant'),
});

export const customFighterTypes = pgTable('custom_fighter_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  fighter_type: text('fighter_type'),
  gang_type: text('gang_type'),
  cost: numeric('cost', { mode: 'number' }),
  movement: numeric('movement', { mode: 'number' }),
  weapon_skill: numeric('weapon_skill', { mode: 'number' }),
  ballistic_skill: numeric('ballistic_skill', { mode: 'number' }),
  strength: numeric('strength', { mode: 'number' }),
  toughness: numeric('toughness', { mode: 'number' }),
  wounds: numeric('wounds', { mode: 'number' }),
  initiative: numeric('initiative', { mode: 'number' }),
  attacks: numeric('attacks', { mode: 'number' }),
  leadership: numeric('leadership', { mode: 'number' }),
  cool: numeric('cool', { mode: 'number' }),
  willpower: numeric('willpower', { mode: 'number' }),
  intelligence: numeric('intelligence', { mode: 'number' }),
  gang_type_id: uuid('gang_type_id'),
  special_rules: json('special_rules'),
  free_skill: boolean('free_skill'),
  user_id: uuid('user_id'),
  custom_gang_type_id: uuid('custom_gang_type_id'),
  description: text('description'),
  edition_id: uuid('edition_id').notNull(),
  save: numeric('save', { mode: 'number' }),
  fighter_subtypes: json('fighter_subtypes').default(sql`'[]'::jsonb`).notNull(),
  starting_xp: numeric('starting_xp', { mode: 'number' }),
  is_vehicle: boolean('is_vehicle').default(false).notNull(),
  fighter_variant: text('fighter_variant'),
});

export const editions = pgTable('editions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  released_at: date('released_at', { mode: 'string' }),
  is_current: boolean('is_current').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const fighterSpecialisations = pgTable('fighter_specialisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  specialisation_name: text('specialisation_name'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const skillAccessArchetypes = pgTable('skill_access_archetypes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  skill_access: json('skill_access').default(sql`'[]'::jsonb`).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  fighter_subtype_id: uuid('fighter_subtype_id'),
});

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  vehicle_name: text('vehicle_name'),
  movement: numeric('movement', { mode: 'number' }),
  front: numeric('front', { mode: 'number' }),
  side: numeric('side', { mode: 'number' }),
  rear: numeric('rear', { mode: 'number' }),
  hull_points: numeric('hull_points', { mode: 'number' }),
  handling: numeric('handling', { mode: 'number' }),
  save: numeric('save', { mode: 'number' }),
  body_slots: numeric('body_slots', { mode: 'number' }),
  drive_slots: numeric('drive_slots', { mode: 'number' }),
  engine_slots: numeric('engine_slots', { mode: 'number' }),
  special_rules: json('special_rules'),
  fighter_id: uuid('fighter_id'),
  body_slots_occupied: numeric('body_slots_occupied', { mode: 'number' }),
  drive_slots_occupied: numeric('drive_slots_occupied', { mode: 'number' }),
  engine_slots_occupied: numeric('engine_slots_occupied', { mode: 'number' }),
  vehicle_type_id: uuid('vehicle_type_id'),
  cost: numeric('cost', { mode: 'number' }),
  vehicle_type: text('vehicle_type'),
  gang_id: uuid('gang_id'),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  hardpoints: numeric('hardpoints', { mode: 'number' }),
});

export const fighterEquipment = pgTable('fighter_equipment', {
  equipment_id: uuid('equipment_id'),
  fighter_id: uuid('fighter_id'),
  id: uuid('id').defaultRandom().primaryKey(),
  purchase_cost: numeric('purchase_cost', { mode: 'number' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  original_cost: numeric('original_cost', { mode: 'number' }),
  vehicle_id: uuid('vehicle_id'),
  user_id: uuid('user_id').default(sql`auth.uid()`),
  is_master_crafted: boolean('is_master_crafted').default(false).notNull(),
  fighter_effect_equipment_id: uuid('fighter_effect_equipment_id'),
  custom_equipment_id: uuid('custom_equipment_id'),
  gang_stash: boolean('gang_stash').default(false),
  gang_id: uuid('gang_id'),
  loadout_id: integer('loadout_id'),
  is_editable: boolean('is_editable').default(false),
  granted_by_equipment_id: uuid('granted_by_equipment_id'),
  cost_resource: json('cost_resource'),
  fighter_skill_id: uuid('fighter_skill_id'),
});

export const equipment = pgTable('equipment', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  equipment_name: text('equipment_name'),
  availability: text('availability'),
  cost: numeric('cost', { mode: 'number' }),
  variants: text('variants'),
  id: uuid('id').defaultRandom().primaryKey(),
  equipment_category: text('equipment_category').notNull(),
  equipment_type: text('equipment_type'),
  core_equipment: boolean('core_equipment'),
  equipment_category_id: uuid('equipment_category_id').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  is_editable: boolean('is_editable').default(false),
  grants_equipment: json('grants_equipment'),
  is_consumable: boolean('is_consumable').default(false),
  edition_id: uuid('edition_id'),
  trade_points: text('trade_points').default(sql`'0'::text`).notNull(),
});

export const weaponProfiles = pgTable('weapon_profiles', {
  equipment_id: uuid('equipment_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  profile_name: text('profile_name'),
  range_short: text('range_short').notNull(),
  range_long: text('range_long').notNull(),
  acc_short: text('acc_short').notNull(),
  acc_long: text('acc_long').notNull(),
  strength: text('strength').notNull(),
  ap: text('ap').notNull(),
  damage: text('damage').notNull(),
  ammo: text('ammo').notNull(),
  traits: text('traits'),
  id: uuid('id').defaultRandom().primaryKey(),
  weapon_group_id: uuid('weapon_group_id'),
  sort_order: numeric('sort_order', { mode: 'number' }),
  lethality: text('lethality'),
});

export const customEquipment = pgTable('custom_equipment', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  equipment_name: text('equipment_name'),
  OLDtrading_post_category: text('OLDtrading_post_category'),
  availability: text('availability'),
  cost: numeric('cost', { mode: 'number' }),
  OLDfaction: text('OLDfaction'),
  variant: text('variant'),
  equipment_category: text('equipment_category'),
  equipment_category_id: uuid('equipment_category_id'),
  equipment_type: text('equipment_type'),
  user_id: uuid('user_id').notNull(),
  is_editable: boolean('is_editable').default(false),
  is_consumable: boolean('is_consumable').default(false),
  description: text('description'),
  edition_id: uuid('edition_id').notNull(),
  trade_points: text('trade_points').default(sql`'0'::text`).notNull(),
});

export const customWeaponProfiles = pgTable('custom_weapon_profiles', {
  custom_equipment_id: uuid('custom_equipment_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  profile_name: text('profile_name'),
  range_short: text('range_short').notNull(),
  range_long: text('range_long').notNull(),
  acc_short: text('acc_short').notNull(),
  acc_long: text('acc_long').notNull(),
  strength: text('strength').notNull(),
  ap: text('ap').notNull(),
  damage: text('damage').notNull(),
  ammo: text('ammo').notNull(),
  traits: text('traits'),
  id: uuid('id').defaultRandom().primaryKey(),
  weapon_group_id: uuid('weapon_group_id'),
  sort_order: numeric('sort_order', { mode: 'number' }),
  user_id: uuid('user_id'),
  lethality: text('lethality'),
});

export const fighterSkills = pgTable('fighter_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  fighter_id: uuid('fighter_id'),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  skill_id: uuid('skill_id'),
  is_advance: boolean('is_advance').default(false).notNull(),
  credits_increase: bigint('credits_increase', { mode: 'number' }),
  xp_cost: numeric('xp_cost', { mode: 'number' }),
  fighter_injury_id: uuid('fighter_injury_id'),
  user_id: uuid('user_id'),
  fighter_effect_skill_id: uuid('fighter_effect_skill_id'),
  custom_skill_id: uuid('custom_skill_id'),
});

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  OLDxp_cost: bigint('OLDxp_cost', { mode: 'number' }),
  OLDcredit_cost: bigint('OLDcredit_cost', { mode: 'number' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  name: text('name'),
  skill_type_id: uuid('skill_type_id'),
  gang_origin_id: uuid('gang_origin_id'),
  grants_equipment: json('grants_equipment'),
});

export const customSkills = pgTable('custom_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  skill_name: text('skill_name'),
  user_id: uuid('user_id'),
  skill_type_id: uuid('skill_type_id'),
  custom_skill_type_id: uuid('custom_skill_type_id'),
  description: text('description'),
});

export const fighterEffectSkills = pgTable('fighter_effect_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  fighter_effect_id: uuid('fighter_effect_id'),
  fighter_skill_id: uuid('fighter_skill_id'),
});

export const fighterEffects = pgTable('fighter_effects', {
  id: uuid('id').defaultRandom().primaryKey(),
  effect_name: text('effect_name'),
  fighter_id: uuid('fighter_id'),
  fighter_effect_type_id: uuid('fighter_effect_type_id'),
  type_specific_data: json('type_specific_data'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  vehicle_id: uuid('vehicle_id'),
  user_id: uuid('user_id').default(sql`auth.uid()`),
  fighter_equipment_id: uuid('fighter_equipment_id'),
  target_equipment_id: uuid('target_equipment_id'),
  fighter_skill_id: uuid('fighter_skill_id'),
  sort_order: numeric('sort_order', { mode: 'number' }),
});

export const fighterEffectTypes = pgTable('fighter_effect_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  effect_name: text('effect_name'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  fighter_effect_category_id: uuid('fighter_effect_category_id'),
  type_specific_data: json('type_specific_data'),
  sort_order: numeric('sort_order', { mode: 'number' }),
  edition_id: uuid('edition_id'),
});

export const fighterEffectCategories = pgTable('fighter_effect_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  category_name: text('category_name'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const fighterEffectModifiers = pgTable('fighter_effect_modifiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  stat_name: text('stat_name'),
  fighter_effect_id: uuid('fighter_effect_id'),
  numeric_value: integer('numeric_value'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  operation: text('operation'),
  user_id: uuid('user_id'),
});

export const fighterExoticBeasts = pgTable('fighter_exotic_beasts', {
  id: uuid('id').defaultRandom().primaryKey(),
  fighter_owner_id: uuid('fighter_owner_id'),
  fighter_pet_id: uuid('fighter_pet_id'),
  fighter_equipment_id: uuid('fighter_equipment_id'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const fighterLoadouts = pgTable('fighter_loadouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  fighter_id: uuid('fighter_id').notNull(),
  loadout_name: text('loadout_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  user_id: uuid('user_id').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const fighterLoadoutEquipment = pgTable('fighter_loadout_equipment', {
  loadout_id: uuid('loadout_id').notNull(),
  fighter_equipment_id: uuid('fighter_equipment_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
}, (table) => [primaryKey({ columns: [table.loadout_id, table.fighter_equipment_id] })]);

export const alliances = pgTable('alliances', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  alliance_type: text('alliance_type'),
  alliance_name: text('alliance_name'),
  alignment: text('alignment'),
  strong_alliance: uuid('strong_alliance'),
  id: uuid('id').defaultRandom().primaryKey(),
  alliance_crew_name: text('alliance_crew_name'),
  edition_id: uuid('edition_id'),
  tithe_cost: numeric('tithe_cost', { mode: 'number' }),
});

export const gangAffiliation = pgTable('gang_affiliation', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  name: text('name'),
  fighter_type_id: uuid('fighter_type_id'),
  edition_id: uuid('edition_id'),
});

export const gangOriginCategories = pgTable('gang_origin_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  category_name: text('category_name'),
});

export const gangOrigins = pgTable('gang_origins', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  origin_name: text('origin_name'),
  gang_origin_category_id: uuid('gang_origin_category_id'),
  edition_id: uuid('edition_id'),
});

export const gangTypes = pgTable('gang_types', {
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  gang_type: text('gang_type'),
  id: uuid('id').defaultRandom().primaryKey(),
  alignment: alignment('alignment'),
  is_hidden: boolean('is_hidden').default(false),
  trading_post_type_id: uuid('trading_post_type_id'),
  affiliation: boolean('affiliation').default(false),
  gang_origin_category_id: uuid('gang_origin_category_id'),
  edition_id: uuid('edition_id'),
  parent_gang_type_id: uuid('parent_gang_type_id'),
  parent_gang_type_name: text('parent_gang_type_name'),
});

export const customGangTypes = pgTable('custom_gang_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  user_id: uuid('user_id').notNull(),
  gang_type: text('gang_type').notNull(),
  alignment: alignment('alignment'),
  trading_post_type_id: uuid('trading_post_type_id'),
  description: text('description'),
  edition_id: uuid('edition_id').notNull(),
});

export const gangPortraits = pgTable('gang_portraits', {
  id: uuid('id').defaultRandom().primaryKey(),
  storage_path: text('storage_path').notNull(),
  credit: json('credit').notNull(),
  group_label: text('group_label').notNull(),
  style: text('style').notNull(),
  label: text('label'),
});

export const gangSkillSetRanks = pgTable('gang_skill_set_ranks', {
  gang_id: uuid('gang_id').notNull(),
  rank: integer('rank').notNull(),
  skill_type_id: uuid('skill_type_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
}, (table) => [primaryKey({ columns: [table.gang_id, table.rank] })]);

export const campaignTypes = pgTable('campaign_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  campaign_type_name: text('campaign_type_name'),
  description: text('description'),
  image_url: text('image_url'),
  trading_posts: json('trading_posts'),
  edition_id: uuid('edition_id'),
});

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  campaign_name: text('campaign_name'),
  campaign_type_id: uuid('campaign_type_id'),
  status: text('status'),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  note: text('note'),
  description: text('description'),
  image_url: text('image_url'),
  trading_posts: json('trading_posts'),
  discord_channel_id: text('discord_channel_id'),
  discord_guild_id: text('discord_guild_id'),
  discord_channel_type: integer('discord_channel_type').default(0).notNull(),
  created_by: uuid('created_by').default(sql`auth.uid()`),
  custom_trading_posts: json('custom_trading_posts'),
  allow_join_requests: boolean('allow_join_requests').default(false).notNull(),
  current_cycle: integer('current_cycle'),
});

export const campaignMembers = pgTable('campaign_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull(),
  campaign_id: uuid('campaign_id'),
  invited_by: uuid('invited_by'),
  role: text('role'),
  invited_at: timestamp('invited_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  is_favourite: boolean('is_favourite').default(false).notNull(),
  favourite_order: integer('favourite_order'),
});

export const campaignGangs = pgTable('campaign_gangs', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_id: uuid('campaign_id'),
  user_id: uuid('user_id').notNull(),
  role: text('role'),
  status: text('status'),
  invited_at: timestamp('invited_at', { withTimezone: true, mode: 'string' }),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'string' }),
  invited_by: uuid('invited_by'),
  gang_id: uuid('gang_id'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  campaign_member_id: uuid('campaign_member_id'),
  campaign_type_allegiance_id: uuid('campaign_type_allegiance_id'),
  campaign_allegiance_id: uuid('campaign_allegiance_id'),
});

export const campaignTerritories = pgTable('campaign_territories', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  territory_id: uuid('territory_id'),
  campaign_id: uuid('campaign_id'),
  owner: json('owner'),
  territory_name: text('territory_name'),
  gang_id: uuid('gang_id'),
  ruined: boolean('ruined').default(false),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  default_gang_territory: boolean('default_gang_territory').default(false),
  playing_card: text('playing_card'),
  description: text('description'),
  map_object_id: uuid('map_object_id'),
  map_hex_coords: json('map_hex_coords'),
  show_name_on_map: boolean('show_name_on_map').default(true),
});

export const tradingPostTypes = pgTable('trading_post_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  trading_post_name: text('trading_post_name'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  edition_id: uuid('edition_id'),
});

export const customTradingPosts = pgTable('custom_trading_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  user_id: uuid('user_id').notNull(),
  custom_trading_post_name: text('custom_trading_post_name').notNull(),
  description: text('description'),
  edition_id: uuid('edition_id'),
});

export const campaignAllegiances = pgTable('campaign_allegiances', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_id: uuid('campaign_id').notNull(),
  allegiance_name: text('allegiance_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const campaignTypeAllegiances = pgTable('campaign_type_allegiances', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_type_id: uuid('campaign_type_id').notNull(),
  allegiance_name: text('allegiance_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const campaignTypeResources = pgTable('campaign_type_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_type_id: uuid('campaign_type_id').notNull(),
  resource_name: text('resource_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const campaignResources = pgTable('campaign_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_id: uuid('campaign_id').notNull(),
  resource_name: text('resource_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export const campaignGangResources = pgTable('campaign_gang_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaign_gang_id: uuid('campaign_gang_id').notNull(),
  campaign_type_resource_id: uuid('campaign_type_resource_id'),
  campaign_resource_id: uuid('campaign_resource_id'),
  quantity: numeric('quantity', { mode: 'number' }).default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

// A one() that names its join columns (fields/references) needs nothing more.
// A many() is matched to the one() pointing back at its table, so where two
// one()s point at the same table, that pair gets a relationName:
// gangs.fighters (gang_id, not captured_by_gang_id) and
// fighters.fighter_exotic_beasts (fighter_owner_id, not fighter_pet_id).

export const gangsRelations = relations(gangs, ({ one, many }) => ({
  fighters: many(fighters, { relationName: 'gang_fighters' }),
  vehicles: many(vehicles),
  alliance: one(alliances, {
    fields: [gangs.alliance_id],
    references: [alliances.id],
  }),
  gang_affiliation: one(gangAffiliation, {
    fields: [gangs.gang_affiliation_id],
    references: [gangAffiliation.id],
  }),
  gang_origin: one(gangOrigins, {
    fields: [gangs.gang_origin_id],
    references: [gangOrigins.id],
  }),
  gang_types: one(gangTypes, {
    fields: [gangs.gang_type_id],
    references: [gangTypes.id],
  }),
  custom_gang_type: one(customGangTypes, {
    fields: [gangs.custom_gang_type_id],
    references: [customGangTypes.id],
  }),
  gang_portrait: one(gangPortraits, {
    fields: [gangs.gang_portrait_id],
    references: [gangPortraits.id],
  }),
  gang_skill_set_ranks: many(gangSkillSetRanks),
}));

export const gangOriginsRelations = relations(gangOrigins, ({ one }) => ({
  gang_origin_categories: one(gangOriginCategories, {
    fields: [gangOrigins.gang_origin_category_id],
    references: [gangOriginCategories.id],
  }),
}));

export const gangTypesRelations = relations(gangTypes, ({ one }) => ({
  gang_origin_categories: one(gangOriginCategories, {
    fields: [gangTypes.gang_origin_category_id],
    references: [gangOriginCategories.id],
  }),
  editions: one(editions, {
    fields: [gangTypes.edition_id],
    references: [editions.id],
  }),
}));

export const customGangTypesRelations = relations(customGangTypes, ({ one }) => ({
  editions: one(editions, {
    fields: [customGangTypes.edition_id],
    references: [editions.id],
  }),
}));

export const gangSkillSetRanksRelations = relations(gangSkillSetRanks, ({ one }) => ({
  gang: one(gangs, {
    fields: [gangSkillSetRanks.gang_id],
    references: [gangs.id],
  }),
}));

export const campaignGangsRelations = relations(campaignGangs, ({ one, many }) => ({
  campaign_members: one(campaignMembers, {
    fields: [campaignGangs.campaign_member_id],
    references: [campaignMembers.id],
  }),
  campaigns: one(campaigns, {
    fields: [campaignGangs.campaign_id],
    references: [campaigns.id],
  }),
  campaign_allegiance: one(campaignAllegiances, {
    fields: [campaignGangs.campaign_allegiance_id],
    references: [campaignAllegiances.id],
  }),
  campaign_type_allegiance: one(campaignTypeAllegiances, {
    fields: [campaignGangs.campaign_type_allegiance_id],
    references: [campaignTypeAllegiances.id],
  }),
  campaign_gang_resources: many(campaignGangResources),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  campaign_type: one(campaignTypes, {
    fields: [campaigns.campaign_type_id],
    references: [campaignTypes.id],
  }),
  campaign_territories: many(campaignTerritories),
  campaign_resources: many(campaignResources),
}));

export const campaignTypesRelations = relations(campaignTypes, ({ many }) => ({
  campaign_type_resources: many(campaignTypeResources),
}));

export const campaignTerritoriesRelations = relations(campaignTerritories, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignTerritories.campaign_id],
    references: [campaigns.id],
  }),
}));

export const campaignResourcesRelations = relations(campaignResources, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignResources.campaign_id],
    references: [campaigns.id],
  }),
}));

export const campaignTypeResourcesRelations = relations(campaignTypeResources, ({ one }) => ({
  campaign_type: one(campaignTypes, {
    fields: [campaignTypeResources.campaign_type_id],
    references: [campaignTypes.id],
  }),
}));

export const campaignGangResourcesRelations = relations(campaignGangResources, ({ one }) => ({
  campaign_gang: one(campaignGangs, {
    fields: [campaignGangResources.campaign_gang_id],
    references: [campaignGangs.id],
  }),
}));

export const fightersRelations = relations(fighters, ({ one, many }) => ({
  gang: one(gangs, {
    fields: [fighters.gang_id],
    references: [gangs.id],
    relationName: 'gang_fighters',
  }),
  captured_by: one(gangs, {
    fields: [fighters.captured_by_gang_id],
    references: [gangs.id],
  }),
  fighter_gang_legacy: one(fighterGangLegacy, {
    fields: [fighters.fighter_gang_legacy_id],
    references: [fighterGangLegacy.id],
  }),
  fighter_types: one(fighterTypes, {
    fields: [fighters.fighter_type_id],
    references: [fighterTypes.id],
  }),
  fighter_specialisations: one(fighterSpecialisations, {
    fields: [fighters.fighter_specialisation_id],
    references: [fighterSpecialisations.id],
  }),
  custom_fighter_type: one(customFighterTypes, {
    fields: [fighters.custom_fighter_type_id],
    references: [customFighterTypes.id],
  }),
  selected_archetype: one(skillAccessArchetypes, {
    fields: [fighters.selected_archetype_id],
    references: [skillAccessArchetypes.id],
  }),
  // Set on an exotic beast: the link to the fighter that owns it
  beast_link: one(fighterExoticBeasts, {
    fields: [fighters.fighter_pet_id],
    references: [fighterExoticBeasts.id],
  }),
  fighter_equipment: many(fighterEquipment),
  fighter_skills: many(fighterSkills),
  fighter_effects: many(fighterEffects),
  fighter_exotic_beasts: many(fighterExoticBeasts, { relationName: 'beast_owner' }),
  fighter_loadouts: many(fighterLoadouts),
  vehicles: many(vehicles),
}));

export const fighterTypesRelations = relations(fighterTypes, ({ one }) => ({
  editions: one(editions, {
    fields: [fighterTypes.edition_id],
    references: [editions.id],
  }),
}));

export const customFighterTypesRelations = relations(customFighterTypes, ({ one }) => ({
  editions: one(editions, {
    fields: [customFighterTypes.edition_id],
    references: [editions.id],
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  gang: one(gangs, {
    fields: [vehicles.gang_id],
    references: [gangs.id],
  }),
  fighter: one(fighters, {
    fields: [vehicles.fighter_id],
    references: [fighters.id],
  }),
  fighter_equipment: many(fighterEquipment),
  fighter_effects: many(fighterEffects),
}));

export const fighterEquipmentRelations = relations(fighterEquipment, ({ one }) => ({
  fighter: one(fighters, {
    fields: [fighterEquipment.fighter_id],
    references: [fighters.id],
  }),
  vehicle: one(vehicles, {
    fields: [fighterEquipment.vehicle_id],
    references: [vehicles.id],
  }),
  equipment: one(equipment, {
    fields: [fighterEquipment.equipment_id],
    references: [equipment.id],
  }),
  custom_equipment: one(customEquipment, {
    fields: [fighterEquipment.custom_equipment_id],
    references: [customEquipment.id],
  }),
}));

export const equipmentRelations = relations(equipment, ({ many }) => ({
  weapon_profiles: many(weaponProfiles),
}));

export const weaponProfilesRelations = relations(weaponProfiles, ({ one }) => ({
  equipment: one(equipment, {
    fields: [weaponProfiles.equipment_id],
    references: [equipment.id],
  }),
}));

export const customEquipmentRelations = relations(customEquipment, ({ many }) => ({
  custom_weapon_profiles: many(customWeaponProfiles),
}));

export const customWeaponProfilesRelations = relations(customWeaponProfiles, ({ one }) => ({
  custom_equipment: one(customEquipment, {
    fields: [customWeaponProfiles.custom_equipment_id],
    references: [customEquipment.id],
  }),
}));

export const fighterSkillsRelations = relations(fighterSkills, ({ one }) => ({
  fighter: one(fighters, {
    fields: [fighterSkills.fighter_id],
    references: [fighters.id],
  }),
  skill: one(skills, {
    fields: [fighterSkills.skill_id],
    references: [skills.id],
  }),
  custom_skill: one(customSkills, {
    fields: [fighterSkills.custom_skill_id],
    references: [customSkills.id],
  }),
  fighter_effect_skills: one(fighterEffectSkills, {
    fields: [fighterSkills.fighter_effect_skill_id],
    references: [fighterEffectSkills.id],
  }),
}));

export const fighterEffectSkillsRelations = relations(fighterEffectSkills, ({ one }) => ({
  fighter_effects: one(fighterEffects, {
    fields: [fighterEffectSkills.fighter_effect_id],
    references: [fighterEffects.id],
  }),
}));

export const fighterEffectsRelations = relations(fighterEffects, ({ one, many }) => ({
  fighter: one(fighters, {
    fields: [fighterEffects.fighter_id],
    references: [fighters.id],
  }),
  vehicle: one(vehicles, {
    fields: [fighterEffects.vehicle_id],
    references: [vehicles.id],
  }),
  fighter_effect_type: one(fighterEffectTypes, {
    fields: [fighterEffects.fighter_effect_type_id],
    references: [fighterEffectTypes.id],
  }),
  fighter_effect_modifiers: many(fighterEffectModifiers),
}));

export const fighterEffectTypesRelations = relations(fighterEffectTypes, ({ one }) => ({
  fighter_effect_category: one(fighterEffectCategories, {
    fields: [fighterEffectTypes.fighter_effect_category_id],
    references: [fighterEffectCategories.id],
  }),
}));

export const fighterEffectModifiersRelations = relations(fighterEffectModifiers, ({ one }) => ({
  fighter_effect: one(fighterEffects, {
    fields: [fighterEffectModifiers.fighter_effect_id],
    references: [fighterEffects.id],
  }),
}));

export const fighterExoticBeastsRelations = relations(fighterExoticBeasts, ({ one }) => ({
  // The owner
  fighters: one(fighters, {
    fields: [fighterExoticBeasts.fighter_owner_id],
    references: [fighters.id],
    relationName: 'beast_owner',
  }),
  pet: one(fighters, {
    fields: [fighterExoticBeasts.fighter_pet_id],
    references: [fighters.id],
  }),
  fighter_equipment: one(fighterEquipment, {
    fields: [fighterExoticBeasts.fighter_equipment_id],
    references: [fighterEquipment.id],
  }),
}));

export const fighterLoadoutsRelations = relations(fighterLoadouts, ({ one, many }) => ({
  fighter: one(fighters, {
    fields: [fighterLoadouts.fighter_id],
    references: [fighters.id],
  }),
  fighter_loadout_equipment: many(fighterLoadoutEquipment),
}));

export const fighterLoadoutEquipmentRelations = relations(fighterLoadoutEquipment, ({ one }) => ({
  loadout: one(fighterLoadouts, {
    fields: [fighterLoadoutEquipment.loadout_id],
    references: [fighterLoadouts.id],
  }),
}));
