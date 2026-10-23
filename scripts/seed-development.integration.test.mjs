import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import postgres from 'postgres';
import { DEVELOPMENT_PASSWORD, fixtureId, LOCAL_DATABASE_URL, optionsFromArgs } from './dev-dataset-utils.mjs';
import { generateDataset, populateDataset, refreshDevelopmentFinancials } from './seed-development.mjs';

const enabled = process.env.RUN_DEV_DATASET_INTEGRATION === '1';

async function snapshot(sql) {
  const tables = await sql`SELECT schemaname,tablename FROM pg_tables
    WHERE schemaname='public' OR (schemaname='auth' AND tablename IN ('users','identities'))
    ORDER BY schemaname,tablename`;
  const counts = {};
  for (const table of tables) {
    const [row] = await sql`SELECT count(*)::int AS count FROM ${sql(`${table.schemaname}.${table.tablename}`)}`;
    counts[`${table.schemaname}.${table.tablename}`] = row.count;
  }
  const triggers = await sql`SELECT t.oid,t.tgenabled FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.oid`;
  return { counts, triggers: [...triggers] };
}

async function existingAccount(sql, missingProfile = false, id = randomUUID()) {
  const username = `existing_${id.slice(0, 8)}`;
  await sql`INSERT INTO auth.users (id,email,aud,role,encrypted_password,raw_user_meta_data,raw_app_meta_data)
    VALUES (${id},${`${id}@example.test`},'authenticated','authenticated','preserve-existing-hash',
      ${sql.json({ username })},${sql.json({ provider: 'email', providers: ['email'] })})`;
  await sql`INSERT INTO profiles (id,username) VALUES (${id},${username}) ON CONFLICT (id) DO NOTHING`;
  if (missingProfile) await sql`DELETE FROM profiles WHERE id=${id}`;
  return id;
}

test('both editions generate coherent data, rerun safely, and leave the database unchanged',
  { skip: !enabled, timeout: 120_000 }, async () => {
    const queries = [];
    const sql = postgres(LOCAL_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {},
      debug: (_connection, query) => queries.push(query) });
    const rollback = new Error('Integration test rollback');
    try {
      const before = await snapshot(sql);
      for (const { edition, minimum } of [
        { edition: 'n23', minimum: false }, { edition: 'n26', minimum: false },
        { edition: 'n23', minimum: true }, { edition: 'n26', minimum: true },
      ]) {
        const config = optionsFromArgs(['--apply', '--seed', `test-${randomUUID()}`,
          '--edition', edition, '--date', minimum ? '2020-01-01' : '2026-10-23',
          ...(minimum ? ['--fighters-min', '6', '--fighters-max', '6'] : [])]);
        await assert.rejects(sql.begin(async tx => {
          await tx`SET LOCAL lock_timeout='5s'`;
          await tx`SET LOCAL statement_timeout='30s'`;
          await tx`SELECT pg_advisory_xact_lock(hashtextextended('mundamanager-development-dataset',0))`;
          const existingId = await existingAccount(tx);
          const missingProfileId = await existingAccount(tx, true);
          const [existingBefore] = await tx`SELECT to_jsonb(u) AS account,to_jsonb(p) AS profile
            FROM auth.users u JOIN profiles p ON p.id=u.id WHERE u.id=${existingId}`;
          const start = queries.length;
          const generationStarted = Date.now();
          const result = await populateDataset(tx, config);
          const generationEnded = Date.now();
          const generationQueries = queries.slice(start);
          assert.equal(generationQueries.filter(q => q.includes('SELECT fd.* FROM public.fighter_defaults')).length, 1);
          assert.equal(generationQueries.filter(q => q.includes('SELECT m.* FROM public.fighter_effect_type_modifiers')).length, 1);
          assert.equal(result.gangs.length, 10);
          assert.equal(result.validation.queued_emails, 0);
          assert.equal(result.inserted.custom_fighter_types, 10);
          assert.ok(result.inserted.fighter_equipment > 100);
          assert.ok(result.gangs.every(g => g.fighters >= config.fightersMin && g.fighters <= config.fightersMax));
          assert.equal(result.validation.members, 10 + result.includedExistingUsers.length);
          assert.equal(result.includedExistingUsers.find(u => u.id === existingId).role, 'MEMBER');
          assert.equal(result.includedExistingUsers.find(u => u.id === missingProfileId).profileCreated, true);
          const notifications = await tx`SELECT created_at,expires_at FROM notifications
            WHERE receiver_id=ANY(${tx.array(result.users.map(user => user.id), 2950)})`;
          assert.equal(notifications.length, 50);
          const lifetime = 30 * 86_400_000;
          for (const notification of notifications) {
            assert.ok(new Date(notification.created_at).getTime() <= Date.parse(`${config.date}T00:00:00Z`));
            assert.ok(new Date(notification.expires_at).getTime() >= generationStarted + lifetime);
            assert.ok(new Date(notification.expires_at).getTime() <= generationEnded + lifetime);
          }
          const [campaign] = await tx`SELECT campaign_name FROM campaigns WHERE id=${result.campaignId}`;
          const logRows = await tx`SELECT action_type,description FROM gang_logs WHERE gang_id IN
            (SELECT gang_id FROM campaign_gangs WHERE campaign_id=${result.campaignId})`;
          assert.ok(!logRows.some(row => ['battle_result', 'gang_joined_campaign'].includes(row.action_type)));
          const membershipLogs = logRows.filter(row => row.action_type === 'campaign_joined');
          assert.equal(membershipLogs.length, 10);
          assert.ok(membershipLogs.every(row => row.description ===
            `Gang joined campaign "${campaign.campaign_name}" (added by ${result.users[0].username})`));
          const played = await tx`SELECT scenario,winner_id,participants FROM campaign_battles
            WHERE campaign_id=${result.campaignId} AND status='played'`;
          const gangNames = new Map(result.gangs.map(gang => [gang.id, gang.name]));
          const expectedBattleLogs = played.flatMap(battle => battle.participants.map(participant => {
            const outcome = participant.gang_id === battle.winner_id ? 'won' : battle.winner_id ? 'lost' : 'draw';
            const resultText = { won: 'Victory!', lost: 'Defeat', draw: 'Draw' }[outcome];
            const opponent = battle.participants.find(p => p.gang_id !== participant.gang_id);
            const role = participant.role === 'attacker' ? 'attacked' : 'defended against';
            return JSON.stringify({ action_type: `battle_${outcome}`,
              description: `Gang "${gangNames.get(participant.gang_id)}" ${role} "${gangNames.get(opponent.gang_id)}" in "${battle.scenario}" (Campaign: ${campaign.campaign_name}). Result: ${resultText}` });
          })).sort();
          const battleLogs = logRows.filter(row => ['battle_won', 'battle_lost', 'battle_draw'].includes(row.action_type));
          assert.equal(battleLogs.length, config.battles * 2);
          assert.deepEqual(battleLogs.map(row => JSON.stringify({ action_type: row.action_type, description: row.description })).sort(), expectedBattleLogs);
          const [chronology] = await tx`SELECT
            (SELECT count(*) FROM gang_logs l JOIN fighters f ON f.id=l.fighter_id
              JOIN campaign_gangs cg ON cg.gang_id=f.gang_id WHERE cg.campaign_id=${result.campaignId}
              AND l.action_type='fighter_added' AND l.created_at IS DISTINCT FROM f.created_at)::int AS mismatched_recruitment_logs,
            (SELECT count(*) FROM campaign_battles b CROSS JOIN LATERAL jsonb_array_elements(b.participants) p
              JOIN fighters f ON f.gang_id=(p->>'gang_id')::uuid WHERE b.campaign_id=${result.campaignId}
              AND b.status='played' AND f.created_at>=b.created_at)::int AS battles_before_recruitment,
            (SELECT count(*) FROM fighter_ooa_records r
              JOIN fighters causing ON causing.id=r.causing_fighter_id JOIN fighters injured ON injured.id=r.injured_fighter_id
              WHERE r.campaign_id=${result.campaignId}
              AND (r.created_at<=causing.created_at OR r.created_at<=injured.created_at))::int AS premature_ooa_records`;
          assert.equal(chronology.mismatched_recruitment_logs, 0);
          assert.equal(chronology.battles_before_recruitment, 0);
          assert.equal(chronology.premature_ooa_records, 0);
          const [existingAfter] = await tx`SELECT to_jsonb(u) AS account,to_jsonb(p) AS profile
            FROM auth.users u JOIN profiles p ON p.id=u.id WHERE u.id=${existingId}`;
          assert.deepEqual(existingAfter, existingBefore);
          const [coverage] = await tx`SELECT count(*)::int AS missing FROM auth.users u
            WHERE NOT EXISTS (SELECT 1 FROM campaign_members cm
              WHERE cm.campaign_id=${result.campaignId} AND cm.user_id=u.id)`;
          assert.equal(coverage.missing, 0);
          const [states] = await tx`SELECT
            (SELECT count(*) FROM battle_session_fighters sf JOIN battle_sessions bs ON bs.id=sf.battle_session_id
              JOIN fighters f ON f.id=sf.fighter_id WHERE bs.campaign_id=${result.campaignId}
              AND (f.killed OR f.retired OR f.enslaved OR f.captured OR f.recovery))::int AS invalid_crew,
            (SELECT count(*) FROM fighters f JOIN campaign_gangs cg ON cg.gang_id=f.gang_id
              WHERE cg.campaign_id=${result.campaignId} AND f.is_vehicle AND (f.captured OR f.recovery))::int AS invalid_vehicle,
            (SELECT count(*) FROM battle_session_fighters sf JOIN battle_sessions bs ON bs.id=sf.battle_session_id
              WHERE bs.campaign_id=${result.campaignId} AND sf.session_record->'conditions' @> '[{"key":"blaze"}]'::jsonb)::int AS blaze,
            (SELECT count(*) FROM campaign_members WHERE campaign_id=${result.campaignId}
              AND user_id IN (${existingId},${missingProfileId}) AND joined_at<>${`${config.date}T00:00:00Z`}::timestamptz)::int AS wrong_member_time`;
          assert.equal(states.invalid_crew, 0);
          assert.equal(states.invalid_vehicle, 0);
          assert.equal(states.blaze, edition === 'n23' ? 2 : 0);
          assert.equal(states.wrong_member_time, 0);
          const [values] = await tx`SELECT count(*)::int AS drift FROM gangs g WHERE g.id IN
            (SELECT gang_id FROM campaign_gangs WHERE campaign_id=${result.campaignId}) AND g.rating<>(
              SELECT coalesce(sum(coalesce(f.credits,0)+coalesce(f.cost_adjustment,0)
                +coalesce((SELECT sum(purchase_cost) FROM fighter_equipment WHERE fighter_id=f.id AND vehicle_id IS NULL),0)
                +coalesce((SELECT sum(credits_increase) FROM fighter_skills WHERE fighter_id=f.id),0)
                +coalesce((SELECT sum((type_specific_data->>'credits_increase')::numeric) FROM fighter_effects WHERE fighter_id=f.id AND vehicle_id IS NULL),0)),0)
              FROM fighters f WHERE f.gang_id=g.id AND NOT (f.killed OR f.retired OR f.enslaved OR coalesce(f.captured,false)))`;
          assert.equal(values.drift, 0);
          if (edition === 'n23') {
            const [vehicle] = await tx`SELECT v.id,v.cost,g.id AS gang_id,g.user_id,g.credits,g.rating,g.wealth,
              (SELECT id FROM fighters WHERE gang_id=g.id AND fighter_subtypes @> '["Leader"]'::jsonb LIMIT 1) AS fighter_id
              FROM vehicles v JOIN gangs g ON g.id=v.gang_id JOIN campaign_gangs cg ON cg.gang_id=g.id
              WHERE cg.campaign_id=${result.campaignId} ORDER BY v.id LIMIT 1`;
            if (vehicle) {
              const [item] = await tx`SELECT equipment_id FROM fighter_equipment WHERE gang_id=${vehicle.gang_id} AND equipment_id IS NOT NULL LIMIT 1`;
              const [effect] = await tx`SELECT fighter_effect_type_id FROM fighter_effects WHERE fighter_id=${vehicle.fighter_id}
                UNION ALL SELECT fighter_effect_type_id FROM fighter_effects WHERE fighter_id IN
                (SELECT id FROM fighters WHERE gang_id=${vehicle.gang_id}) LIMIT 1`;
              await tx`UPDATE vehicles SET fighter_id=${vehicle.fighter_id} WHERE id=${vehicle.id}`;
              await tx`INSERT INTO fighter_equipment (id,fighter_id,vehicle_id,gang_id,equipment_id,user_id,purchase_cost)
                VALUES (${randomUUID()},${vehicle.fighter_id},${vehicle.id},${vehicle.gang_id},${item.equipment_id},${vehicle.user_id},17)`;
              await tx`INSERT INTO fighter_effects (id,fighter_id,vehicle_id,fighter_effect_type_id,user_id,type_specific_data)
                VALUES (${randomUUID()},${vehicle.fighter_id},${vehicle.id},${effect.fighter_effect_type_id},${vehicle.user_id},'{"credits_increase":13}'::jsonb)`;
              await tx`UPDATE fighters SET cost_adjustment=7 WHERE id=${vehicle.fighter_id}`;
              await refreshDevelopmentFinancials(tx, [{ id: vehicle.gang_id, credits: Number(vehicle.credits) }]);
              const [updated] = await tx`SELECT rating,wealth FROM gangs WHERE id=${vehicle.gang_id}`;
              assert.equal(Number(updated.rating), Number(vehicle.rating) + Number(vehicle.cost) + 37);
              assert.equal(Number(updated.wealth), Number(vehicle.wealth) + 37);
            }
          }
          const [integrity] = await tx`SELECT
            (SELECT count(*) FROM fighters f JOIN campaign_gangs cg ON cg.gang_id=f.gang_id
              WHERE cg.campaign_id=${result.campaignId} AND f.fighter_subtypes @> '["Leader"]'::jsonb)::int AS leaders,
            (SELECT count(*) FROM campaign_battles WHERE campaign_id=${result.campaignId}
              AND jsonb_typeof(participants)<>'array')::int AS non_array_participants,
            (SELECT count(*) FROM campaign_gangs cg JOIN campaign_members cm ON cm.id=cg.campaign_member_id
              WHERE cg.campaign_id=${result.campaignId} AND cg.campaign_id<>cm.campaign_id)::int AS mismatched_members,
            (SELECT count(*) FROM fighters f JOIN campaign_gangs cg ON cg.gang_id=f.gang_id
              WHERE cg.campaign_id=${result.campaignId} AND f.is_vehicle)::int AS vehicle_fighters`;
          assert.equal(integrity.leaders, 10);
          assert.equal(integrity.non_array_participants, 0);
          assert.equal(integrity.mismatched_members, 0);
          assert.equal(integrity.vehicle_fighters, edition === 'n26' ? 5 : 0);
          const [password] = await tx`SELECT encrypted_password=extensions.crypt(${DEVELOPMENT_PASSWORD},encrypted_password) AS valid
            FROM auth.users WHERE id=${result.users[0].id}`;
          assert.equal(password.valid, true);
          const [identity] = await tx`SELECT count(*)::int AS count FROM auth.identities
            WHERE user_id=${result.users[0].id} AND provider='email'`;
          assert.equal(identity.count, 1);
          await tx`SET LOCAL ROLE authenticated`;
          for (const [i, user] of result.users.slice(0, 3).entries()) {
            await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: user.id, role: 'authenticated' })},true)`;
            const [permissions] = await tx`SELECT private.is_admin() AS admin,private.is_arb(${result.campaignId}) AS arbitrator`;
            assert.equal(permissions.admin, i === 0);
            assert.equal(permissions.arbitrator, i < 2);
          }
          await tx`RESET ROLE`;
          await tx`SELECT set_config('request.jwt.claims','{}',true)`;
          await tx`UPDATE campaigns SET description='Edited locally' WHERE id=${result.campaignId}`;
          await tx`UPDATE campaign_members SET role='ARBITRATOR'
            WHERE campaign_id=${result.campaignId} AND user_id=${existingId}`;
          const laterId = await existingAccount(tx);
          const beforePreview = await snapshot(tx);
          await assert.rejects(tx.savepoint(sp => populateDataset(sp, { ...config, apply: false })), /Preview rolled back/);
          assert.deepEqual(await snapshot(tx), beforePreview);
          const updated = await populateDataset(tx, config);
          assert.equal(updated.alreadyExists, true);
          assert.equal(updated.includedExistingUsers.find(u => u.id === laterId).added, true);
          assert.equal(updated.includedExistingUsers.find(u => u.id === existingId).role, 'ARBITRATOR');
          assert.equal(updated.inserted.campaign_members, 1);
          const populated = await snapshot(tx);
          const repeatStart = queries.length;
          const repeated = await populateDataset(tx, config);
          assert.ok(!queries.slice(repeatStart).some(q => /ALTER\s+TABLE/i.test(q)));
          assert.equal(repeated.alreadyExists, true);
          assert.equal(repeated.campaignId, result.campaignId);
          assert.equal(repeated.gangs.length, 10);
          assert.ok(repeated.gangs.every(gang => gang.path === `/gang/${gang.id}`));
          assert.ok(repeated.includedExistingUsers.every(u => !u.added && !u.profileCreated));
          const [edited] = await tx`SELECT description FROM campaigns WHERE id=${result.campaignId}`;
          assert.equal(edited.description, 'Edited locally');
          assert.deepEqual(await snapshot(tx), populated);
          await assert.rejects(populateDataset(tx, { ...config, gangs: 11 }), /different generator version\/options/);
          await assert.rejects(tx.savepoint(async sp => {
            const partial = { ...config, seed: `partial-${randomUUID()}` };
            await existingAccount(sp, false, fixtureId(`mundamanager-dev:${edition}:${partial.seed}`, 'user:0'));
            await assert.rejects(populateDataset(sp, partial), /Partial dataset exists.*new --seed/);
            throw rollback;
          }), error => error === rollback);
          assert.deepEqual(await snapshot(tx), populated);
          throw rollback;
        }), error => error === rollback);
        assert.deepEqual(await snapshot(sql), before);
      }
      const preview = await generateDataset(optionsFromArgs(['--seed', `preview-${randomUUID()}`,
        '--gangs', '2', '--fighters-min', '6', '--fighters-max', '6', '--battles', '1']));
      assert.equal(preview.committed, false);
      assert.equal(preview.gangs.length, 2);
      assert.deepEqual(await snapshot(sql), before);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
