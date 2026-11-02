# README

## Local development

To spin up a fresh local database, run `supabase start` or `supabase db reset` from the repo root and follow the "Setting up a local Supabase database" section of [CONTRIBUTING.md](../CONTRIBUTING.md). Local migration auto-run is disabled in `config.toml` because the files in `migrations/` are incremental deltas that assume a pre-existing base schema. Instead, `supabase start` / `supabase db reset` automatically build the fresh database natively using `[db.seed].sql_paths` configured in `config.toml`.

`schema/schema.public.sql` is a `pg_dump --schema=public` snapshot (regenerated daily by `.github/workflows/supabase_schema_snapshot.yml`). Because it is public-only, non-public bootstrap scripts and reference seed data are applied alongside it via `config.toml`:

| Piece | Where it lives | Applied by |
|-------|----------------|------------|
| `private` schema (`is_admin`, `is_arb`) | `functions/is_admin.sql`, `functions/is_arb.sql` + `bootstrap/private_schema.sql` | `[db.seed].sql_paths` in `config.toml` locally; manually on the remote |
| Public schema snapshot | `schema/schema.public.sql` | `[db.seed].sql_paths` in `config.toml` locally; DB dump restore on remote |
| Grants & Triggers | `bootstrap/grants.sql`, `bootstrap/auth_trigger.sql` | `[db.seed].sql_paths` in `config.toml` locally; migrations on remote |
| Game Reference Data | `seed.sql` | `[db.seed].sql_paths` in `config.toml` locally |
| Notification-email webhook | `webhooks/send_notification_email.sql` | manually (see `webhooks/README.md`) |

### Private schema

The `private` schema holds SECURITY DEFINER helpers used by Row Level Security
policies. Roughly 200 policies reference them, so the schema must exist before the
public snapshot loads.

| Name        | Arguments                | Return type | Security |
|-------------|--------------------------|-------------|----------|
| is_admin    | (none)                   | boolean     | Definer  |
| is_arb      | campaign_id_param uuid   | boolean     | Definer  |

## Generate a populated development campaign

See [`scripts/SEEDS.md`](../scripts/SEEDS.md) for the full command reference,
generation internals, safety model, options, and troubleshooting.

After `supabase start`, use the optional local fixture generator. It adds sample
application data on top of `seed.sql`'s game catalog; it is not part of automatic
bootstrap and does not reset your existing data.

```bash
# Full rollback-only preview: checks inserts/constraints without keeping rows
npm run db:seed:dev

# Commit one campaign with ten gangs and ten sign-in accounts
npm run db:seed:dev -- --apply

# Another reproducible dataset, or the other edition
npm run db:seed:dev -- --apply --seed sump-wars
npm run db:seed:dev -- --apply --edition n26 --seed new-rules

# Control volume and anchor historical event timestamps
npm run db:seed:dev -- --seed large-sector --gangs 20 --fighters-min 12 --fighters-max 20 --battles 80 --date 2026-10-23

npm run db:seed:dev -- --help
```

Use Node 24, as for the application. No extra dependencies are needed.
The tool connects directly as local `postgres` to
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. It deliberately ignores
`DATABASE_URL` and `.env.local`; `--database-url` is accepted only for that local
database/user/port, with `localhost` also allowed. The socket destination is pinned
to loopback, URL query parameters are rejected, and `NODE_ENV=production` is refused.

### What it creates

Defaults are one edition-consistent campaign, ten named gangs with **8–14 fighters
each**, and ten owners: one campaign OWNER (also an app admin), one ARBITRATOR,
and eight MEMBERs. Names, colors, roster choices, equipment, XP, funds, outcomes,
and other values are randomized using a repeatable seed.

**Existing non-generated local accounts/profiles are also added as MEMBERs**,
so you can open the campaign using your existing login. Accounts from other
generated datasets are skipped by their `development_dataset` auth metadata;
the new campaign's own generated accounts remain members. Existing users do not receive extra gangs and
keep their existing passwords, profile/app roles, and any existing membership roles.
An auth account without a profile gets a new profile with a unique local username,
because campaign membership references profiles.

Supporting fixtures include:

- Equipment, stash items, skills, advancements/injury effects and their modifiers,
  loadouts, and examples of killed/retired, recovering, and captured fighters.
- A custom fighter type, weapon/profile, skill set/skill, skill-access override,
  defaults, collection, and campaign shares for every owner.
- Twenty custom territories, allegiances, salvage resources, a local map with
  territory landmarks, and gang activity logs.
- Twenty historical battle reports with out-of-action records, a challenge slot
  for each gang, and three additional accepted challenges linked to sessions.
- Four sessions: pre-battle, active, post-battle, and completed, including participant
  snapshots, eligible crews, loadouts, and activations. N23 has a sample Blaze condition; N26 includes
  named scenario parts/side jobs and fighters who left the battlefield.
- Friends/requests, fifty in-app notifications, and a campaign-message sent-history
  record, **without queuing email**.
- N23 vehicle-table fixtures where catalog choices exist; N26 vehicle fighters
  use that edition's fighter catalog instead.

These cover common development flows, not every optional feature/table. They are
synthetic rosters, not guaranteed rules-legal gang lists. Ten different gangs does
not mean ten different factions: the current bootstrap catalog has five playable
N23 factions and one N26 faction. The generator cycles through all playable factions
available in the chosen edition, without inventing official reference data. It
uses custom scenario names and territories where the bootstrap lacks catalogs.

### Accounts, reruns, and safety

- Output includes generated account emails, campaign roles, gang/page paths, row
  counts, validation results, and a separate `includedExistingUsers` list showing
  which existing accounts were added. Generated accounts use reserved `@example.test` addresses and
  the local-only password **`DevOnly-Underhive-2026!`**. Sign in through the normal
  app using the printed email; accounts are already confirmed. The first account
  is an app admin for testing admin screens; use later accounts for ordinary RLS
  and campaign-permission testing. Never use these credentials on a shared/remote
  environment.
- Same seed + edition identifies the same dataset. Rerunning preserves fixtures and
  your edits, but picks up non-generated local accounts created since the previous run.
  Existing memberships are not duplicated or changed. Preview rolls these additions
  back; use `--apply` to keep them. Once all eligible accounts are members, rerunning is a
  no-op. Changing sizing options for an existing seed is rejected. Use a new
  seed to add another campaign. `--date` anchors historical event timestamps;
  random choices and IDs are deterministic against the same reference catalog,
  while password salts and some database-default timestamps are not.
  Timestamp anchors use UTC midnight; future `--date` values are rejected. Deleted
  campaigns with surviving fixture accounts produce a clear partial-dataset error.
- All writes happen in one transaction under a generator advisory lock. Preview
  mode executes the full generation and rolls it back. Errors roll back all rows.
- Foreign keys, checks, and the auth profile trigger stay enabled. Only the known
  campaign/friend notification and email-enqueue triggers are temporarily paused
  and restored within that transaction. Unknown triggers on these notification
  paths cause the tool to stop for review; trigger state also rolls back on error.
  The tool does not contact Supabase Auth admin APIs, email services, or Discord.
- Existing account/profile rows, gangs, and catalog records are not updated or
  deleted. Missing profiles and campaign memberships are inserted as described
  above, excluding accounts generated by other seeds. Existing memberships are
  never removed automatically, even if created before this exclusion. There is
  no destructive cleanup/reset flag. To remove a dataset, review its printed IDs
  and dependencies rather than deleting by a loose name prefix. `supabase db reset`
  remains a separate destructive operation that removes **all** local data.
- Direct SQL intentionally bypasses server actions and their cache invalidation.
  Prefer generating before starting the app, or restart it and refresh/re-sign in
  afterward. If persistent Next/Redis caches were populated, invalidate the relevant
  local entries using the documented cache workflow; restarting alone may not clear
  them. The generator does not flush caches.
- The default dataset is for UI/relationship testing, not a production-scale query
  benchmark. Add larger datasets deliberately and gather fresh PostgreSQL statistics
  before evaluating the index candidates in `DATABASE.md`.

### Verify the generator

```bash
node --test scripts/dev-dataset-utils.test.mjs

# Requires running local Supabase; every generated fixture is rolled back
RUN_DEV_DATASET_INTEGRATION=1 node --test scripts/seed-development.integration.test.mjs
```

The integration test covers both editions, relationships, account password hashes
and identities, authenticated admin/arbitrator/member helpers, no-op reruns,
existing-account membership and missing-profile creation, later-account discovery,
preservation of existing credentials/roles, option conflicts, email suppression, preview rollback,
and restoration of table counts/trigger states. No test framework installation is
required; these use Node's built-in test runner.

## Supabase functions

https://supabase.com/dashboard/project/iojoritxhpijprgkjfre/database/functions

Syncing of those files is not automatic. If you update a function on Supabase, make sure to update it here as well.

### RPC Functions

| Name                               | Arguments                                                                                              | Return type | Security |
|------------------------------------|--------------------------------------------------------------------------------------------------------|-------------|----------|
| add_fighter_injury                 | input_fighter_id uuid, input_injury_id uuid                                                            | TABLE(result json) | Definer |
| add_vehicle_effect                 | in_vehicle_id uuid, in_fighter_effect_type_id uuid, in_user_id uuid, in_fighter_effect_category_id uuid DEFAULT NULL | json | Definer |
| copy_custom_collection                   | p_collection_id uuid                                                                                         | uuid | Invoker |
| get_available_skills               | fighter_id uuid                                                                                        | jsonb | Definer |
| get_equipment_with_discounts       | gang_type_id uuid DEFAULT NULL, equipment_category text DEFAULT NULL, fighter_type_id uuid DEFAULT NULL | TABLE(...) | Definer |
| get_fighter_available_advancements | fighter_id uuid                                                                                        | jsonb | Definer |
| get_fighter_types_with_cost        | p_gang_type_id uuid DEFAULT NULL, p_gang_affiliation_id uuid DEFAULT NULL, p_is_gang_addition boolean DEFAULT NULL | TABLE(...) | Definer |
| get_gang_details                   | p_gang_id uuid                                                                                         | TABLE(...) | Definer |
| get_gang_permissions               | p_user_id uuid, p_gang_id uuid                                                                         | json | Definer |

### Helper Functions

| Name          | Arguments                                                                                                           | Return type | Security |
|---------------|---------------------------------------------------------------------------------------------------------------------|-------------|----------|
| safe_to_numeric | v text                                                                                                            | numeric | Invoker |

### Trigger Functions

| Name                         | Trigger on         | Description                               |
|------------------------------|--------------------|-------------------------------------------|
| notify_campaign_member_added | campaign_members   | Sends notification when member is added   |
| notify_friend_request_sent   | friends            | Sends notification for friend requests    |
| notify_gang_invite           | campaign_gangs     | Sends notification for gang invites       |
| enqueue_notification_email   | notifications      | Queues an outbound email for a new notification |
| handle_new_user              | auth.users         | Creates a profiles row on signup (`on_auth_user_created`) |
| gang_types_parent_must_be_root | gang_types       | Keeps parent_gang_type_id one level deep (parent must be a root) |
| gang_types_set_parent_gang_type_name | gang_types | Copies the parent house name onto a child list on insert or update, overwriting a direct write |
| gang_types_propagate_parent_gang_type_name | gang_types | Updates every child list when the parent house name changes |
