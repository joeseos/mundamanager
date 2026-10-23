import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import postgres from 'postgres';
import { assertLocalDatabase, DEVELOPMENT_PASSWORD, eligibleVehicleFighters, fixtureAnchor,
  fixtureId, groupedBy, optionsFromArgs, ordinaryEquipment, randomSource } from './dev-dataset-utils.mjs';
import { hasBlazeCondition, canLeaveBattlefield } from '../types/edition.ts';
import { countsTowardRating } from '../utils/fighter-status.ts';
import { calculateFighterCost, calculateVehicleCost } from '../utils/fighter-cost.ts';

const VERSION = 1;
const DAY = 86_400_000;
const STATS = ['movement', 'weapon_skill', 'ballistic_skill', 'strength', 'toughness',
  'wounds', 'initiative', 'attacks', 'leadership', 'cool', 'willpower', 'intelligence', 'save'];
const ADJECTIVES = ['Ash', 'Iron', 'Neon', 'Rust', 'Sump', 'Chrome', 'Void', 'Ember', 'Rad', 'Black'];
const NOUNS = ['Jackals', 'Saints', 'Vipers', 'Reavers', 'Scavengers', 'Wraiths', 'Hounds', 'Knives', 'Ravens', 'Nomads'];
const NAMES = ['Rook', 'Vex', 'Jinx', 'Krag', 'Nyx', 'Mako', 'Zed', 'Echo', 'Flint', 'Sable', 'Hex', 'Dreg'];
const SCENARIOS = ['Supply Raid', 'Tunnel Ambush', 'Sump Showdown', 'Data Heist', 'Last Stand', 'Border Skirmish'];
const hasSubtype = (fighter, name) => fighter.fighter_subtypes?.includes(name);
const statsOf = (source) => Object.fromEntries(STATS.map(key => [key, source[key]]));

class PreviewRollback extends Error {
  constructor(report) { super('Preview rolled back'); this.report = report; }
}

// Suppress only known notification/email side effects, never FK/check triggers.
// Changes and restoration happen inside the same transaction; rollback also restores them.
async function pauseNotifications(sql) {
  const triggers = await sql`
    SELECT c.relname AS table_name, t.tgname, t.tgenabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
      AND c.relname IN ('campaign_members','campaign_gangs','friends','notifications')
    ORDER BY c.relname,t.tgname`;
  const allowed = new Set(['campaign_members.trigger_campaign_member_notification',
    'campaign_gangs.on_gang_invite', 'friends.trigger_friend_request_notification',
    'notifications.trigger_enqueue_notification_email']);
  for (const trigger of triggers) {
    if (!allowed.has(`${trigger.table_name}.${trigger.tgname}`)) {
      throw new Error(`Unexpected side-effect trigger ${trigger.table_name}.${trigger.tgname}; review it before generating fixtures.`);
    }
    if (trigger.tgenabled !== 'D') {
      await sql`ALTER TABLE ${sql(`public.${trigger.table_name}`)} DISABLE TRIGGER ${sql(trigger.tgname)}`;
    }
  }
  return async () => {
    for (const trigger of triggers) {
      if (trigger.tgenabled === 'O') await sql`ALTER TABLE ${sql(`public.${trigger.table_name}`)} ENABLE TRIGGER ${sql(trigger.tgname)}`;
      if (trigger.tgenabled === 'A') await sql`ALTER TABLE ${sql(`public.${trigger.table_name}`)} ENABLE ALWAYS TRIGGER ${sql(trigger.tgname)}`;
      if (trigger.tgenabled === 'R') await sql`ALTER TABLE ${sql(`public.${trigger.table_name}`)} ENABLE REPLICA TRIGGER ${sql(trigger.tgname)}`;
    }
  };
}

async function catalogs(sql, slug) {
  const [edition] = await sql`SELECT * FROM public.editions WHERE slug=${slug}`;
  if (!edition) throw new Error(`No ${slug} catalog. Run supabase start with the repository seed first.`);
  const gangTypes = await sql`SELECT * FROM public.gang_types WHERE edition_id=${edition.id} ORDER BY id`;
  const fighterTypes = await sql`SELECT * FROM public.fighter_types WHERE edition_id=${edition.id} ORDER BY id`;
  const playable = gangTypes.filter(gang => {
    const types = fighterTypes.filter(f => f.gang_type_id === gang.id && !f.is_vehicle);
    return !gang.is_hidden && types.some(f => hasSubtype(f, 'Leader')) && types.some(f => hasSubtype(f, 'Champion')) &&
      types.some(f => hasSubtype(f, 'Ganger'));
  });
  const campaignTypes = await sql`SELECT * FROM public.campaign_types WHERE edition_id=${edition.id} ORDER BY id`;
  const equipment = await sql`SELECT * FROM public.equipment WHERE edition_id=${edition.id} ORDER BY id`;
  const skills = await sql`SELECT s.* FROM public.skills s JOIN public.skill_types st ON st.id=s.skill_type_id WHERE st.edition_id=${edition.id} ORDER BY s.id`;
  const effects = await sql`SELECT fet.*,fec.category_name FROM public.fighter_effect_types fet
    JOIN public.fighter_effect_categories fec ON fec.id=fet.fighter_effect_category_id
    WHERE fet.edition_id=${edition.id} AND fec.category_name IN ('advancements','injuries') ORDER BY fet.id`;
  const vehicles = await sql`SELECT * FROM public.vehicle_types WHERE edition_id=${edition.id} ORDER BY id`;
  const defaults = await sql`SELECT fd.* FROM public.fighter_defaults fd JOIN public.fighter_types ft ON ft.id=fd.fighter_type_id
    WHERE ft.edition_id=${edition.id} ORDER BY fd.id`;
  const modifiers = await sql`SELECT m.* FROM public.fighter_effect_type_modifiers m
    JOIN public.fighter_effect_types ft ON ft.id=m.fighter_effect_type_id WHERE ft.edition_id=${edition.id} ORDER BY m.id`;
  const beasts = await sql`SELECT equipment_id FROM public.exotic_beasts`;
  const ordinary = ordinaryEquipment(equipment, new Set(beasts.map(b => b.equipment_id)));
  if (!playable.length || !campaignTypes.length || !ordinary.some(e => e.equipment_type === 'weapon') || !skills.length) {
    throw new Error(`Incomplete ${slug} reference data: need playable gang/fighter types, campaign types, weapons, and skills.`);
  }
  return { edition, gangTypes: playable, allGangTypes: gangTypes, fighterTypes, campaignTypes,
    equipment: ordinary, skills, effects, vehicles,
    defaults: groupedBy(defaults, 'fighter_type_id'), modifiers: groupedBy(modifiers, 'fighter_effect_type_id') };
}

async function localAccountRows(sql, campaignId) {
  return sql`SELECT u.id,u.email,p.username,cm.id AS member_id,cm.role
    FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
    LEFT JOIN LATERAL (
      SELECT id,role FROM public.campaign_members
      WHERE campaign_id=${campaignId} AND user_id=u.id ORDER BY id LIMIT 1
    ) cm ON true ORDER BY u.id`;
}

async function includeExistingUsers(sql, { campaignId, ownerId, generatedUsers, id, insert, timestamp }, existing) {
  const generatedRoles = new Map(generatedUsers.map(user => [user.id, user.role]));
  existing ??= await localAccountRows(sql, campaignId);
  const included = [];
  for (const user of existing) {
    if (generatedRoles.has(user.id) && user.member_id) continue;
    const missingProfile = user.username === null;
    if (missingProfile) {
      const base = `local_${user.id.replaceAll('-', '').slice(0, 14)}`;
      let username = base;
      let suffix = 0;
      while ((await sql`SELECT 1 FROM public.profiles WHERE username=${username}`).length) {
        const ending = `_${++suffix}`;
        username = `${base.slice(0, 20 - ending.length)}${ending}`;
      }
      await insert('profiles', { id: user.id, username });
      user.username = username;
    }
    if (!user.member_id) await insert('campaign_members', {
      id: id(`existing-member:${user.id}`), user_id: user.id, campaign_id: campaignId,
      role: generatedRoles.get(user.id) ?? 'MEMBER', invited_by: ownerId, invited_at: timestamp,
      joined_at: timestamp,
    });
    included.push({ id: user.id, email: user.email, username: user.username,
      role: user.member_id ? user.role : generatedRoles.get(user.id) ?? 'MEMBER',
      added: !user.member_id, profileCreated: missingProfile });
  }
  return included;
}

// Read generated assets in batches, then use the same pure costing implementation
// as getFighterTotalCost. No copied SQL rating formula or per-fighter reads.
export async function refreshDevelopmentFinancials(sql, gangs) {
  const ids = sql.array(gangs.map(g => g.id), 2950);
  const fighters = await sql`SELECT f.*,ft.cost AS beast_base_cost FROM fighters f
    LEFT JOIN fighter_types ft ON ft.id=f.fighter_type_id WHERE f.gang_id=ANY(${ids}) ORDER BY f.id`;
  const vehicles = await sql`SELECT * FROM vehicles WHERE gang_id=ANY(${ids}) ORDER BY id`;
  const equipment = await sql`SELECT fe.* FROM fighter_equipment fe WHERE fe.gang_id=ANY(${ids})
    OR fe.fighter_id IN (SELECT id FROM fighters WHERE gang_id=ANY(${ids}))
    OR fe.vehicle_id IN (SELECT id FROM vehicles WHERE gang_id=ANY(${ids})) ORDER BY fe.id`;
  const skills = await sql`SELECT fs.* FROM fighter_skills fs JOIN fighters f ON f.id=fs.fighter_id
    WHERE f.gang_id=ANY(${ids}) ORDER BY fs.id`;
  const effects = await sql`SELECT fx.* FROM fighter_effects fx
    WHERE fx.fighter_id IN (SELECT id FROM fighters WHERE gang_id=ANY(${ids}))
    OR fx.vehicle_id IN (SELECT id FROM vehicles WHERE gang_id=ANY(${ids})) ORDER BY fx.id`;
  const beasts = await sql`SELECT b.* FROM fighter_exotic_beasts b JOIN fighters f ON f.id=b.fighter_owner_id
    WHERE f.gang_id=ANY(${ids}) ORDER BY b.id`;
  const equipmentRows = equipment.map(e => ({ ...e, purchase_cost: Number(e.purchase_cost ?? 0) }));
  const skillsByFighter = groupedBy(skills.map(s => ({ ...s, credits_increase: Number(s.credits_increase ?? 0) })), 'fighter_id');
  const effectsByFighter = groupedBy(effects.filter(e => !e.vehicle_id), 'fighter_id');
  const equipmentByFighter = groupedBy(equipmentRows.filter(e => !e.vehicle_id), 'fighter_id');
  const effectsByVehicle = groupedBy(effects, 'vehicle_id');
  const equipmentByVehicle = groupedBy(equipmentRows, 'vehicle_id');
  const vehicleRows = vehicles.map(v => ({ ...v, cost: Number(v.cost ?? 0),
    fighter_equipment: equipmentByVehicle.get(v.id) ?? [], fighter_effects: effectsByVehicle.get(v.id) ?? [] }));
  const vehiclesByFighter = groupedBy(vehicleRows, 'fighter_id');
  const beastsByOwner = groupedBy(beasts, 'fighter_owner_id');
  const beastsByPet = groupedBy(beasts, 'fighter_pet_id');
  const fighterMap = new Map(fighters.map(f => [f.id, { ...f,
    credits: Number(f.credits ?? 0), cost_adjustment: Number(f.cost_adjustment ?? 0),
    fighter_types: f.beast_base_cost === null ? null : { cost: Number(f.beast_base_cost) },
    fighter_equipment: equipmentByFighter.get(f.id) ?? [], fighter_skills: skillsByFighter.get(f.id) ?? [],
    fighter_effects: effectsByFighter.get(f.id) ?? [] }]));
  const equipmentMap = new Map(equipmentRows.map(e => [e.id, e]));
  for (const gang of gangs) {
    const rating = [...fighterMap.values()].filter(f => f.gang_id === gang.id && countsTowardRating(f))
      .reduce((sum, f) => sum + calculateFighterCost({ ...f, beast_link: beastsByPet.get(f.id)?.[0] ?? null,
        vehicles: vehiclesByFighter.get(f.id) ?? [],
        fighter_exotic_beasts: (beastsByOwner.get(f.id) ?? []).map(link => ({ ...link,
          fighter_equipment: equipmentMap.get(link.fighter_equipment_id) ?? null,
          pet: fighterMap.get(link.fighter_pet_id) ?? null })) }), 0);
    const stash = equipmentRows.filter(e => e.gang_id === gang.id && e.gang_stash).reduce((sum, e) => sum + e.purchase_cost, 0);
    const unassignedVehicles = vehicleRows.filter(v => v.gang_id === gang.id && !v.fighter_id)
      .reduce((sum, vehicle) => sum + calculateVehicleCost(vehicle), 0);
    gang.rating = rating;
    await sql`UPDATE gangs SET rating=${rating},wealth=${rating + gang.credits + stash + unassignedVehicles} WHERE id=${gang.id}`;
  }
}

// Exported for rollback-only integration tests; normal callers use generateDataset.
export async function populateDataset(sql, config) {
  const namespace = `mundamanager-dev:${config.edition}:${config.seed}`;
  const id = label => fixtureId(namespace, label);
  const tag = id('tag').replaceAll('-', '').slice(0, 8);
  const random = randomSource(namespace);
  const anchor = fixtureAnchor(config.date);
  const ago = days => new Date(anchor - days * DAY).toISOString();
  const campaignId = id('campaign');
  const manifest = { generator: 'mundamanager-dev', version: VERSION,
    seed: config.seed, edition: config.edition, gangs: config.gangs,
    fightersMin: config.fightersMin, fightersMax: config.fightersMax, battles: config.battles };
  const users = Array.from({ length: config.gangs }, (_, i) => ({
    id: id(`user:${i}`), email: `dev-${tag}-${i + 1}@example.test`,
    username: `dev_${tag}_${i + 1}`, role: i === 0 ? 'OWNER' : i === 1 ? 'ARBITRATOR' : 'MEMBER',
  }));
  const report = { seed: config.seed, edition: config.edition, date: config.date,
    committed: false, alreadyExists: false, campaignId, campaignPath: `/campaigns/${campaignId}`,
    password: DEVELOPMENT_PASSWORD, users, includedExistingUsers: [], gangs: [], inserted: {}, warnings: [] };
  let timestampColumns;
  const insert = async (table, row) => {
    timestampColumns ??= groupedBy(await sql`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('created_at','updated_at')`, 'table_name');
    const timestamps = Object.fromEntries((timestampColumns.get(table) ?? []).map(c => [c.column_name, ago(0)]));
    await sql`INSERT INTO ${sql(`public.${table}`)} ${sql({ ...timestamps, ...row })}`;
    report.inserted[table] = (report.inserted[table] ?? 0) + 1;
  };
  const includeLocalAccounts = existing => includeExistingUsers(sql, {
    campaignId, ownerId: users[0].id, generatedUsers: users, id, insert, timestamp: ago(0),
  }, existing);
  const [existing] = await sql`SELECT u.raw_app_meta_data->'development_dataset' AS manifest
    FROM public.campaigns c LEFT JOIN auth.users u ON u.id=${users[0].id} WHERE c.id=${campaignId}`;
  if (existing) {
    if (!isDeepStrictEqual(existing.manifest, manifest)) throw new Error('This seed already exists with a different generator version/options. Use a new --seed; existing data will not be replaced.');
    report.alreadyExists = true;
    report.committed = true;
    const gangRows = await sql`SELECT id,name,gang_type FROM public.gangs WHERE id IN
      (SELECT gang_id FROM public.campaign_gangs WHERE campaign_id=${campaignId}) ORDER BY name`;
    report.gangs = gangRows.map(gang => ({ ...gang, path: `/gang/${gang.id}` }));
    const accounts = await localAccountRows(sql, campaignId);
    const needsWrites = accounts.some(user => !user.member_id || user.username === null);
    const restoreNotifications = needsWrites ? await pauseNotifications(sql) : null;
    report.includedExistingUsers = await includeLocalAccounts(accounts);
    if (restoreNotifications) await restoreNotifications();
    report.warnings.push('Existing fixtures/credentials left unchanged; missing local account memberships are added only with --apply.');
    if (!config.apply && Object.keys(report.inserted).length) {
      report.committed = false;
      throw new PreviewRollback(report);
    }
    return report;
  }
  const leftovers = await sql`SELECT id FROM auth.users WHERE id=ANY(${sql.array(users.map(u => u.id), 2950)})
    OR (raw_app_meta_data->'development_dataset'->>'seed'=${config.seed}
      AND raw_app_meta_data->'development_dataset'->>'edition'=${config.edition}) LIMIT 1`;
  if (leftovers.length) throw new Error('Partial dataset exists: the campaign is missing but generated accounts remain. Use a new --seed; existing accounts will not be overwritten.');
  const catalog = await catalogs(sql, config.edition);
  const restoreNotifications = await pauseNotifications(sql);
  const log = (gang, action, description, fighterId = null, createdAt = ago(0)) => insert('gang_logs', {
    id: id(`log:${gang.id}:${report.inserted.gang_logs ?? 0}`), gang_id: gang.id,
    user_id: gang.user.id, fighter_id: fighterId, action_type: action, description, created_at: createdAt,
  });

  // Direct auth fixtures allow one atomic transaction. Keep the profile-creation
  // trigger enabled, create email identities, and hash local-only passwords in Postgres.
  const [crypto] = await sql`SELECT n.nspname AS schema_name FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'`;
  if (!crypto) throw new Error('The local pgcrypto extension is required for development passwords.');
  for (const user of users) {
    await sql`INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,
      email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
      VALUES ('00000000-0000-0000-0000-000000000000',${user.id},'authenticated','authenticated',${user.email},
      ${sql(`${crypto.schema_name}.crypt`)}(${DEVELOPMENT_PASSWORD},${sql(`${crypto.schema_name}.gen_salt`)}('bf')),
      ${ago(60)},${sql.json({ provider: 'email', providers: ['email'], development_dataset: manifest })},
      ${sql.json({ username: user.username })},${ago(60)},${ago(0)},'','','','','','')`;
    await sql`INSERT INTO auth.identities (id,provider_id,user_id,identity_data,provider,created_at,updated_at)
      VALUES (${id(`identity:${user.id}`)},${user.id},${user.id},
      ${sql.json({ sub: user.id, email: user.email, email_verified: true, phone_verified: false })},'email',${ago(60)},${ago(0)})`;
    // The bootstrap trigger normally creates this; tolerate a local installation without it.
    await sql`INSERT INTO public.profiles (id,username) VALUES (${user.id},${user.username}) ON CONFLICT (id) DO NOTHING`;
    await sql`UPDATE public.profiles SET user_role=${user === users[0] ? 'admin' : 'user'},
      created_at=${ago(60)},updated_at=${ago(0)} WHERE id=${user.id}`;
  }
  report.inserted['auth.users'] = users.length;
  report.inserted['auth.identities'] = users.length;
  report.inserted.profiles = users.length;

  const campaignType = random.pick(catalog.campaignTypes);
  const campaignName = `Dev ${random.pick(ADJECTIVES)} Sector [${tag}]`;
  await insert('campaigns', { id: campaignId, campaign_name: campaignName,
    campaign_type_id: campaignType.id, status: 'Active', created_by: users[0].id,
    description: 'A synthetic development campaign with rival gangs, territories, and battles.',
    note: '<p>Generated local campaign: explore rosters, challenges, territories, and live sessions.</p>',
    current_cycle: 4, allow_join_requests: true, created_at: ago(60), updated_at: ago(0),
    trading_posts: sql.json(campaignType.trading_posts ?? []) });
  const allegiances = [id('allegiance:0'), id('allegiance:1')];
  for (const [i, allegianceId] of allegiances.entries()) await insert('campaign_allegiances', {
    id: allegianceId, campaign_id: campaignId, allegiance_name: i ? 'Free Settlements' : 'Guild Compact',
  });
  const resourceId = id('resource');
  await insert('campaign_resources', { id: resourceId, campaign_id: campaignId, resource_name: 'Salvage' });
  await insert('campaign_maps', { id: id('map'), campaign_id: campaignId,
    background_image_url: '/dev-campaign-map.svg', hex_grid_enabled: true, hex_size: 60 });

  const gangTypes = random.shuffle(catalog.gangTypes);
  report.warnings.push(`${gangTypes.length} playable ${config.edition} factions available; gang types cycle across them. These are varied development rosters, not guaranteed tournament-legal lists.`);
  const gangs = [];
  const equipmentEffects = await sql`SELECT fet.* FROM public.fighter_effect_types fet
    WHERE fet.edition_id=${catalog.edition.id} AND fet.type_specific_data ? 'equipment_id' ORDER BY fet.id`;
  const applyEffect = async (gang, fighter, effect, label, equipmentId = null) => {
    const effectId = id(label);
    await insert('fighter_effects', { id: effectId, fighter_id: fighter.id, user_id: gang.user.id,
      fighter_effect_type_id: effect.id, effect_name: effect.effect_name,
      type_specific_data: sql.json(effect.type_specific_data ?? {}),
      fighter_equipment_id: equipmentId, sort_order: effect.sort_order, created_at: ago(10) });
    const modifiers = catalog.modifiers.get(effect.id) ?? [];
    for (const [i, modifier] of modifiers.entries()) await insert('fighter_effect_modifiers', {
      id: id(`${label}:modifier:${i}`), fighter_effect_id: effectId, user_id: gang.user.id,
      stat_name: modifier.stat_name, numeric_value: modifier.default_numeric_value, operation: modifier.operation ?? 'add',
    });
    return effectId;
  };
  const addEquipment = async (gang, fighter, item, label, custom = false) => {
    const equipmentId = id(label);
    await insert('fighter_equipment', { id: equipmentId, gang_id: gang.id,
      fighter_id: fighter?.id ?? null, vehicle_id: null, user_id: gang.user.id,
      equipment_id: custom ? null : item.id, custom_equipment_id: custom ? item.id : null,
      purchase_cost: Number(item.cost ?? 0), original_cost: Number(item.cost ?? 0),
      gang_stash: !fighter, is_editable: custom, created_at: ago(random.int(5, 40)) });
    if (fighter) {
      fighter.equipment.push(equipmentId);
      for (const effect of equipmentEffects.filter(e => e.type_specific_data.equipment_id === item.id && e.type_specific_data.effect_selection !== 'select')) {
        await applyEffect(gang, fighter, effect, `${label}:effect:${effect.id}`, equipmentId);
      }
    }
    return equipmentId;
  };

  for (let i = 0; i < config.gangs; i++) {
    const user = users[i];
    const gangType = gangTypes[i % gangTypes.length];
    const available = catalog.fighterTypes.filter(f => f.gang_type_id === gangType.id && !f.is_vehicle);
    const gang = { id: id(`gang:${i}`), name: `${random.pick(ADJECTIVES)} ${random.pick(NOUNS)} ${i + 1}`,
      user, type: gangType, fighters: [], credits: random.int(10, 100) * 5 };
    gangs.push(gang);
    await insert('gangs', { id: gang.id, name: gang.name, user_id: user.id,
      gang_type_id: gangType.id, gang_type: gangType.gang_type, alignment: gangType.alignment,
      credits: gang.credits, reputation: random.int(1, 15), rating: 0, wealth: gang.credits,
      gang_colour: `#${random.int(0x303030, 0xdedede).toString(16).padStart(6, '0')}`,
      gang_subtypes: sql.json([]), is_favourite: i === 0, trade_points: config.edition === 'n26' ? random.int(0, 20) : 0,
      note: `<p>${gang.name} control a corner of the development sector.</p>`,
      note_backstory: '<p>Veterans of the sump wars, now fighting for salvage.</p>',
      created_at: ago(55), last_updated: ago(0) });
    await insert('campaign_members', { id: id(`member:${i}`), campaign_id: campaignId,
      user_id: user.id, role: user.role, invited_by: users[0].id, joined_at: ago(55), invited_at: ago(56) });
    await insert('campaign_gangs', { id: id(`campaign-gang:${i}`), campaign_id: campaignId,
      user_id: user.id, gang_id: gang.id, campaign_member_id: id(`member:${i}`),
      status: 'ACCEPTED', joined_at: ago(55), invited_at: ago(56), invited_by: users[0].id,
      campaign_allegiance_id: allegiances[i % 2] });
    await insert('campaign_gang_resources', { id: id(`gang-resource:${i}`),
      campaign_gang_id: id(`campaign-gang:${i}`), campaign_resource_id: resourceId, quantity: random.int(0, 25) });

    // Each owner gets actual custom content and child rows, exercising the
    // customize loaders rather than just filling official catalogs.
    const customType = { ...random.pick(available.filter(f => hasSubtype(f, 'Ganger'))),
      id: id(`custom-type:${i}`), fighter_type: `Sector Veteran ${i + 1}`, cost: random.int(50, 85) };
    await insert('custom_fighter_types', { id: customType.id, ...statsOf(customType),
      fighter_type: customType.fighter_type, cost: customType.cost, gang_type_id: gangType.id,
      gang_type: gangType.gang_type, user_id: user.id, edition_id: catalog.edition.id,
      fighter_subtypes: sql.json(['Ganger']), special_rules: sql.json([]), description: 'Locally generated custom veteran.' });
    const weapon = random.pick(catalog.equipment.filter(e => e.equipment_type === 'weapon'));
    const customWeapon = { ...weapon, id: id(`custom-equipment:${i}`), cost: random.int(15, 45) };
    await insert('custom_equipment', { id: customWeapon.id, user_id: user.id,
      equipment_name: `Salvaged ${weapon.equipment_name} ${i + 1}`, equipment_type: 'weapon',
      equipment_category: weapon.equipment_category, equipment_category_id: weapon.equipment_category_id,
      cost: customWeapon.cost, availability: 'Common', edition_id: catalog.edition.id,
      is_editable: true, description: 'Development-only weapon.' });
    await insert('custom_weapon_profiles', { id: id(`custom-profile:${i}`),
      custom_equipment_id: customWeapon.id, user_id: user.id, profile_name: 'Standard',
      range_short: '8', range_long: '16', acc_short: '+1', acc_long: '-', strength: '3',
      ap: '-', damage: '1', ammo: '4+', traits: 'Rapid Fire (1)', sort_order: 0 });
    await insert('custom_skill_types', { id: id(`custom-skill-type:${i}`), user_id: user.id,
      name: `Sector Survival ${tag}-${i + 1}`, edition_id: catalog.edition.id });
    await insert('custom_skills', { id: id(`custom-skill:${i}`), user_id: user.id,
      skill_name: `Sump Instinct ${i + 1}`, custom_skill_type_id: id(`custom-skill-type:${i}`),
      description: 'A synthetic skill for exercising custom skill access.' });
    await insert('fighter_type_skill_access', { id: id(`custom-access:${i}`), custom_fighter_type_id: customType.id,
      custom_skill_type_id: id(`custom-skill-type:${i}`), access_level: 'primary' });
    await insert('fighter_type_skill_access', { id: id(`regular-access:${i}`), custom_fighter_type_id: customType.id,
      skill_type_id: random.pick(catalog.skills).skill_type_id, access_level: 'secondary' });
    await insert('fighter_defaults', { id: id(`custom-default:${i}`),
      custom_fighter_type_id: customType.id, custom_equipment_id: customWeapon.id });
    await insert('custom_fighter_type_equipment', { id: id(`custom-equipment-list:${i}`),
      custom_fighter_type_id: customType.id, custom_equipment_id: customWeapon.id, user_id: user.id });
    const items = [{ type: 'fighter_type', id: customType.id }, { type: 'equipment', id: customWeapon.id },
      { type: 'skill', id: id(`custom-skill:${i}`) }];
    await insert('custom_collections', { id: id(`collection:${i}`), user_id: user.id,
      name: `${gang.name} Kit`, items: sql.json(items), edition_id: catalog.edition.id });
    for (const [kind, target] of [['custom_fighter_type_id', customType.id], ['custom_equipment_id', customWeapon.id],
      ['custom_skill_id', id(`custom-skill:${i}`)], ['custom_collection_id', id(`collection:${i}`)]]) {
      await insert('custom_shared', { id: id(`share:${i}:${kind}`), campaign_id: campaignId,
        user_id: user.id, [kind]: target, edition_id: catalog.edition.id });
    }

    const fighterCount = random.int(config.fightersMin, config.fightersMax);
    const vehicleFighters = eligibleVehicleFighters(catalog.fighterTypes, catalog.allGangTypes, gangType.id);
    for (let j = 0; j < fighterCount; j++) {
      const custom = j === fighterCount - 1;
      const source = custom ? customType : config.edition === 'n26' && i % 2 === 0 && j === fighterCount - 2 && vehicleFighters.length
        ? random.pick(vehicleFighters) : j === 0 ? random.pick(available.filter(f => hasSubtype(f, 'Leader')))
        : j === 1 ? random.pick(available.filter(f => hasSubtype(f, 'Champion')))
          : random.pick(available.filter(f => !hasSubtype(f, 'Leader') && !hasSubtype(f, 'Champion') && !hasSubtype(f, 'Exotic Beast')));
      const xp = random.int(0, 25);
      const fighter = { id: id(`fighter:${i}:${j}`), name: `${random.pick(NAMES)} ${i + 1}-${j + 1}`,
        source, equipment: [], active: !(j === 3 && i % 3 === 0), recovery: false, captured: false };
      gang.fighters.push(fighter);
      const row = { id: fighter.id, ...statsOf(source), fighter_name: fighter.name,
        fighter_type: source.fighter_type, fighter_type_id: custom ? null : source.id,
        custom_fighter_type_id: custom ? source.id : null, gang_id: gang.id, user_id: user.id,
        credits: Number(source.cost ?? 0), xp, total_xp: xp, starting_xp: 0, kills: random.int(0, 3),
        position: j, fighter_subtypes: sql.json(custom ? ['Ganger'] : source.fighter_subtypes ?? []),
        fighter_specialisation_id: custom ? null : source.fighter_specialisation_id,
        fighter_specialisation: custom ? null : source.fighter_specialisation,
        killed: !fighter.active && i % 2 === 0, retired: !fighter.active && i % 2 !== 0,
        recovery: false, free_skill: false, is_vehicle: source.is_vehicle ?? false,
        created_at: ago(random.int(15, 50)), updated_at: ago(0),
        note: '<p>Generated development fighter.</p>' };
      // special_rules is jsonb[] on fighters, unlike the JSON arrays on custom types.
      fighter.createdAt = row.created_at;
      await insert('fighters', row);
      if (!custom) await sql`UPDATE public.fighters SET special_rules=ft.special_rules
        FROM public.fighter_types ft WHERE fighters.id=${fighter.id} AND ft.id=${source.id}`;
      if (custom) {
        await addEquipment(gang, fighter, customWeapon, `custom-owned-weapon:${i}`, true);
        await insert('fighter_skills', { id: id(`custom-owned-skill:${i}`), fighter_id: fighter.id,
          custom_skill_id: id(`custom-skill:${i}`), user_id: user.id, is_advance: false });
        await insert('fighter_skill_access_override', { id: id(`custom-override:${i}`),
          fighter_id: fighter.id, custom_skill_type_id: id(`custom-skill-type:${i}`),
          access_level: 'primary', user_id: user.id });
      } else {
        const defaults = catalog.defaults.get(source.id) ?? [];
        const equipped = new Set();
        const learned = new Set();
        for (const [k, entry] of defaults.entries()) {
          if (entry.skill_id && catalog.skills.some(s => s.id === entry.skill_id) && !learned.has(entry.skill_id)) {
            await insert('fighter_skills', { id: id(`default-skill:${i}:${j}:${k}`),
              fighter_id: fighter.id, skill_id: entry.skill_id, user_id: user.id, is_advance: false });
            learned.add(entry.skill_id);
          }
          const item = catalog.equipment.find(e => e.id === entry.equipment_id);
          if (item) {
            await addEquipment(gang, fighter, item, `default-equipment:${i}:${j}:${k}`);
            equipped.add(item.id);
          }
        }
        const choices = random.shuffle(catalog.equipment.filter(e => !equipped.has(e.id) && e.equipment_category !== 'Weapon Accessories'));
        for (const [k, item] of choices.slice(0, random.int(1, 3)).entries()) {
          await addEquipment(gang, fighter, item, `equipment:${i}:${j}:${k}`);
        }
        const skill = random.pick(catalog.skills);
        if (j < 2 && !learned.has(skill.id)) await insert('fighter_skills', { id: id(`skill:${i}:${j}`),
          fighter_id: fighter.id, skill_id: skill.id, user_id: user.id, is_advance: false });
      }
      if (j === 1) {
        const effect = random.pick(catalog.effects.filter(e => e.category_name === 'advancements'));
        await applyEffect(gang, fighter, effect, `advancement:${i}`);
      }
      const loadoutId = id(`loadout:${i}:${j}`);
      await insert('fighter_loadouts', { id: loadoutId, fighter_id: fighter.id,
        user_id: user.id, loadout_name: 'Patrol kit' });
      for (const equipmentId of fighter.equipment) await insert('fighter_loadout_equipment', {
        loadout_id: loadoutId, fighter_equipment_id: equipmentId });
      await sql`UPDATE public.fighters SET active_loadout_id=${loadoutId} WHERE id=${fighter.id}`;
      fighter.loadoutId = loadoutId;
      await log(gang, 'fighter_added', `Added fighter "${fighter.name}" (${row.credits} credits).`, fighter.id, row.created_at);
    }
    const stashCount = random.int(3, 6);
    for (let j = 0; j < stashCount; j++) {
      const item = random.pick(catalog.equipment);
      await addEquipment(gang, null, item, `stash:${i}:${j}`);
    }
    if (config.edition === 'n23' && catalog.vehicles.length && i % 2 === 0) {
      const choices = catalog.vehicles.filter(v => !v.gang_type_id || v.gang_type_id === gangType.id);
      const source = choices.length ? random.pick(choices) : null;
      if (source) {
        const columns = ['movement','front','side','rear','hull_points','handling','save','body_slots','drive_slots','engine_slots','cost'];
        await insert('vehicles', { id: id(`vehicle:${i}`), gang_id: gang.id,
          vehicle_name: `${gang.name} Hauler`, vehicle_type_id: source.id, vehicle_type: source.vehicle_type,
          ...Object.fromEntries(columns.map(key => [key, source[key]])),
          body_slots_occupied: 0, drive_slots_occupied: 0, engine_slots_occupied: 0,
          special_rules: sql.json(source.special_rules ?? []) });
      }
    }
    for (let j = 0; j < 2; j++) {
      const mapObjectId = id(`map-object:${i}:${j}`);
      const columns = Math.ceil(Math.sqrt(config.gangs * 2));
      const rows = Math.ceil(config.gangs * 2 / columns);
      await insert('campaign_map_objects', { id: mapObjectId, campaign_map_id: id('map'),
        object_type: 'landmark', geometry: sql.json({ latlng: [
          (Math.floor((i * 2 + j) / columns) + 1) * 800 / (rows + 1),
          ((i * 2 + j) % columns + 1) * 1200 / (columns + 1),
        ] }),
        properties: sql.json({ name: `${gang.name} Outpost ${j + 1}`, colour: '#b7791f' }) });
      await insert('campaign_territories', { id: id(`territory:${i}:${j}`), campaign_id: campaignId,
        territory_name: `${random.pick(ADJECTIVES)} ${j ? 'Workshop' : 'Settlement'} ${i + 1}`,
        gang_id: gang.id, credits: random.int(1, 5) * 5, ruined: i % 5 === 0 && j === 1,
        description: 'Generated custom campaign territory.', map_object_id: mapObjectId });
    }
    await log(gang, 'campaign_joined', `Gang joined campaign "${campaignName}" (added by ${users[0].username})`, null, ago(55));
  }

  // Finalize states before costing or selecting any session crews. Never capture
  // a vehicle or combine recovery/captivity with another inactive status.
  const injuries = catalog.effects.filter(e => e.category_name === 'injuries' &&
    !['true', true].includes(e.type_specific_data?.killed));
  for (const [i, gang] of gangs.entries()) {
    const candidates = gang.fighters.slice(2).filter(f => f.active && !f.source.is_vehicle);
    if (injuries.length && i % 2 === 0 && candidates.length) {
      const fighter = candidates[0];
      await applyEffect(gang, fighter, random.pick(injuries), `injury:${i}`);
      fighter.recovery = true;
      await sql`UPDATE fighters SET recovery=true WHERE id=${fighter.id}`;
    }
    const captive = candidates.find(f => !f.recovery);
    if (i % 4 === 0 && captive) {
      captive.captured = true;
      await sql`UPDATE fighters SET captured=true,captured_by_gang_id=${gangs[(i + 1) % gangs.length].id} WHERE id=${captive.id}`;
    }
  }
  await refreshDevelopmentFinancials(sql, gangs);

  const pairs = [];
  const createBattle = async (label, pair, status, days, challengeOrder = null) => {
    const played = status === 'played';
    const winner = played && random.int(0, 4) !== 0 ? random.pick(pair) : null;
    const participants = pair.map((gang, i) => ({ gang_id: gang.id,
      role: i ? 'defender' : 'attacker', is_winner: gang === winner,
      ...(config.edition === 'n26' ? { side_job_name: random.pick(['Find Salvage', 'Settle a Score']), side_job_completed: played && gang === winner } : {}) }));
    const battle = { id: id(label), campaign_id: campaignId, scenario: random.pick(SCENARIOS),
      participants: sql.json(participants), winner_id: winner?.id ?? null,
      status, cycle: played ? random.int(1, 3) : 4, challenge_order: challengeOrder,
      challenger_gang_id: played ? null : pair[0].id,
      challenged_gang_id: played || status === 'challenge_pending' ? null : pair[1].id,
      created_at: ago(days), updated_at: ago(days), note: '<p>Generated local battle report.</p>',
      ...(config.edition === 'n26' ? { deployment_name: 'Service Tunnels', objective_name: 'Secure the Cache', crew_selection_name: 'Patrol' } : {}) };
    if (status === 'challenge_pending') battle.participants = sql.json([participants[0]]);
    await insert('campaign_battles', battle);
    if (played) {
      for (const [index, gang] of pair.entries()) {
        // Match logBattleResult in app/actions/logs/gang-campaign-logs.ts,
        // including the attacker/defender wording and filterable action type.
        const result = gang === winner ? 'won' : winner ? 'lost' : 'draw';
        const resultText = { won: 'Victory!', lost: 'Defeat', draw: 'Draw' }[result];
        const roleText = index === 0 ? 'attacked' : 'defended against';
        const opponent = pair.find(g => g !== gang);
        await log(gang, `battle_${result}`,
          `Gang "${gang.name}" ${roleText} "${opponent.name}" in "${battle.scenario}" (Campaign: ${campaignName}). Result: ${resultText}`,
          null, battle.created_at);
      }
      const attacker = pair[0].fighters[0];
      const injured = pair[1].fighters[2];
      await insert('fighter_ooa_records', { id: id(`${label}:ooa`), campaign_id: campaignId,
        causing_fighter_id: attacker.id, causing_gang_id: pair[0].id, causing_fighter_name: attacker.name,
        causing_fighter_gang_name: pair[0].name, injured_fighter_id: injured.id, injured_gang_id: pair[1].id,
        injured_fighter_name: injured.name, injured_gang_name: pair[1].name,
        causing_fighter_type: attacker.source.fighter_type, injured_fighter_type: injured.source.fighter_type,
        causing_fighter_subtypes: sql.json(attacker.source.fighter_subtypes ?? []),
        injured_fighter_subtypes: sql.json(injured.source.fighter_subtypes ?? []),
        event_type: 'out_of_action', user_id: pair[0].user.id, created_at: ago(days) });
    }
    return { ...battle, pair, winner };
  };
  for (let i = 0; i < config.battles; i++) {
    const pair = random.shuffle(gangs).slice(0, 2);
    // All recruits in both rosters must predate the battle, including the
    // fighters referenced by its out-of-action record. Leave at least one day.
    const newestRecruitment = Math.max(...pair.flatMap(gang =>
      gang.fighters.map(fighter => Date.parse(fighter.createdAt))));
    const oldestBattleDays = Math.min(45, Math.floor((anchor - newestRecruitment) / DAY) - 1);
    pairs.push(await createBattle(`battle:${i}`, pair, 'played', random.int(5, oldestBattleDays)));
  }
  for (let i = 0; i < gangs.length; i++) {
    await createBattle(`challenge:${i}`, [gangs[i], gangs[(i + 1) % gangs.length]],
      ['challenge_pending','challenge_issued','challenge_accepted','challenge_declined'][i % 4], 1, i + 1);
  }
  for (const [i, status] of ['pre_battle','active','post_battle','completed'].entries()) {
    const linked = status === 'completed' ? pairs[0]
      : await createBattle(`session-challenge:${i}`, random.shuffle(gangs).slice(0, 2), 'challenge_accepted', 2);
    const sessionId = id(`session:${i}`);
    await insert('battle_sessions', { id: sessionId, campaign_id: campaignId,
      created_by: users[0].id, edition_id: catalog.edition.id, status, scenario: linked.scenario,
      campaign_battle_id: linked.id, winner_gang_id: status === 'completed' ? linked.winner?.id ?? null : null,
      round: status === 'pre_battle' ? 1 : random.int(2, 5), created_at: ago(2), updated_at: ago(0),
      ...(config.edition === 'n26' ? { deployment_name: 'Service Tunnels', objective_name: 'Secure the Cache', crew_selection_name: 'Patrol' } : {}) });
    for (const [j, gang] of linked.pair.entries()) {
      const participantId = id(`participant:${i}:${j}`);
      await insert('battle_session_participants', { id: participantId, battle_session_id: sessionId,
        user_id: gang.user.id, gang_id: gang.id, role: j ? 'defender' : 'attacker',
        gang_rating_snapshot: gang.rating, ready: status !== 'pre_battle',
        is_winner: status === 'completed' && gang === linked.winner,
        credits_earned: status === 'completed' ? random.int(1, 5) * 10 : 0,
        ...(config.edition === 'n26' ? { side_job_name: 'Find Salvage' } : {}) });
      const crew = gang.fighters.filter(f => f.active && !f.recovery && !f.captured).slice(0, 6);
      for (const [k, fighter] of crew.entries()) {
        const leftBattlefield = status === 'active' && canLeaveBattlefield(config.edition) && k === crew.length - 1;
        await insert('battle_session_fighters', { id: id(`session-fighter:${i}:${j}:${k}`),
          battle_session_id: sessionId, participant_id: participantId, fighter_id: fighter.id,
          loadout_id: fighter.loadoutId, created_at: new Date(anchor - DAY + k * 1000).toISOString(),
          session_record: sql.json({ xp_earned: status === 'pre_battle' ? 0 : random.int(1, 5),
            injuries: [], conditions: status === 'active' && k === 0 && hasBlazeCondition(config.edition) ? [{ key: 'blaze', name: 'Blaze' }] : [],
            activations: status === 'active' ? (leftBattlefield ? 0 : random.int(0, 1)) : 1,
            ...(leftBattlefield ? { left_battlefield: true } : {}),
            note: 'Development session fighter.' }) });
      }
    }
  }

  for (const [i, gang] of gangs.entries()) {
    const next = users[(i + 1) % users.length];
    if (gangs.length > 2 || i === 0) await insert('friends', { id: id(`friend:${i}`), requester_id: gang.user.id,
      addressee_id: next.id, status: i % 3 ? 'accepted' : 'pending' });
  }
  const sendId = id('notification-send');
  await insert('notification_sends', { id: sendId, sender_id: users[0].id,
    type: 'campaign_message', campaign_id: campaignId, text: '<p>Welcome to the development sector.</p>',
    recipient_count: users.length, sample_receiver_ids: sql.array(users.slice(0, 3).map(u => u.id), 2950), created_at: ago(0) });
  // Keep historical creation times, but make fresh fixtures visible regardless
  // of --date: the notification UI filters expires_at against the real clock.
  const notificationExpiresAt = new Date(Date.now() + 30 * DAY).toISOString();
  for (const [i, user] of users.entries()) {
    for (let j = 0; j < 5; j++) await insert('notifications', { id: id(`notification:${i}:${j}`),
      receiver_id: user.id, sender_id: users[0].id,
      type: j === 0 ? 'campaign_message' : 'info', send_id: j === 0 ? sendId : null,
      text: j === 0 ? '<p>Welcome to the development sector.</p>' : `Development update ${j}: your gang has new activity.`,
      is_html: j === 0, dismissed: j > 2, link: `/campaigns/${campaignId}`,
      created_at: new Date(anchor - j * 3_600_000).toISOString(), expires_at: notificationExpiresAt });
  }
  report.includedExistingUsers = await includeLocalAccounts();
  await restoreNotifications();
  report.gangs = gangs.map(gang => ({ id: gang.id, name: gang.name, gang_type: gang.type.gang_type,
    fighters: gang.fighters.length, owner: gang.user.email, path: `/gang/${gang.id}` }));
  const [check] = await sql`SELECT
    (SELECT count(*) FROM campaign_gangs WHERE campaign_id=${campaignId})::int AS gangs,
    (SELECT count(*) FROM campaign_members WHERE campaign_id=${campaignId})::int AS members,
    (SELECT count(*) FROM battle_sessions WHERE campaign_id=${campaignId})::int AS sessions,
    (SELECT count(*) FROM battle_session_fighters sf JOIN battle_session_participants p ON p.id=sf.participant_id
      JOIN battle_sessions bs ON bs.id=sf.battle_session_id WHERE bs.campaign_id=${campaignId}
      AND sf.battle_session_id<>p.battle_session_id)::int AS mismatched_sessions,
    (SELECT count(*) FROM email_deliveries ed JOIN notifications n ON n.id=ed.notification_id
      WHERE n.send_id=${sendId})::int AS queued_emails`;
  if (check.gangs !== config.gangs || check.members !== config.gangs + report.includedExistingUsers.length || check.sessions !== 4 ||
      check.mismatched_sessions || check.queued_emails) throw new Error(`Dataset invariant failed: ${JSON.stringify(check)}`);
  report.validation = check;
  if (!config.apply) throw new PreviewRollback(report);
  report.committed = true;
  return report;
}

export async function generateDataset(config) {
  assertLocalDatabase(config.databaseUrl);
  // Do not read DATABASE_URL/.env.local: a production URL must never be selected
  // implicitly. Pin the socket destination as well as validating the URL.
  const sql = postgres(config.databaseUrl, { host: '127.0.0.1', port: 54322,
    max: 1, prepare: false, connect_timeout: 5, idle_timeout: 5,
    onnotice: () => {} });
  try {
    return await sql.begin(async tx => {
      await tx`SET LOCAL lock_timeout='5s'`;
      await tx`SET LOCAL statement_timeout='30s'`;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('mundamanager-development-dataset',0))`;
      return populateDataset(tx, config);
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.report;
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const config = optionsFromArgs(process.argv.slice(2));
  if (config.help) {
    console.log(`Local development dataset generator (no changes unless --apply).

Usage: npm run db:seed:dev -- [options]
  --apply                  Commit the generated dataset; otherwise roll it back
  --dry-run                Explicit rollback-only preview (the default)
  --seed NAME              Reproducible random seed / dataset identity (underhive)
  --edition n23|n26        Campaign and catalog edition (n23)
  --gangs N                Number of owners/gangs (10; range 2–50)
  --fighters-min N         Minimum roster size (8; range 6–30)
  --fighters-max N         Maximum roster size (14; range 6–30)
  --battles N              Historical battle reports (20; range 1–200)
  --date YYYY-MM-DD        Anchor fixture timestamps (today in UTC)
  --database-url URL       Local postgres only; DATABASE_URL is ignored

Existing fixtures are never overwritten. All existing local accounts are joined
as campaign members, including accounts added since a previous run.
A new seed adds another campaign.
See supabase/README.md for coverage, credentials, and cache caveats.`);
    return;
  }
  const report = await generateDataset(config);
  console.log(report.alreadyExists ? Object.keys(report.inserted).length
    ? report.committed ? 'Existing dataset updated with local campaign members.'
      : 'Preview succeeded; local membership additions rolled back. Pass --apply to keep them.'
    : 'Dataset already exists; local campaign memberships are up to date.'
    : report.committed ? 'Development dataset committed.' : 'Preview succeeded; all generated rows rolled back. Pass --apply to keep them.');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Development dataset failed (transaction rolled back): ${error.message}`);
    process.exitCode = 1;
  });
}
