// A synthetic equipment catalogue with gangs, campaigns and custom equipment, for checking
// utils/equipment/resolve.ts against get_equipment_detailed_data. Deterministic for a seed.
// It covers every rule kind the RPC resolves, with randomised items and rules on top.
//
// generateDataset(seed) returns { sql, cases }: `sql` inserts the rows (run it in a transaction
// with session_replication_role = replica, then roll back), and `cases` lists the modal
// contexts to resolve. The ids are fixed per kind and number, so they read in a diff.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = {
  edition: '0e', category: '0c', origin: '0a', subtype: '0b', post: '0d', gangType: '01', fighterType: '02',
  vehicleType: '03', legacy: '04', affiliation: '05', item: '10', profile: '11', effect: '12', modifier: '13',
  listRule: '20', availability: '21', discount: '22', countLimit: '23', beast: '24', stock: '25',
  user: '30', campaignType: '31', allegiance: '32', typeResource: '33', campaign: '34', campaignResource: '35',
  customGangType: '36', gang: '37', fighter: '38', customItem: '39', customProfile: '3a', customPost: '3b',
  customStock: '3c', customPricing: '3d', customAvailability: '3e', customFighterType: '3f',
};

function makeIds() {
  const counters = {};
  return (kind) => {
    counters[kind] = (counters[kind] ?? 0) + 1;
    return `${KINDS[kind]}000000-0000-4000-8000-${counters[kind].toString(16).padStart(12, '0')}`;
  };
}

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insert(table, rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n  ');
  return `INSERT INTO public.${table} (${cols.join(', ')}) VALUES\n  ${values};\n`;
}

export function generateDataset(seed, { itemsPerEdition = [28, 14] } = {}) {
  const rand = mulberry32(seed);
  const id = makeIds();
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const chance = (p) => rand() < p;
  const sample = (list, p) => list.filter(() => chance(p));

  const t = {}; // table -> rows
  // fighter_type_equipment_fighter_scope_uidx: one non-vehicle list row per item, type and scope
  const listKeys = new Set();
  const add = (table, row) => {
    if (table === 'fighter_type_equipment' && row.vehicle_type_id === null) {
      const key = [row.equipment_id, row.fighter_type_id, row.fighter_subtype, row.gang_subtype_id, row.gang_type_id, row.gang_origin_id].join('|');
      if (listKeys.has(key)) return;
      listKeys.add(key);
    }
    (t[table] ??= []).push(row);
  };

  // ------------------------------------------------------------------------- catalogue
  const E1 = id('edition');
  const E2 = id('edition');
  add('editions', { id: E1, name: 'Edition One', slug: 'n23' });
  add('editions', { id: E2, name: 'Edition Two', slug: 'n26' });
  const category = id('category');

  const origins = { [E1]: [id('origin'), id('origin')], [E2]: [id('origin')] };
  const subtypes = { [E1]: [id('subtype'), id('subtype')], [E2]: [id('subtype')] };
  for (const ed of [E1, E2]) {
    origins[ed].forEach((o, i) => add('gang_origins', { id: o, origin_name: `Origin ${i}`, edition_id: ed }));
    subtypes[ed].forEach((s, i) => add('gang_subtype_types', { id: s, subtype: `Subtype ${i}`, edition_id: ed }));
  }

  // Names sort the same in C and en_US, as the database's collation differs locally.
  const TP1 = id('post');
  const TP2 = id('post');
  const TP3 = id('post');
  add('trading_post_types', { id: TP1, trading_post_name: 'Alpha Market', edition_id: E1 });
  add('trading_post_types', { id: TP2, trading_post_name: 'Bravo Market', edition_id: E1 });
  add('trading_post_types', { id: TP3, trading_post_name: 'Charlie Market', edition_id: E2 });

  let gangTypeSerial = 1000;
  const gangTypes = {};
  const mkGangType = (key, edition, post) => {
    const gid = id('gangType');
    gangTypes[key] = { id: gid, edition };
    add('gang_types', { id: gangTypeSerial++, gang_type_id: gid, gang_type: key, edition_id: edition, trading_post_type_id: post });
  };
  mkGangType('A', E1, TP1); // own post TP1
  mkGangType('B', E1, TP2); // own post TP2
  mkGangType('C', E1, null); // no own post
  mkGangType('D', E2, TP3);
  mkGangType('E', E2, null);

  const fighterTypes = {};
  const mkFighterType = (key, gangTypeKey, subtypeNames) => {
    const fid = id('fighterType');
    const gt = gangTypes[gangTypeKey];
    fighterTypes[key] = { id: fid, gangType: gt.id, edition: gt.edition, subtypes: subtypeNames };
    add('fighter_types', { id: fid, fighter_type: key, gang_type_id: gt.id, edition_id: gt.edition, fighter_subtypes: subtypeNames, cost: 50 });
  };
  for (const g of ['A', 'B', 'C', 'D', 'E']) {
    mkFighterType(`${g}-leader`, g, ['Leader']);
    mkFighterType(`${g}-champion`, g, ['Champion']);
    mkFighterType(`${g}-ganger`, g, ['Ganger']);
  }
  mkFighterType('A-beast', 'A', ['Exotic Beast']);
  mkFighterType('D-beast', 'D', ['Exotic Beast']);
  mkFighterType('A-nosubtypes', 'A', []);

  const V1 = id('vehicleType');
  add('vehicle_types', { id: V1, vehicle_type: 'Vehicle', edition_id: E1, gang_type_id: gangTypes.A.id });

  const L1 = id('legacy');
  add('fighter_gang_legacy', { id: L1, name: 'Legacy', fighter_type_id: fighterTypes['B-champion'].id, edition_id: E1 });
  const AF1 = id('affiliation');
  add('gang_affiliation', { id: AF1, name: 'Affiliation', fighter_type_id: fighterTypes['C-leader'].id, edition_id: E1 });

  // Items
  const items = { [E1]: [], [E2]: [] };
  const AVAIL = ['C', 'R8', 'R10', 'E', 'I9', null];
  const TPOINTS = ['0', '1', '2', '3', 'E'];
  [E1, E2].forEach((ed, edIdx) => {
    for (let n = 0; n < itemsPerEdition[edIdx]; n++) {
      const iid = id('item');
      const type = ed === E1 && n % 7 === 6 ? 'vehicle_upgrade' : pick(['weapon', 'wargear']);
      const item = {
        id: iid,
        equipment_name: `Item ${edIdx + 1}-${String(n).padStart(2, '0')}`,
        equipment_category: type === 'vehicle_upgrade' ? 'Vehicle Upgrades' : type === 'weapon' ? 'Basic Weapons' : 'Armour',
        equipment_category_id: category,
        equipment_type: type,
        cost: 5 * (1 + Math.floor(rand() * 20)),
        availability: pick(AVAIL),
        trade_points: pick(TPOINTS),
        core_equipment: chance(0.12),
        grants_equipment: null,
        edition_id: ed,
        is_editable: false,
      };
      items[ed].push(item);
      add('equipment', item);
      if (type === 'weapon') {
        const profiles = chance(0.3) ? 2 : 1;
        for (let p = 0; p < profiles; p++) {
          add('weapon_profiles', {
            id: id('profile'), equipment_id: iid, profile_name: p === 0 ? 'Standard' : 'Overcharge',
            range_short: '8', range_long: '16', acc_short: '+1', acc_long: '', strength: '3', ap: '-1', damage: '1',
            ammo: '4+', traits: p === 0 ? null : 'Rapid Fire', sort_order: chance(0.5) ? p + 1 : null, lethality: ed === E2 ? 'L1' : null,
          });
        }
      }
      if (type === 'vehicle_upgrade') {
        const effect = id('effect');
        add('fighter_effect_types', { id: effect, effect_name: `Slot ${n}`, type_specific_data: { equipment_id: iid }, edition_id: ed });
        for (const stat of sample(['body_slots', 'drive_slots', 'engine_slots'], 0.6)) {
          add('fighter_effect_type_modifiers', { id: id('modifier'), fighter_effect_type_id: effect, stat_name: stat, default_numeric_value: chance(0.85) ? 1 : 0 });
        }
      }
    }
  });
  // Grants on a few items, with options in a given order
  for (const ed of [E1, E2]) {
    const granting = items[ed][1];
    const options = [items[ed][3], items[ed][2]].map((o) => ({ equipment_id: o.id, cost: 0 }));
    granting.grants_equipment = { selection_type: 'single_select', options };
  }

  const ftKeys = Object.keys(fighterTypes);
  const scopeFor = (ed) => {
    // Optional scopes on a rule: none, one, or several.
    const scope = { gang_type_id: null, gang_origin_id: null, gang_subtype_id: null };
    if (chance(0.15)) scope.gang_type_id = pick(Object.values(gangTypes).filter((g) => g.edition === ed)).id;
    if (chance(0.1)) scope.gang_origin_id = pick(origins[ed]);
    if (chance(0.1)) scope.gang_subtype_id = pick(subtypes[ed]);
    return scope;
  };

  // Fighter type lists: grants, with some scoped, and some denies
  for (const key of ftKeys) {
    const ft = fighterTypes[key];
    for (const item of sample(items[ft.edition], 0.3)) {
      add('fighter_type_equipment', {
        id: id('listRule'), equipment_id: item.id, fighter_type_id: ft.id, vehicle_type_id: null,
        ...scopeFor(ft.edition), fighter_subtype: chance(0.08) ? pick(['Leader', 'Champion']) : null, excluded: false,
      });
    }
    for (const item of sample(items[ft.edition], 0.05)) {
      add('fighter_type_equipment', {
        id: id('listRule'), equipment_id: item.id, fighter_type_id: ft.id, vehicle_type_id: null,
        gang_type_id: null, gang_origin_id: null, gang_subtype_id: null, fighter_subtype: null, excluded: true,
      });
    }
  }
  // N23 vehicle lists, including a deny row (vehicle rows cannot deny)
  for (const item of sample(items[E1], 0.35)) {
    add('fighter_type_equipment', {
      id: id('listRule'), equipment_id: item.id, fighter_type_id: null, vehicle_type_id: V1,
      ...scopeFor(E1), fighter_subtype: null, excluded: chance(0.1),
    });
  }
  // Gang-wide rules: subtype grants (with and without a gang scope), a grant with no subtype
  // (which grants nothing), and gang-scoped denies
  for (const ed of [E1, E2]) {
    for (const item of sample(items[ed], 0.12)) {
      add('fighter_type_equipment', {
        id: id('listRule'), equipment_id: item.id, fighter_type_id: null, vehicle_type_id: null,
        gang_type_id: chance(0.5) ? pick(Object.values(gangTypes).filter((g) => g.edition === ed)).id : null,
        gang_origin_id: null, gang_subtype_id: chance(0.3) ? pick(subtypes[ed]) : null,
        fighter_subtype: chance(0.85) ? pick(['Leader', 'Champion']) : null, excluded: false,
      });
    }
    for (const item of sample(items[ed], 0.05)) {
      add('fighter_type_equipment', {
        id: id('listRule'), equipment_id: item.id, fighter_type_id: null, vehicle_type_id: null,
        gang_type_id: pick(Object.values(gangTypes).filter((g) => g.edition === ed)).id,
        gang_origin_id: null, gang_subtype_id: null, fighter_subtype: chance(0.3) ? 'Leader' : null, excluded: true,
      });
    }
  }

  // Rarity rows: at most one per item and scope, as production has
  for (const ed of [E1, E2]) {
    for (const item of items[ed]) {
      const used = new Set();
      const n = chance(0.35) ? 1 + Math.floor(rand() * 3) : 0;
      for (let k = 0; k < n; k++) {
        const kind = pick(['gang_type', 'origin', 'subtype', 'exclusive']);
        const row = { id: id('availability'), equipment_id: item.id, gang_type_id: null, gang_origin_id: null, gang_subtype_id: null, availability: pick(AVAIL), exclusive: false };
        let key;
        if (kind === 'gang_type' || kind === 'exclusive') {
          const gt = pick(Object.values(gangTypes).filter((g) => g.edition === ed));
          row.gang_type_id = gt.id;
          row.exclusive = kind === 'exclusive';
          key = `gt:${gt.id}`;
        } else if (kind === 'origin') {
          row.gang_origin_id = pick(origins[ed]);
          key = `o:${row.gang_origin_id}`;
        } else {
          row.gang_subtype_id = pick(subtypes[ed]);
          key = `s:${row.gang_subtype_id}`;
        }
        if (used.has(key)) continue;
        used.add(key);
        add('equipment_availability', row);
      }
    }
  }

  // Discounts: gang type, fighter type (including the legacy and affiliation types) and origin
  for (const ed of [E1, E2]) {
    for (const item of sample(items[ed], 0.3)) {
      const kind = pick(['gang_type', 'fighter_type', 'origin', 'fighter_type']);
      const row = { id: id('discount'), equipment_id: item.id, gang_type_id: null, fighter_type_id: null, gang_origin_id: null,
        adjusted_cost: chance(0.85) ? Math.max(0, item.cost - 5 * (1 + Math.floor(rand() * 4))) : null,
        trade_points: chance(0.3) ? pick(['0', '1', '2', 'E']) : null };
      if (kind === 'gang_type') row.gang_type_id = pick(Object.values(gangTypes).filter((g) => g.edition === ed)).id;
      else if (kind === 'origin') row.gang_origin_id = pick(origins[ed]);
      else row.fighter_type_id = pick(ftKeys.filter((k) => fighterTypes[k].edition === ed).map((k) => fighterTypes[k].id));
      add('equipment_discounts', row);
      if (chance(0.25)) {
        // A second row for the same item, to exercise the cheapest-wins rule
        add('equipment_discounts', { ...row, id: id('discount'), gang_type_id: row.gang_type_id, adjusted_cost: Math.max(0, item.cost - 10), trade_points: chance(0.5) ? '1' : null });
      }
    }
  }

  // Count limits, and beasts whose limits come from their fighter type
  for (const ed of [E1, E2]) {
    for (const item of sample(items[ed], 0.15)) {
      add('count_limits', {
        id: id('countLimit'), equipment_id: item.id, fighter_type_id: null,
        for_fighter_type_id: chance(0.3) ? pick(ftKeys.filter((k) => fighterTypes[k].edition === ed).map((k) => fighterTypes[k].id)) : null,
        ...scopeFor(ed), min_count: chance(0.3) ? 1 : null, max_count: 1 + Math.floor(rand() * 3),
      });
    }
    const beastType = ed === E1 ? fighterTypes['A-beast'] : fighterTypes['D-beast'];
    const beastItem = items[ed][items[ed].length - 1];
    add('exotic_beasts', { id: id('beast'), fighter_type_id: beastType.id, equipment_id: beastItem.id });
    add('count_limits', { id: id('countLimit'), equipment_id: null, fighter_type_id: beastType.id, for_fighter_type_id: null, gang_type_id: null, gang_origin_id: null, gang_subtype_id: null, min_count: null, max_count: 2 });
    add('count_limits', { id: id('countLimit'), equipment_id: null, fighter_type_id: beastType.id, for_fighter_type_id: null, gang_type_id: gangTypes[ed === E1 ? 'A' : 'D'].id, gang_origin_id: null, gang_subtype_id: null, min_count: 1, max_count: 3 });
  }

  // Trading Post stock
  for (const item of sample(items[E1], 0.35)) add('trading_post_equipment', { id: id('stock'), trading_post_type_id: TP1, equipment_id: item.id });
  for (const item of sample(items[E1], 0.35)) add('trading_post_equipment', { id: id('stock'), trading_post_type_id: TP2, equipment_id: item.id });
  for (const item of sample(items[E2], 0.5)) add('trading_post_equipment', { id: id('stock'), trading_post_type_id: TP3, equipment_id: item.id });

  // ------------------------------------------------------------------------- users, campaigns
  const owner = id('user');
  const admin = id('user');
  const sharer = id('user');
  add('profiles', { id: owner, username: 'owner_user', user_role: 'user' });
  add('profiles', { id: admin, username: 'admin_user', user_role: 'admin' });
  add('profiles', { id: sharer, username: 'sharer_user', user_role: 'user' });

  const CT = id('campaignType');
  add('campaign_types', { id: CT, campaign_type_name: 'Campaign Type' });
  const CTA = id('allegiance');
  add('campaign_type_allegiances', { id: CTA, campaign_type_id: CT, allegiance_name: 'Order' });
  const CTR = id('typeResource');
  add('campaign_type_resources', { id: CTR, campaign_type_id: CT, resource_name: 'Meat' });

  const CP1 = id('customPost');
  const CP2 = id('customPost');
  const CP3 = id('customPost');
  add('custom_trading_posts', { id: CP1, user_id: sharer, custom_trading_post_name: 'Delta Bazaar', edition_id: E1 });
  add('custom_trading_posts', { id: CP2, user_id: sharer, custom_trading_post_name: 'Echo Bazaar', edition_id: E1 });
  add('custom_trading_posts', { id: CP3, user_id: sharer, custom_trading_post_name: 'Foxtrot Bazaar', edition_id: E1 });

  const C1 = id('campaign');
  const C2 = id('campaign');
  const C3 = id('campaign');
  // C1: TP2 and the other edition's TP3, custom posts CP1 and CP2. C2: nothing. C3: TP1 and CP1.
  add('campaigns', { id: C1, campaign_type_id: CT, campaign_name: 'C1', trading_posts: [TP2, TP3], custom_trading_posts: [CP1, CP2] });
  add('campaigns', { id: C2, campaign_type_id: CT, campaign_name: 'C2', trading_posts: [], custom_trading_posts: [] });
  add('campaigns', { id: C3, campaign_type_id: CT, campaign_name: 'C3', trading_posts: [TP1], custom_trading_posts: [CP1] });
  const CR1 = id('campaignResource');
  add('campaign_resources', { id: CR1, campaign_id: C1, resource_name: 'Scrap' });

  const CG1 = id('customGangType');
  add('custom_gang_types', { id: CG1, user_id: owner, gang_type: 'Homebrew', edition_id: E1 });

  // Custom equipment
  const customItems = [];
  const mkCustom = (user, ed, n) => {
    const cid = id('customItem');
    const type = pick(['weapon', 'wargear']);
    const row = { id: cid, user_id: user, edition_id: ed, equipment_name: `Custom ${n}`, equipment_category: type === 'weapon' ? 'Basic Weapons' : 'Armour', equipment_type: type, cost: 5 * (1 + Math.floor(rand() * 10)), availability: pick(['C', 'R9', 'E']), trade_points: pick(['0', '1', '2']) };
    add('custom_equipment', row);
    customItems.push(row);
    if (type === 'weapon' && chance(0.6)) {
      add('custom_weapon_profiles', { id: id('customProfile'), custom_equipment_id: cid, profile_name: 'Custom', range_short: '4', range_long: '8', acc_short: '', acc_long: '', strength: '3', ap: '', damage: '1', ammo: '5+', traits: null, sort_order: null, lethality: null });
    }
    return cid;
  };
  const ownCustom = [mkCustom(owner, E1, 1), mkCustom(owner, E1, 2), mkCustom(owner, E2, 3)];
  const sharedCustom = [mkCustom(sharer, E1, 4), mkCustom(sharer, E2, 5)];
  const stockOnlyCustom = [mkCustom(sharer, E1, 6), mkCustom(sharer, E1, 7)];
  mkCustom(sharer, E1, 8); // seen by nobody
  const adminCustom = mkCustom(admin, E1, 9);
  for (const cid of sharedCustom) add('custom_shared', { custom_equipment_id: cid, campaign_id: C1, user_id: sharer, edition_id: E1 });

  // Custom Trading Post stock, with terms
  let created = Date.UTC(2026, 0, 1);
  const stockRow = (post, itemId, isCustom) => {
    const sid = id('customStock');
    const resource = pick(['none', 'none', 'none', 'type', 'campaign', 'reputation']);
    created += 1000 * 60 * 60 * (chance(0.2) ? 0 : 1); // some share a timestamp
    add('custom_trading_post_equipment', {
      id: sid, user_id: sharer, custom_trading_post_id: post,
      equipment_id: isCustom ? null : itemId, custom_equipment_id: isCustom ? itemId : null,
      cost_override: chance(0.5) ? 5 * (1 + Math.floor(rand() * 15)) : null,
      availability_override: chance(0.4) ? pick(['C', 'R11', 'E']) : null,
      sort_order: chance(0.4) ? Math.floor(rand() * 3) : null,
      cost_type_resource_id: resource === 'type' ? CTR : null,
      cost_campaign_resource_id: resource === 'campaign' ? CR1 : null,
      cost_resource_amount: resource !== 'none' ? 1 + Math.floor(rand() * 4) : (chance(0.1) ? 2 : null),
      cost_reputation: resource === 'reputation',
      banned: chance(0.15),
      created_at: new Date(created).toISOString(),
    });
    // At most one price row and one rarity row that can match a given gang
    if (chance(0.35)) {
      const scope = pick(['gang_type', 'origin', 'custom_gang_type', 'fighter_type', 'other_gang_type']);
      add('custom_trading_post_pricing', {
        user_id: sharer, custom_trading_post_equipment_id: sid,
        gang_type_id: scope === 'gang_type' ? gangTypes.A.id : scope === 'other_gang_type' ? gangTypes.B.id : null,
        custom_gang_type_id: scope === 'custom_gang_type' ? CG1 : null,
        gang_origin_id: scope === 'origin' ? origins[E1][0] : null,
        fighter_type_id: scope === 'fighter_type' ? fighterTypes['A-leader'].id : null,
        adjusted_cost: 5 * Math.floor(rand() * 10),
      });
    }
    if (chance(0.3)) {
      const scope = pick(['gang_type', 'origin', 'subtype', 'allegiance', 'alignment', 'none']);
      add('custom_trading_post_availability', {
        user_id: sharer, custom_trading_post_equipment_id: sid,
        gang_type_id: scope === 'gang_type' ? gangTypes.A.id : null,
        custom_gang_type_id: null,
        gang_origin_id: scope === 'origin' ? origins[E1][0] : null,
        gang_subtype_id: scope === 'subtype' ? subtypes[E1][0] : null,
        campaign_type_allegiance_id: scope === 'allegiance' ? CTA : null,
        alignment: scope === 'alignment' ? 'Law Abiding' : null,
        availability: chance(0.85) ? pick(['R12', 'I7', 'C']) : null,
      });
    }
  };
  for (const post of [CP1, CP2, CP3]) {
    for (const item of sample(items[E1], 0.2)) stockRow(post, item.id, false);
    for (const item of sample(items[E2], 0.15)) stockRow(post, item.id, false);
    for (const cid of sample([...ownCustom, ...stockOnlyCustom, sharedCustom[0]], 0.6)) stockRow(post, cid, true);
  }

  // Custom fighter type with a list of official and custom items
  const CFT1 = id('customFighterType');
  add('custom_fighter_types', { id: CFT1, user_id: owner, edition_id: E1, fighter_type: 'Homebrew Fighter', fighter_subtypes: ['Leader'] });
  for (const item of sample(items[E1], 0.25)) add('custom_fighter_type_equipment', { custom_fighter_type_id: CFT1, equipment_id: item.id, custom_equipment_id: null });
  for (const cid of [ownCustom[0], sharedCustom[0], stockOnlyCustom[0]]) add('custom_fighter_type_equipment', { custom_fighter_type_id: CFT1, equipment_id: null, custom_equipment_id: cid });

  // ------------------------------------------------------------------------- gangs, fighters
  const gangs = {};
  const mkGang = (key, { gangType = null, customGangType = null, alignment = null, origin = null, gangSubtypes = null, affiliation = null, campaign = null, status = 'ACCEPTED', allegiance = null }) => {
    const gid = id('gang');
    gangs[key] = { id: gid, gangType: gangType ? gangTypes[gangType].id : null, affiliation, campaign };
    add('gangs', { id: gid, user_id: owner, gang_type_id: gangType ? gangTypes[gangType].id : null, custom_gang_type_id: customGangType, name: key, alignment, gang_origin_id: origin, gang_subtypes: gangSubtypes, gang_affiliation_id: affiliation });
    if (campaign) add('campaign_gangs', { campaign_id: campaign, gang_id: gid, user_id: owner, status, campaign_type_allegiance_id: allegiance });
  };
  mkGang('GA', { gangType: 'A', alignment: 'Law Abiding', origin: origins[E1][0], gangSubtypes: [subtypes[E1][0]], campaign: C1, allegiance: CTA });
  mkGang('GB', { gangType: 'A', origin: origins[E1][1], gangSubtypes: [subtypes[E1][1]], affiliation: AF1 });
  mkGang('GC', { gangType: 'B', campaign: C3, status: 'PENDING' });
  mkGang('GD', { gangType: 'C', campaign: C2 });
  mkGang('GE', { gangType: 'D', origin: origins[E2][0], gangSubtypes: [subtypes[E2][0]], campaign: C1, allegiance: CTA });
  mkGang('GF', { customGangType: CG1 });
  add('campaign_members', { campaign_id: C1, user_id: sharer, role: 'OWNER' });

  const fighters = {};
  const mkFighter = (key, gangKey, { type = null, custom = null, subtypes: own = [], legacy = null }) => {
    const fid = id('fighter');
    fighters[key] = { id: fid, gang: gangKey, type: type ? fighterTypes[type].id : null, custom };
    add('fighters', { id: fid, gang_id: gangs[gangKey].id, user_id: owner, fighter_name: key, fighter_type_id: type ? fighterTypes[type].id : null, custom_fighter_type_id: custom, fighter_subtypes: own, fighter_gang_legacy_id: legacy });
  };
  mkFighter('GA-leader', 'GA', { type: 'A-leader', subtypes: ['Leader', 'Mounted'] });
  mkFighter('GA-legacy', 'GA', { type: 'A-champion', subtypes: ['Champion'], legacy: L1 });
  mkFighter('GA-promoted', 'GA', { type: 'A-ganger', subtypes: ['Champion'] });
  mkFighter('GA-hired', 'GA', { type: 'B-leader', subtypes: ['Leader'] });
  mkFighter('GA-custom', 'GA', { custom: CFT1, subtypes: [] });
  mkFighter('GA-both', 'GA', { type: 'A-ganger', custom: CFT1, subtypes: ['Ganger'] });
  mkFighter('GA-nosubtypes', 'GA', { type: 'A-nosubtypes', subtypes: [] });
  mkFighter('GB-leader', 'GB', { type: 'A-leader', subtypes: ['Leader'] });
  mkFighter('GB-promoted', 'GB', { type: 'A-ganger', subtypes: ['Champion'], legacy: L1 });
  mkFighter('GC-champion', 'GC', { type: 'B-champion', subtypes: ['Champion'] });
  mkFighter('GD-leader', 'GD', { type: 'C-leader', subtypes: ['Leader'] });
  mkFighter('GE-leader', 'GE', { type: 'D-leader', subtypes: ['Leader'] });
  mkFighter('GF-custom', 'GF', { custom: CFT1, subtypes: [] });

  // ------------------------------------------------------------------------- cases
  // The modal's contexts: each fighter with the Legacy switch off and on, the stash (no
  // fighter), and the N23 vehicle modal. The modal's type is the fighter's official type,
  // else its custom type.
  const cases = [];
  for (const [key, f] of Object.entries(fighters)) {
    for (const legacy of [false, true]) {
      cases.push({ name: `${key}${legacy ? ' legacy' : ''}`, viewer: owner, gang: gangs[f.gang].id, fighter: f.id, typeId: f.type ?? f.custom, isVehicle: false, legacy });
    }
  }
  for (const [key, g] of Object.entries(gangs)) {
    cases.push({ name: `${key} stash`, viewer: owner, gang: g.id, fighter: null, typeId: null, isVehicle: false, legacy: false });
  }
  cases.push({ name: 'GA stash as admin', viewer: admin, gang: gangs.GA.id, fighter: null, typeId: null, isVehicle: false, legacy: false });
  cases.push({ name: 'GA-leader as admin', viewer: admin, gang: gangs.GA.id, fighter: fighters['GA-leader'].id, typeId: fighters['GA-leader'].type, isVehicle: false, legacy: false });
  cases.push({ name: 'GA vehicle', viewer: owner, gang: gangs.GA.id, fighter: fighters['GA-leader'].id, typeId: V1, isVehicle: true, legacy: false });
  cases.push({ name: 'GB vehicle', viewer: owner, gang: gangs.GB.id, fighter: fighters['GB-leader'].id, typeId: V1, isVehicle: true, legacy: false });

  // What equipment.tsx sends for each tab, given the gang's campaign row
  const campaigns = { [C1]: { tp: [TP2, TP3], custom: [CP1, CP2] }, [C2]: { tp: [], custom: [] }, [C3]: { tp: [TP1], custom: [CP1] } };
  for (const c of cases) {
    const gang = Object.values(gangs).find((g) => g.id === c.gang);
    const campaign = gang.campaign ? campaigns[gang.campaign] : null;
    const fighterRecord = !c.isVehicle && c.fighter !== null && (c.legacy || gang.affiliation !== null);
    const common = { gang_id: gang.id, gang_type_id: gang.gangType, fighter_type_id: c.typeId, fighter_id: fighterRecord ? c.fighter : null };
    c.requests = {
      'fighters-list': { ...common, fighter_type_equipment: true },
      'fighters-tradingpost': {
        ...common,
        equipment_tradingpost: true,
        fighter_type_equipment: c.typeId !== null && !c.isVehicle ? true : null,
        campaign_trading_post_type_ids: campaign ? campaign.tp : null,
        campaign_custom_trading_post_ids: campaign && campaign.custom.length > 0 ? campaign.custom : null,
      },
      unrestricted: { ...common },
    };
  }

  const order = [
    'editions', 'gang_origins', 'gang_subtype_types', 'trading_post_types', 'gang_types', 'fighter_types', 'vehicle_types',
    'fighter_gang_legacy', 'gang_affiliation', 'equipment', 'weapon_profiles', 'fighter_effect_types', 'fighter_effect_type_modifiers',
    'fighter_type_equipment', 'equipment_availability', 'equipment_discounts', 'count_limits', 'exotic_beasts', 'trading_post_equipment',
    'profiles', 'campaign_types', 'campaign_type_allegiances', 'campaign_type_resources', 'custom_trading_posts', 'campaigns',
    'campaign_resources', 'custom_gang_types', 'custom_equipment', 'custom_weapon_profiles', 'custom_shared',
    'custom_trading_post_equipment', 'custom_trading_post_pricing', 'custom_trading_post_availability', 'custom_fighter_types',
    'custom_fighter_type_equipment', 'gangs', 'campaign_gangs', 'campaign_members', 'fighters',
  ];
  for (const table of Object.keys(t)) if (!order.includes(table)) throw new Error(`table ${table} missing from insert order`);
  const sql = order.map((table) => insert(table, t[table] ?? [])).join('');

  return {
    sql,
    cases,
    editions: [E1, E2],
    gangTypes: Object.values(gangTypes).map((g) => [g.edition, g.id]),
  };
}
