-- ============================================================================
-- MUNDAMANAGER SEED FILE
-- ============================================================================
-- Contains reference/lookup game data only (categories, gang types, fighter types,
-- equipment, weapon profiles, skills, effects). No user, gang or fighter rows.
-- ============================================================================

BEGIN;

-- Disable constraint check triggers for performance and dependency loops
SET session_replication_role = 'replica';

-- ============================================================================
-- 1. EQUIPMENT CATEGORIES
-- ============================================================================
INSERT INTO public.equipment_categories (id, category_name, created_at) VALUES
('0d689aac-81cf-4a7d-81a0-953f2f5d6e47', 'Ammunition', now()),
('9a3f7568-2e70-4d67-97cc-f5c9f21ac753', 'Armour', now()),
('eafb69c2-3d86-44da-95a3-e815cdc63b3c', 'Basic Weapons', now()),
('aceb626f-259d-45b2-8a36-0d9c7369969f', 'Close Combat Weapons', now()),
('931fe7d2-4913-4cbc-b5d0-d34ef0865815', 'Grenades', now()),
('2f58f3cb-d5c5-4620-86e6-a91e6428ca34', 'Heavy Weapons', now()),
('18a867b0-42cb-42bb-b3a6-330fa3e65700', 'Personal Equipment', now()),
('8e6fe32b-d70d-48a5-95c0-00441b502ae5', 'Pistols', now()),
('1e3528d0-2064-4766-a23b-62b39ead07f4', 'Special Weapons', now()),
('ad9d7b9b-7cea-48dc-9278-45e3e47a1aad', 'Weapon Accessories', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. GANG ORIGIN CATEGORIES
-- ============================================================================
INSERT INTO public.gang_origin_categories (id, category_name, created_at) VALUES
('4cd26c86-2773-4415-91d7-790b391e5094', 'Ancestry', now()),
('64907bb6-4df4-4f07-9e80-5b86ef629ded', 'Paths of Faith', now()),
('563827a6-16de-42a7-8863-067a25bdc12a', 'Prefecture', now()),
('4e2c49d3-312a-4305-a56f-05ac03a41b71', 'Tribe', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. GANG ORIGINS
-- ============================================================================
INSERT INTO public.gang_origins (id, origin_name, gang_origin_category_id, created_at) VALUES
('7e6695da-4f2d-4c72-b359-f7569064eb08', 'Palanite Prefecture', '563827a6-16de-42a7-8863-067a25bdc12a', now()),
('f2492106-f884-4b6b-8433-3b0720515adb', 'Path of the Fanatic', '64907bb6-4df4-4f07-9e80-5b86ef629ded', now()),
('7af8bc26-de6f-4a46-93ea-0095f677e103', 'Anglish Mining Clan', '4cd26c86-2773-4415-91d7-790b391e5094', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. TRADING POST TYPES
-- ============================================================================
INSERT INTO public.trading_post_types (id, trading_post_name, created_at) VALUES
('cada4005-66e3-4e3c-8a77-146329bd1eda', 'General Trading Post', now()),
('c38706e9-2eda-4141-9ee3-4261e56582e0', 'Badzones Trading Post', now()),
('110ed3fe-3d35-43ca-afed-28af071cd3a6', 'Nomad Trading Post', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. GANG TYPES
-- ============================================================================
INSERT INTO public.gang_types (gang_type_id, gang_type, alignment, affiliation, is_hidden, trading_post_type_id, gang_origin_category_id, created_at) VALUES
('c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Law Abiding', false, false, 'cada4005-66e3-4e3c-8a77-146329bd1eda', '64907bb6-4df4-4f07-9e80-5b86ef629ded', now()),
('2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Unaligned', false, false, 'cada4005-66e3-4e3c-8a77-146329bd1eda', null, now()),
('d66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Unaligned', false, false, 'cada4005-66e3-4e3c-8a77-146329bd1eda', null, now()),
('ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Unaligned', false, false, 'cada4005-66e3-4e3c-8a77-146329bd1eda', null, now()),
('b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Law Abiding', false, false, 'cada4005-66e3-4e3c-8a77-146329bd1eda', null, now()),
-- Hidden pseudo-gang that owns Bounty Hunters / Dramatis Personae. Fighters here are
-- surfaced through the "Gang Additions" tab of every gang, not as a playable gang.
('6145eb6e-84a6-4fbd-b1d3-87348505db42', 'Hired Guns', null, false, true, 'cada4005-66e3-4e3c-8a77-146329bd1eda', null, now())
ON CONFLICT (gang_type_id) DO NOTHING;

-- ============================================================================
-- 6. FIGHTER CLASSES
-- ============================================================================
-- Reference list of valid class names; fighters/fighter_types store the names
-- themselves in their fighter_classes JSONB array. class_name is the identity,
-- unique per edition.
INSERT INTO public.fighter_classes (id, class_name, created_at) VALUES
('e4988356-d580-4f85-8d27-ec604d917d53', 'Leader', now()),
('fe93ecdb-390b-4b31-8650-a25a90d427a5', 'Champion', now()),
('d53f7381-09c2-48f3-b324-2199c5128684', 'Ganger', now()),
('fcd056a9-b219-48d8-ad61-e838091cc4da', 'Juve', now()),
('d11d15a8-07ea-4a5a-beae-35ddea16e544', 'Specialist', now()),
('bb723bee-883c-4e84-9136-be30ed195023', 'Exotic Beast', now()),
('9e310c58-5276-4758-bc9f-be010ac69457', 'Bounty Hunter', now())
ON CONFLICT (id) DO NOTHING;

-- Migrations backfill existing classes onto n23, but that runs before this file,
-- so rows seeded above would keep a NULL edition_id — invisible to every
-- edition-scoped query and outside the (edition_id, class_name) unique index.
-- Put them on the same edition the backfill uses.
UPDATE public.fighter_classes
SET edition_id = (SELECT id FROM public.editions WHERE slug = 'n23')
WHERE edition_id IS NULL;

-- Beast and Pet are N26 classes, so they are scoped to that edition rather than
-- left edition-less: fighter_classes holds one row per class per edition. The
-- edition id is resolved by its slug because migrations seed it with a
-- generated uuid.
INSERT INTO public.fighter_classes (class_name, edition_id)
SELECT v.class_name, e.id
FROM public.editions e
CROSS JOIN (VALUES ('Beast'), ('Pet')) AS v(class_name)
WHERE e.slug = 'n26'
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_classes fc
    WHERE fc.class_name = v.class_name
      AND fc.edition_id = e.id
  );

-- ============================================================================
-- 7. SKILL TYPES
-- ============================================================================
INSERT INTO public.skill_types (id, name, legendary_name, created_at) VALUES
('5e9c5a63-9962-4ab6-9f04-453717130c48', 'Agility', false, now()),
('08441833-c5cb-444c-9a15-bb3706819fef', 'Bravado', false, now()),
('db35fe3f-cf69-40d9-8a7d-c7ecf1bdb7e5', 'Brawn', false, now()),
('6e94d707-5483-4c22-b5c3-35fe99b4d0cf', 'Combat', false, now()),
('7341bb7b-f1e4-40bf-a605-2cb33c213c7c', 'Cunning', false, now()),
('9d1eeed9-02e3-4dd4-a0ab-39639805bca0', 'Ferocity', false, now()),
('c234579d-a27e-4b7d-abb3-9ffa8a57b3ba', 'Leadership', false, now()),
('419983ce-5fb1-4ad3-a68b-ccce33b7275f', 'Shooting', false, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. SKILLS REFERENCE DATA
-- ============================================================================
INSERT INTO public.skills (id, name, skill_type_id, xp_cost, credit_cost, created_at) VALUES
('a1111111-1111-1111-1111-111111111111', 'Nerves of Steel', '9d1eeed9-02e3-4dd4-a0ab-39639805bca0', 9, 35, now()),
('b2222222-2222-2222-2222-222222222222', 'Iron Jaw', '9d1eeed9-02e3-4dd4-a0ab-39639805bca0', 9, 35, now()),
('c3333333-3333-3333-3333-333333333333', 'Sprint', '5e9c5a63-9962-4ab6-9f04-453717130c48', 9, 35, now()),
('d4444444-4444-4444-4444-444444444444', 'Dodge', '5e9c5a63-9962-4ab6-9f04-453717130c48', 9, 35, now()),
-- Default skills of Arbelesta Raen Catallus (no xp/credit cost: granted, not bought)
('9518eb83-c10c-4f1b-a7dc-3f0351209ae3', 'Precision Shot', '419983ce-5fb1-4ad3-a68b-ccce33b7275f', null, null, now()),
('43095380-4e72-4fea-8741-16ab4b21a69b', 'Trick Shot', '419983ce-5fb1-4ad3-a68b-ccce33b7275f', null, null, now()),
('9a7d31f4-00a5-444d-ae04-0a060ee1359b', 'Infiltrate', '7341bb7b-f1e4-40bf-a605-2cb33c213c7c', null, null, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. CAMPAIGN TYPES
-- ============================================================================
INSERT INTO public.campaign_types (id, campaign_type_name, description, image_url, trading_posts, created_at) VALUES
('bc299009-0dbd-4ae9-b457-491841622b73', 'Dominion Campaign', 'Territory control and resource production.', null, null, now()),
('7d98953c-267c-4da4-a32d-c58c2e8d369f', 'Uprising Campaign', 'A struggle for survival amidst starvation.', null, null, now()),
('30147c4b-a2ba-4e41-a055-87237d4ab4e8', 'Custom Campaign', 'A flexible custom campaign setup.', null, null, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. CAMPAIGN TYPE RESOURCES (Normalized Campaign Resources)
-- ============================================================================
INSERT INTO public.campaign_type_resources (id, campaign_type_id, resource_name, created_at) VALUES
('c7a701ba-d670-496a-86cb-b08e33055d78', '7d98953c-267c-4da4-a32d-c58c2e8d369f', 'Meat', now()),
('c7a701ba-d670-496a-86cb-b08e33055d79', '7d98953c-267c-4da4-a32d-c58c2e8d369f', 'Scavenging Rolls', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. GANG VARIANT TYPES
-- ============================================================================
INSERT INTO public.gang_variant_types (id, variant, created_at) VALUES
('2c67ccbc-e103-433c-9535-bc6f9435fa38', 'Chaos Corrupted', now()),
('d66feb66-7a3b-4306-9d0b-58725b72ee0d', 'Genestealer Infected', now()),
('b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'Outlaw', now()),
('c96a5dc0-7372-4aa1-96b4-d45f98f61f22', 'Skirmish', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 12. VEHICLE TYPES
-- ============================================================================
INSERT INTO public.vehicle_types (id, vehicle_type, movement, handling, save, hull_points, front, side, rear, body_slots, drive_slots, engine_slots, cost, created_at) VALUES
('5f2c62fb-4e5e-4368-9f13-caac7f633fb3', 'Orlock Outrider Quad', 9, 4, 5, 2, 4, 3, 3, 0, 1, 2, 80, now()),
('273480c8-65f6-4bf3-8ed8-96887a45585e', 'Cargo-8 Ridgehauler', 7, 7, 3, 6, 9, 8, 8, 4, 4, 4, 230, now()),
('a941e1ec-a9cb-415d-9e5e-530e5aa47452', 'Medium Vehicle', 6, 7, 4, 3, 5, 5, 5, 2, 2, 3, 130, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 13. FIGHTER EFFECT SYSTEM
-- ============================================================================
INSERT INTO public.fighter_effect_categories (id, category_name, created_at) VALUES
('789b2065-c26d-453b-a4d5-81c04c5d4419', 'advancements', now()),
('890c3065-c26d-453b-a4d5-81c04c5d4420', 'injuries', now()),
('901d4065-c26d-453b-a4d5-81c04c5d4421', 'bionics', now()),
('54065db2-c547-430e-ba88-4dc48c39a3b3', 'equipment upgrade', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fighter_effect_types (id, effect_name, fighter_effect_category_id, type_specific_data, created_at) VALUES
('2172a7a0-7892-4d31-bd7b-512b744a8fdd', 'Attacks', '789b2065-c26d-453b-a4d5-81c04c5d4419', '{"xp_cost": 12, "credits_increase": 45}'::jsonb, now()),
('2172a7a0-7892-4d31-bd7b-512b744a8fde', 'Head Wound', '890c3065-c26d-453b-a4d5-81c04c5d4420', '{}'::jsonb, now()),
-- Weapon-accessory upgrade. "applies_to": "equipment" is what makes the purchase flow
-- ask which weapon to fit it to; add-fighter.ts finds this row by matching
-- type_specific_data->>'equipment_id' against the equipment being granted.
('c9ac2edb-22e1-4b63-808f-ce3db6db9261', 'Infra-sight†', '54065db2-c547-430e-ba88-4dc48c39a3b3', '{"applies_to": "equipment", "equipment_id": "3b509dcd-47ed-4938-837d-7bbdc74df58c", "effect_selection": "fixed"}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fighter_effect_type_modifiers (id, fighter_effect_type_id, stat_name, default_numeric_value, operation, created_at) VALUES
('a3628d78-4080-4b63-89b7-b1112232bcac', '2172a7a0-7892-4d31-bd7b-512b744a8fdd', 'attacks', 1, null, now()),
('a3628d78-4080-4b63-89b7-b1112232bcad', '2172a7a0-7892-4d31-bd7b-512b744a8fde', 'ballistic_skill', -1, null, now())
ON CONFLICT (id) DO NOTHING;
-- Note: Infra-sight† intentionally has no modifier rows (matches production). It is a
-- rules-text upgrade, so the visible outcome is the wargear nesting under the weapon
-- it is fitted to, not a change to the weapon's stat line.

-- ============================================================================
-- 14. REFERENCE EQUIPMENT (WEAPONS AND ARMOUR)
-- ============================================================================
INSERT INTO public.equipment (id, equipment_name, cost, equipment_category, equipment_category_id, equipment_type, availability, core_equipment, is_editable, is_consumable, created_at) VALUES
-- Armour
('e5555555-5555-5555-5555-555555555555', 'Flak Armour', 10, 'Armour', '9a3f7568-2e70-4d67-97cc-f5c9f21ac753', 'wargear', 'Common', true, false, false, now()),
('f6666666-6666-6666-6666-666666666666', 'Mesh Armour', 15, 'Armour', '9a3f7568-2e70-4d67-97cc-f5c9f21ac753', 'wargear', 'Common', true, false, false, now()),
-- Basic Weapons
('a7777777-7777-7777-7777-777777777777', 'Autogun', 15, 'Basic Weapons', 'eafb69c2-3d86-44da-95a3-e815cdc63b3c', 'weapon', 'Common', true, false, false, now()),
('b8888888-8888-8888-8888-888888888888', 'Lasgun', 15, 'Basic Weapons', 'eafb69c2-3d86-44da-95a3-e815cdc63b3c', 'weapon', 'Common', true, false, false, now()),
('e7777777-7777-7777-7777-777777777777', 'Boltgun', 55, 'Basic Weapons', 'eafb69c2-3d86-44da-95a3-e815cdc63b3c', 'weapon', 'Common', true, false, false, now()),
-- Pistols
('c9999999-9999-9999-9999-999999999999', 'Stub Gun', 5, 'Pistols', '8e6fe32b-d70d-48a5-95c0-00441b502ae5', 'weapon', 'Common', true, false, false, now()),
-- Close Combat Weapons
('daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fighting Knife', 10, 'Close Combat Weapons', 'aceb626f-259d-45b2-8a36-0d9c7369969f', 'weapon', 'Common', true, false, false, now()),
-- Exotic Beast Wargear
('e8888888-8888-8888-8888-888888888888', 'Sheenbird (Exotic Beast)', 90, 'Personal Equipment', '18a867b0-42cb-42bb-b3a6-330fa3e65700', 'wargear', 'Common', true, false, false, now()),
-- Hired Guns / Dramatis Personae wargear and weapons (real production ids).
-- Deliberately no 'Mesh armour' row here: the 'Mesh Armour' above is the same item
-- (15cr, Armour) and is reused instead of seeding a near-identical duplicate.
('43892923-61f5-4b59-88ea-b4dfa78bcb36', 'Needle long rifle', 0, 'Special Weapons', '1e3528d0-2064-4766-a23b-62b39ead07f4', 'weapon', 'E', true, false, false, now()),
('791b34ff-a194-4fbf-9a7d-57e055af9e6d', 'Needle pistol', 30, 'Pistols', '8e6fe32b-d70d-48a5-95c0-00441b502ae5', 'weapon', 'R9', false, false, false, now()),
('3b509dcd-47ed-4938-837d-7bbdc74df58c', 'Infra-sight†', 40, 'Weapon Accessories', 'ad9d7b9b-7cea-48dc-9278-45e3e47a1aad', 'wargear', 'R8', false, false, false, now()),
('26d926ca-81ec-4211-8ad7-8948f647703f', 'Chem-synth', 15, 'Personal Equipment', '18a867b0-42cb-42bb-b3a6-330fa3e65700', 'wargear', 'R12', false, false, false, now()),
('7f7bdff7-389e-45ed-a3c6-e2dfe5d567e0', 'Photo-goggles', 35, 'Personal Equipment', '18a867b0-42cb-42bb-b3a6-330fa3e65700', 'wargear', 'R9', false, false, false, now()),
('d131bb1e-809b-4652-8c39-93fdc21c1256', 'Respirator', 15, 'Personal Equipment', '18a867b0-42cb-42bb-b3a6-330fa3e65700', 'wargear', 'C', false, false, false, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 15. WEAPON PROFILES
-- ============================================================================
INSERT INTO public.weapon_profiles (id, weapon_id, profile_name, range_short, range_long, acc_short, acc_long, strength, ap, damage, ammo, traits, sort_order, created_at) VALUES
('a7777777-7777-7777-7777-888888888888', 'a7777777-7777-7777-7777-777777777777', 'Standard', '8"', '24"', '+1', '-', '3', '-', '1', '4+', 'Rapid Fire (1)', 1, now()),
('b8888888-8888-8888-8888-999999999999', 'b8888888-8888-8888-8888-888888888888', 'Standard', '8"', '24"', '+1', '-', '3', '-', '1', '2+', 'Plentiful', 1, now()),
('e7777777-7777-7777-7777-aaaaaaaaaaaa', 'e7777777-7777-7777-7777-777777777777', 'Standard', '12"', '24"', '+1', '-', '4', '-1', '2', '4+', 'Rapid Fire (1)', 1, now()),
('c9999999-9999-9999-9999-bbbbbbbbbbbb', 'c9999999-9999-9999-9999-999999999999', 'Standard', '6"', '12"', '+1', '-', '3', '-', '1', '4+', '-', 1, now()),
('daaaaaaa-aaaa-aaaa-aaaa-cccccccccccc', 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Standard', 'E', '-', '-', '-', 'S', '-1', '1', '-', 'Backstab', 1, now()),
-- Hired Guns / Dramatis Personae weapons
('e1a34e27-612d-4051-ab74-e1bdb59b74e2', '43892923-61f5-4b59-88ea-b4dfa78bcb36', 'Needle long rifle', '24"', '45"', '-', '+1', '-', '-2', '-', '6+', 'Scarce, Silent, Toxin', 1, now()),
('916b024a-ea68-4bba-99a1-3500887ef193', '791b34ff-a194-4fbf-9a7d-57e055af9e6d', 'Needle pistol', '4"', '9"', '+2', '-', '-', '-1', '-', '6+', 'Scarce, Sidearm, Silent, Toxin', null, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 16. FIGHTER TYPES CONFIGURATION (ORLOCK AND CAWDOR)
-- ============================================================================
-- House Orlock Fighter Types
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, created_at) VALUES
('01111111-1111-1111-1111-111111111111', 'b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Road Boss', 120, 5, 3, 3, 3, 4, 2, 4, 4, 5, 5, 5, 2, '["Leader"]', true, false, now()),
('02222222-2222-2222-2222-222222222222', 'b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Road Captain', 95, 5, 3, 3, 3, 4, 2, 4, 5, 6, 6, 6, 2, '["Champion"]', true, false, now()),
('03333333-3333-3333-3333-333333333333', 'b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Wrecker', 60, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Specialist"]', false, false, now()),
('04444444-4444-4444-4444-444444444444', 'b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Gunner', 55, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Ganger"]', false, false, now()),
('05555555-5555-5555-5555-555555555555', 'b86a0a06-4f47-4c78-8d04-fb7b7042c14e', 'House Orlock', 'Greenhorn', 30, 6, 5, 5, 3, 3, 1, 3, 7, 8, 8, 8, 1, '["Juve"]', false, false, now())
ON CONFLICT (id) DO NOTHING;

-- House Cawdor Fighter Types
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, created_at) VALUES
('c1111111-1111-1111-1111-111111111111', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Word Keeper', 120, 5, 3, 3, 3, 4, 2, 4, 4, 5, 5, 5, 2, '["Leader"]', true, false, now()),
('c2222222-2222-2222-2222-222222222222', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Priest/Deacon', 95, 5, 3, 3, 3, 4, 2, 4, 5, 6, 6, 6, 2, '["Champion"]', true, false, now()),
('c3333333-3333-3333-3333-333333333333', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Firebrand', 60, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Specialist"]', false, false, now()),
('c4444444-4444-4444-4444-444444444444', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Brethren', 55, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Ganger"]', false, false, now()),
('c5555555-5555-5555-5555-555555555555', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Bonepicker', 30, 6, 5, 5, 3, 3, 1, 3, 7, 8, 8, 8, 1, '["Juve"]', false, false, now()),
('c6666666-6666-6666-6666-666666666666', 'c0a579a9-ac5e-4289-96db-43f87537847b', 'House Cawdor', 'Sheenbird', 90, 6, 4, 5, 3, 3, 1, 3, 7, 7, 8, 8, 2, '["Exotic Beast"]', false, false, now())
ON CONFLICT (id) DO NOTHING;

-- House Delaque Fighter Types
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, created_at) VALUES
('d1111111-1111-1111-1111-111111111111', '2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Master of Shadows', 120, 5, 3, 3, 3, 3, 2, 3, 4, 5, 5, 5, 2, '["Leader"]', true, false, now()),
('d2222222-2222-2222-2222-222222222222', '2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Phantom', 95, 5, 3, 3, 3, 3, 2, 3, 5, 6, 6, 6, 2, '["Champion"]', true, false, now()),
('d3333333-3333-3333-3333-333333333333', '2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Ghost (Specialist)', 50, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Specialist"]', false, false, now()),
('d4444444-4444-4444-4444-444444444444', '2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Ghost', 50, 5, 4, 4, 3, 3, 1, 4, 6, 7, 7, 7, 1, '["Ganger"]', false, false, now()),
('d5555555-5555-5555-5555-555555555555', '2c67ccbc-e103-433c-9535-bc6f9435fa38', 'House Delaque', 'Shadow', 30, 6, 4, 5, 3, 3, 1, 3, 7, 8, 8, 8, 1, '["Juve"]', false, false, now())
ON CONFLICT (id) DO NOTHING;

-- House Escher Fighter Types
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, created_at) VALUES
('e1111111-1111-1111-1111-111111111111', 'd66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Gang Queen', 120, 5, 3, 3, 3, 3, 2, 3, 4, 5, 6, 6, 2, '["Leader"]', true, false, now()),
('e2222222-2222-2222-2222-222222222222', 'd66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Matriarch', 95, 5, 3, 3, 3, 3, 2, 3, 5, 6, 7, 7, 2, '["Champion"]', true, false, now()),
('e3333333-3333-3333-3333-333333333333', 'd66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Sister (Specialist)', 50, 5, 4, 4, 3, 3, 1, 3, 6, 7, 8, 7, 1, '["Specialist"]', false, false, now()),
('e4444444-4444-4444-4444-444444444444', 'd66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Sister', 50, 5, 4, 4, 3, 3, 1, 3, 6, 7, 8, 7, 1, '["Ganger"]', false, false, now()),
('e5555555-5555-5555-5555-555555555555', 'd66feb66-7a3b-4306-9d0b-58725b72ee0d', 'House Escher', 'Little Sister', 30, 6, 4, 5, 3, 3, 1, 3, 7, 8, 8, 8, 1, '["Juve"]', false, false, now())
ON CONFLICT (id) DO NOTHING;

-- House Goliath Fighter Types
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, created_at) VALUES
('81111111-1111-1111-1111-111111111111', 'ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Forge Tyrant', 120, 4, 3, 3, 4, 4, 2, 4, 4, 5, 6, 6, 2, '["Leader"]', true, false, now()),
('82222222-2222-2222-2222-222222222222', 'ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Forge Boss', 95, 4, 3, 3, 4, 4, 2, 4, 5, 6, 7, 7, 2, '["Champion"]', true, false, now()),
('83333333-3333-3333-3333-333333333333', 'ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Bully (Specialist)', 60, 4, 4, 4, 4, 4, 1, 4, 6, 7, 8, 7, 1, '["Specialist"]', false, false, now()),
('84444444-4444-4444-4444-444444444444', 'ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Bully', 60, 4, 4, 4, 4, 4, 1, 4, 6, 7, 8, 7, 1, '["Ganger"]', false, false, now()),
('85555555-5555-5555-5555-555555555555', 'ad325025-d293-4078-b14b-4306be45f1c8', 'House Goliath', 'Grit', 35, 5, 4, 5, 3, 3, 1, 4, 7, 8, 8, 8, 1, '["Juve"]', false, false, now())
ON CONFLICT (id) DO NOTHING;

-- Hired Guns (Dramatis Personae / Bounty Hunters)
-- is_gang_addition = true is what surfaces her in every gang's "Gang Additions" tab:
-- get_fighter_types_with_cost filters gang additions on that flag alone and ignores
-- gang_type_id. Needs four columns the house rows above don't use.
INSERT INTO public.fighter_types (id, gang_type_id, gang_type, fighter_type, cost, movement, weapon_skill, ballistic_skill, strength, toughness, wounds, initiative, leadership, cool, willpower, intelligence, attacks, fighter_classes, free_skill, is_gang_addition, special_rules, limitation, alignment, is_dramatis_personae, created_at) VALUES
('7eaf0b51-6e82-4b8d-861c-e870927f665e', '6145eb6e-84a6-4fbd-b1d3-87348505db42', 'Hired Guns', 'Arbelesta Raen Catallus', 250, 5, 6, 2, 3, 3, 2, 3, 7, 7, 6, 6, 1, '["Bounty Hunter"]', false, true, ARRAY['"Unique Partnership"', '"Bounty Hunter"', '"Slotted"']::jsonb[], 1, 'Law Abiding', true, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 17. FIGHTER DEFAULTS (STARTING EQUIPMENT AND SKILLS)
-- ============================================================================
-- Rows here are materialised into fighter_equipment / fighter_skills at recruitment
-- by app/actions/add-fighter.ts. Each row is either an equipment default or a skill
-- default, never both. Row ids match production so local can be diffed against remote.
INSERT INTO public.fighter_defaults (id, fighter_type_id, equipment_id, skill_id, created_at) VALUES
('729145b8-3e51-4ecc-9c61-a57c021e378e', '7eaf0b51-6e82-4b8d-861c-e870927f665e', '43892923-61f5-4b59-88ea-b4dfa78bcb36', null, now()),
('d1654989-91b5-4eb5-8c8a-c391403a0ba0', '7eaf0b51-6e82-4b8d-861c-e870927f665e', '791b34ff-a194-4fbf-9a7d-57e055af9e6d', null, now()),
('d8b10e90-e8d3-44df-962d-e691b5db2f58', '7eaf0b51-6e82-4b8d-861c-e870927f665e', '26d926ca-81ec-4211-8ad7-8948f647703f', null, now()),
-- Points at the seed's existing 'Mesh Armour' rather than production's 'Mesh armour'
-- (49ba2507-a60f-40e9-8125-8dde2373400f) to avoid seeding a duplicate of the same item.
('e677c9ae-9b9d-4e66-8b03-9dfc257a8498', '7eaf0b51-6e82-4b8d-861c-e870927f665e', 'f6666666-6666-6666-6666-666666666666', null, now()),
('73900233-8f25-4b0e-9ffb-c7c080db9b56', '7eaf0b51-6e82-4b8d-861c-e870927f665e', '7f7bdff7-389e-45ed-a3c6-e2dfe5d567e0', null, now()),
('450c0125-f5e3-4133-8c5f-1bdc96cd7a10', '7eaf0b51-6e82-4b8d-861c-e870927f665e', 'd131bb1e-809b-4652-8c39-93fdc21c1256', null, now()),
-- TODO(fighter-default-weapons): once fighter_defaults gains a self-referencing link
-- column, the Infra-sight† row below is the one that points at the Needle long rifle
-- row (729145b8-3e51-4ecc-9c61-a57c021e378e), so recruitment can set
-- fighter_effects.target_equipment_id and nest the sight under the weapon.
--   linked_default_id => '729145b8-3e51-4ecc-9c61-a57c021e378e'
('b1be9e8b-27bc-4768-b51b-c2a1add11eee', '7eaf0b51-6e82-4b8d-861c-e870927f665e', '3b509dcd-47ed-4938-837d-7bbdc74df58c', null, now()),
-- Skill defaults
('1d1b3f96-2ce0-4b79-bfef-5a31c084f7ad', '7eaf0b51-6e82-4b8d-861c-e870927f665e', null, '9518eb83-c10c-4f1b-a7dc-3f0351209ae3', now()),
('492ff467-0ecf-4a27-96a4-833a41a41958', '7eaf0b51-6e82-4b8d-861c-e870927f665e', null, '43095380-4e72-4fea-8741-16ab4b21a69b', now()),
('894ad5f7-c0d5-4b15-bc21-bcd41ec2db9d', '7eaf0b51-6e82-4b8d-861c-e870927f665e', null, '9a7d31f4-00a5-444d-ae04-0a060ee1359b', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 22. TRADING POST EQUIPMENT MAPPING
-- ============================================================================
INSERT INTO public.trading_post_equipment (trading_post_type_id, equipment_id)
SELECT 'cada4005-66e3-4e3c-8a77-146329bd1eda', id
FROM public.equipment;

-- ============================================================================
-- 23. FIGHTER TYPE EQUIPMENT MAPPING (HOUSE LISTS)
-- ============================================================================
-- All house fighter types can have Flak Armour and Stub Guns.
-- Hired Guns are excluded: Dramatis Personae have no equipment list of their own
-- (production has zero fighter_type_equipment rows for them).
INSERT INTO public.fighter_type_equipment (fighter_type_id, equipment_id)
SELECT ft.id, e.id
FROM public.fighter_types ft, public.equipment e
WHERE e.equipment_name IN ('Flak Armour', 'Stub Gun')
  AND ft.gang_type <> 'Hired Guns';

-- Leaders, Champions, Specialists, and Gangers can have Autoguns, Lasguns, and Fighting Knives
INSERT INTO public.fighter_type_equipment (fighter_type_id, equipment_id)
SELECT ft.id, e.id
FROM public.fighter_types ft, public.equipment e
WHERE ft.fighter_classes ?| array['Leader', 'Champion', 'Specialist', 'Ganger']
  AND e.equipment_name IN ('Autogun', 'Lasgun', 'Fighting Knife');

-- Leaders and Champions can have Mesh Armour and Boltguns
INSERT INTO public.fighter_type_equipment (fighter_type_id, equipment_id)
SELECT ft.id, e.id
FROM public.fighter_types ft, public.equipment e
WHERE ft.fighter_classes ?| array['Leader', 'Champion']
  AND e.equipment_name IN ('Mesh Armour', 'Boltgun');

-- Juves can have Fighting Knives
INSERT INTO public.fighter_type_equipment (fighter_type_id, equipment_id)
SELECT ft.id, e.id
FROM public.fighter_types ft, public.equipment e
WHERE ft.fighter_classes ? 'Juve'
  AND e.equipment_name = 'Fighting Knife';

-- Cawdor Leaders and Champions can have Sheenbird (Exotic Beast)
INSERT INTO public.fighter_type_equipment (fighter_type_id, equipment_id)
SELECT ft.id, 'e8888888-8888-8888-8888-888888888888'
FROM public.fighter_types ft
WHERE ft.gang_type = 'House Cawdor' AND ft.fighter_classes ?| array['Leader', 'Champion'];

-- ============================================================================
-- 24. EXOTIC BEAST MAPPINGS (EQUIPMENT TO FIGHTER TYPE)
-- ============================================================================
INSERT INTO public.exotic_beasts (id, equipment_id, fighter_type_id, created_at) VALUES
('eb111111-1111-1111-1111-111111111111', 'e8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666', now())
ON CONFLICT (id) DO NOTHING;

-- Restore standard session replication role
SET session_replication_role = 'origin';

COMMIT;
