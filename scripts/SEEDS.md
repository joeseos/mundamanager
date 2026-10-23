# Development dataset generator

`npm run db:seed:dev` builds a populated Munda Manager development campaign in the
**local Supabase database**. It provides interconnected application data for UI,
permissions, relationship, and query testing, rather than just catalog entries.

The default is a **full rollback-only preview**. Nothing is kept unless you pass
`--apply`. The command never resets the database or replaces an existing dataset.

## Quick start

From the repository root, with Node 24 available in your shell:

```bash
# Start/initialize local Supabase first; requires Docker and the Supabase CLI
supabase start

# Execute the complete generator, validate the result, then roll everything back
npm run db:seed:dev

# Generate and keep the default campaign
npm run db:seed:dev -- --apply

# See all CLI options
npm run db:seed:dev -- --help
```

The `--` after the npm command forwards subsequent flags to the generator.

## Which database it uses

The default connection is:

```text
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

The tool deliberately **does not load `.env.local` or use `DATABASE_URL`**. An app
configured against a remote Supabase instance will not redirect fixture writes
there, but it also will not display the locally generated data. Configure the
running application to use the same local Supabase instance.

The connection guard requires:

- A `postgres:` or `postgresql:` URL.
- Host `127.0.0.1` or `localhost`; the actual database socket is pinned to
  `127.0.0.1` regardless.
- Port `54322`, database `postgres`, and database user `postgres`.
- No URL query parameters or fragment.
- `NODE_ENV` must not be `production`.

There is intentionally no flag to bypass these restrictions or enable remote
fixture creation. These safeguards assume the loopback port is your local
Supabase server, not a tunnel to another environment.

## Prerequisites and relationship to `supabase/seed.sql`

The generator expects a bootstrapped schema and the repository's reference game
catalog. `supabase start` loads the configured schema, helpers, grants, triggers,
and `supabase/seed.sql`. See [the Supabase guide](../supabase/README.md).

These are separate layers:

| Layer | Purpose |
| --- | --- |
| `supabase/schema/` and bootstrap SQL | Database structure and supporting functions/policies |
| `supabase/seed.sql` | Reference game data: editions, gang/fighter types, equipment, skills, effects, etc. |
| `npm run db:seed:dev` | Optional, interconnected users, campaigns, gangs, rosters, and activity |

The development command is not run automatically by Supabase startup/reset. It
does not apply migrations, fill missing official catalogs, or change RLS policies.
It uses the existing `postgres` npm dependency and Node's built-in facilities;
there are no additional packages to install.

## What the default command creates

Exact randomized quantities vary by seed and reference catalog. Fixed quantities
below describe a fresh run with the default ten gangs and twenty historic battles.

### Accounts, campaign, and memberships

- One edition-consistent campaign, with a current cycle of 4.
- Ten generated, email-confirmed accounts, each owning one generated gang.
- The first account is a campaign `OWNER` and app admin; the second is an
  `ARBITRATOR`; the other eight are `MEMBER`s with ordinary app-user profiles.
- All other existing accounts in the local database are also joined as campaign
  `MEMBER`s, including accounts created by other generator seeds.
- Missing profiles for existing auth accounts are created with unique local
  usernames, because campaign membership references `profiles`.

Existing passwords, auth metadata, profile/app roles, and existing membership
roles are preserved. Existing accounts do not receive extra gangs, and existing
gangs are not moved into the generated campaign.

### Gangs and rosters

- Ten distinct named gangs with 8–14 fighters each by default.
- A leader, a champion, varied other fighters, and one custom veteran per gang.
- Random colors, credits, reputation, XP, kills, equipment, and other sample values.
- Equipment and stash items, skills, loadouts, advancement/injury effects, and
  copied effect modifiers.
- Examples of killed/retired, recovering, and captured non-vehicle fighters.
- N23 unassigned vehicle records where eligible catalog types exist.
- N26 vehicle fighters on alternating gangs where eligible catalog types exist.

Factions cycle through a shuffled list of playable gang types in the selected
edition. The current bootstrap has **five playable N23 factions and one N26
faction**. Ten different gangs does not mean ten different factions. Hidden or
unplayable factions are not treated as generic vehicle sources; N26 generic
vehicles must belong to the edition's explicit `Available to All` gang type.

Ordinary gear is restricted to supported `weapon`/`wargear` items. Equipment linked
through `exotic_beasts`, and equipment that grants additional equipment, is skipped
because the generator does not implement those recruitment/grant workflows.
Beast equipment is identified by its relationship, not its name. Vehicle upgrades
are not randomly assigned as ordinary fighter gear.

### Custom content for every generated owner

- One custom fighter type and weapon with a custom weapon profile.
- One custom skill set and skill.
- Custom fighter skill access, default equipment, and an equipment-list entry.
- A fighter-specific custom Skill Set access override.
- A collection and four campaign-share records for the custom content.

### Campaign resources and map

- Two allegiances and one custom `Salvage` resource, with quantities per gang.
- Two custom territories per gang: twenty by default.
- A mixture of intact/ruined territories and randomized territory income.
- A map with linked territory landmarks, using the local
  [`public/dev-campaign-map.svg`](../public/dev-campaign-map.svg) background.

The territories and scenario names are synthetic. Empty official territory or
scenario catalogs do not require the generator to invent official reference data.

### Battles, challenges, and sessions

- Twenty played battle reports by default, each with an out-of-action record.
  Their dates are sampled after the latest fighter recruitment in both rosters,
  so battles and out-of-action records do not predate the fighters involved.
- One challenge slot per gang, cycling through pending, issued, accepted, and
  declined states.
- Three more accepted challenges linked to unfinished sessions.
- Four sessions: `pre_battle`, `active`, `post_battle`, and `completed`.
- Participant rows, rating snapshots, selected crews, loadouts, activations, and
  session records. The completed session links to a played battle report.
- N26 custom Deployment, Objective, Crew, and Side Job names, plus a sample
  left-the-battlefield state in the active session.
- A sample Blaze condition in the N23 active session only, gated by edition
  capability. N26 does not receive Blaze.

Injuries, recovery, and captivity are finalized **before** crew selection. Session
crews exclude killed, retired, enslaved, captured, and recovering fighters and
contain at most six eligible fighters per participant. A six-fighter roster may
therefore contribute fewer than six fighters. Vehicles are not selected as
capture or recovery examples.

With defaults, the campaign has **33 battle/challenge rows**: 20 played + 10 gang
challenge slots + 3 accepted session challenges. The four sessions are separate
records, not four more battle-log rows.

### Activity and notifications

- Fighter recruitment, campaign membership, and battle-result gang logs.
  Recruitment logs use the fighter's exact creation timestamp; battle-result logs
  use the corresponding battle timestamp.
- Campaign and battle log types/wording match the app: `campaign_joined`,
  `battle_won`, `battle_lost`, and `battle_draw`, including campaign/scenario names,
  attacker/defender roles, and result text. The normal log filters work on them.
- Friend relationships/requests between generated accounts.
- Five in-app notifications per generated account: fifty by default.
- One campaign-message sent-history record for those generated recipients.
- No outbound email deliveries are queued by generation.

This is broad development coverage, not a fixture for every table or optional
feature. It is not a battle simulator, exhaustive rules engine, or a guarantee of
tournament-legal gang composition and purchases.

## All command-line options

| Option | Default | Accepted values / behavior |
| --- | --- | --- |
| `--apply` | Off | Commit new fixtures or missing memberships. Without it, generated changes are rolled back. |
| `--dry-run` | Implicit default | Explicitly request rollback-only preview. Cannot be combined with `--apply`. |
| `--seed NAME` | `underhive` | Non-blank string of 1–100 characters. Controls random choices and dataset identity. |
| `--edition SLUG` | `n23` | `n23` or `n26`; resolves the edition from the database by slug. |
| `--gangs N` | `10` | Integer from 2 to 50; also controls generated owner-account count. Existing accounts are additional members. |
| `--fighters-min N` | `8` | Integer from 6 to 30, not greater than `--fighters-max`. |
| `--fighters-max N` | `14` | Integer from 6 to 30, not less than `--fighters-min`. |
| `--battles N` | `20` | Integer from 1 to 200; played historical reports only. Challenge/session counts are additional. |
| `--date YYYY-MM-DD` | Today's UTC date | Valid date, not in the future. Anchors generated timestamps at **00:00 UTC** on that date. |
| `--database-url URL` | Local URL above | Alternate credentials/hostname only within the strict local connection guard. Never a remote database. |
| `--help`, `-h` | Off | Print usage and exit without connecting to the database. |

Unknown options, positional arguments, fractional counts, and invalid combinations
are rejected. There are no password, cleanup, force, reset, remote, or skip-safety
options.

### Examples

```bash
# Keep the standard dataset
npm run db:seed:dev -- --apply

# Same generator, new random choices and an independent campaign
npm run db:seed:dev -- --apply --seed ash-wastes

# Separate N26 campaign; the edition is part of dataset identity
npm run db:seed:dev -- --apply --edition n26 --seed ash-wastes

# Small rollback-only preview, including the minimum roster size
npm run db:seed:dev -- --dry-run --gangs 2 --fighters-min 6 --fighters-max 6 --battles 1

# Larger dataset; still preview-only until --apply is added
npm run db:seed:dev -- --seed large-sector --gangs 20 --fighters-min 12 --fighters-max 20 --battles 80

# Reproducible historical timestamp anchor; use a past date
npm run db:seed:dev -- --seed historical-sector --date 2020-01-01
```

## Randomization and reproducibility

The tool uses a seeded pseudorandom generator, not `Math.random()`. Its namespace
combines the seed and edition. Stable hashes of that namespace and record labels
also produce deterministic UUIDs.

Gang names are selected from adjective/noun lists and suffixed with the gang's
one-based number, for example `Ash Jackals 1` or `Chrome Saints 2`. The suffix
keeps names distinct within a campaign. Fighter names, gear, roster sizes, funds,
outcomes, and many other values are sampled from bounded choices.

The same seed, edition, sizing options, reference catalog, and generator code
reproduce random choices and IDs on a fresh database. This does **not** mean every
stored byte is deterministic: password hashes use fresh salts, notification
expiration uses generation time, and auth-trigger defaults may use the database
clock. Generator code/catalog changes can also
change the sequence of choices.

`--date` controls timestamps, not the dataset namespace. It uses UTC midnight so
a run early in the morning does not create future event timestamps. Generated
membership timestamps use this anchor too, including memberships added for
existing accounts. Notification **creation** times remain historical, but their
expiration is **30 days after the actual generation time**, independent of
`--date`. Even a campaign anchored years in the past gets visible notification
fixtures for the next 30 days.

## Accounts and sign-in

Generated emails follow this pattern:

```text
dev-<dataset-tag>-1@example.test
dev-<dataset-tag>-2@example.test
...
```

All generated accounts use the development-only password:

```text
DevOnly-Underhive-2026!
```

The report prints the actual emails. Accounts are confirmed and have email
identities; the password is stored as a salted bcrypt hash using local pgcrypto.
Sign in through the normal application. Use the first generated account for admin
screens, the second for arbitrator behavior, and later accounts for ordinary
campaign-member behavior. Existing accounts retain their own credentials.

`example.test` addresses and the shared password are only appropriate for this
local tool. Never deploy these fixture accounts or credentials to a remote/shared
environment.

## Reruns, existing users, and partial datasets

The seed and edition identify a campaign and its generated accounts. A manifest
in generated auth app metadata records the generator version and sizing options;
editable campaign descriptions are not used as the manifest.

- **Same seed, already complete:** leave fixture records and your edits alone.
  Once all local accounts have memberships, the rerun is a no-op and does not
  disable/re-enable table triggers.
- **New local accounts since the last run:** add their missing profiles and/or
  memberships, without duplicating or changing existing memberships. Preview
  stages those additions and rolls them back; `--apply` keeps them.
- **Different sizing options/version for an existing seed:** stop with a clear
  conflict message. Choose a new seed rather than replacing the old dataset.
- **Campaign deleted but generated accounts remain:** stop with an explicit
  partial-dataset message before attempting account inserts. Use a new seed or
  review cleanup separately; the tool does not overwrite or silently reuse those
  surviving accounts.

Changing the generator does not automatically repair previously generated
rosters, financial values, session records, log types, or notification expiration.
Use a new seed to exercise the
latest fixture behavior without discarding work in an older dataset.

## How generation works internally

Entry point: [`scripts/seed-development.mjs`](seed-development.mjs).
Argument validation, IDs, randomization, and catalog-filter helpers live in
[`scripts/dev-dataset-utils.mjs`](dev-dataset-utils.mjs).

1. Parse/validate options and enforce the local connection guard.
2. Connect directly with `postgres.js`, using one connection and no prepared
   statements. Start a transaction, set a 5-second lock timeout and a 30-second
   per-statement timeout, and acquire the generator's transaction-scoped advisory
   lock. These are not a 30-second limit for the entire run.
3. Detect an existing campaign or partial dataset. Existing campaigns synchronize
   missing local memberships only; fully up-to-date campaigns need no trigger DDL.
4. Resolve the edition and catalog. Preload fighter defaults and effect modifiers
   once, grouping them in memory rather than querying for every fighter/effect.
   Resolve beast-equipment relationships and explicit generic vehicle eligibility.
5. Temporarily pause only the recognized notification/email side-effect triggers.
   Foreign keys, check constraints, and the auth profile trigger remain enabled.
6. Insert generated auth accounts, confirmed email identities, campaign data,
   rosters, custom content, gear, loadouts, effects, map, and territories.
7. Finalize non-conflicting fighter states and calculate financial values from
   stored assets. Costing reuses the pure implementation in
   [`utils/fighter-cost.ts`](../utils/fighter-cost.ts), also used by the app's
   fighter-cost read and roster total. Rating eligibility uses
   [`countsTowardRating`](../utils/fighter-status.ts): captured/killed/retired/enslaved
   fighters are excluded; recovery alone does not exclude rating. Wealth includes
   rating, credits, stash, and unassigned vehicle value.
8. Create battle history, challenges, and sessions from eligible crews, with
   edition-appropriate session conditions and finalized rating snapshots.
9. Insert sample social/notification records and include existing local accounts.
   Restore notification trigger states and validate core row counts, session
   relationships, and absence of queued email for the sample send.
10. Commit for `--apply`; otherwise intentionally roll back. Any error rolls back
    all inserts and transactional trigger changes.

The recognized paused triggers are the campaign-member invitation, gang invitation,
friend-request notification, and notification email-enqueue triggers. Unknown
user-defined triggers on these paths cause the generator to stop for review.
Originally disabled triggers remain disabled; other original trigger modes are
restored. The command never calls email providers, Discord, or Supabase Auth admin
HTTP APIs.

This is a direct-SQL fixture tool, not a replay of application server actions. It
creates representative persisted states but does not prove that every UI workflow
or mutation that could produce those states is correct.

## Output

After a successful run, a status message is followed by a JSON report containing:

- Seed, edition, timestamp-anchor date, and whether changes were committed.
- `alreadyExists`, campaign UUID, and `/campaigns/<id>` path.
- Generated user emails/usernames, original campaign roles, and the shared fixture
  password. Existing fixture roles/credentials may have been edited since creation.
- `includedExistingUsers`, with membership role and whether a membership/profile
  was added in this run. These accounts do not use the printed fixture password.
- Gang UUIDs, names/types, and `/gang/<id>` paths. Fresh-generation reports also
  include roster sizes and owner emails.
- Inserted-row counts by table, warnings, and fresh-generation validation results.

In preview mode, inserted counts describe **attempted and rolled-back** inserts,
not rows kept in the database. An already-existing, unchanged dataset can report
itself persisted without making any new writes. Never assume `--apply` happened
solely because the report prints campaign/account IDs.

## Caches and performance testing

Direct SQL bypasses server-action cache invalidation. Prefer generating before
starting the app. After generation, refresh or re-sign in as appropriate; a restart
alone does not necessarily clear persistent Next/Redis caches. Follow the
repository's local cache instructions if existing entries are stale. The tool
does not flush shared caches.

Default volumes are suitable for UI/relationship tests, not proof of production
query performance. For index investigations, deliberately build larger datasets,
gather PostgreSQL statistics, and inspect representative query plans. Random
fixture distributions are not necessarily production distributions.

## Tests

```bash
# Pure helpers and shared costing; no database needed
node --test scripts/dev-dataset-utils.test.mjs

# Requires local Supabase; all fixture/test changes are rolled back
RUN_DEV_DATASET_INTEGRATION=1 node --test scripts/seed-development.integration.test.mjs

# Both suites
RUN_DEV_DATASET_INTEGRATION=1 node --test scripts/dev-dataset-utils.test.mjs scripts/seed-development.integration.test.mjs
```

Use Node 24 as above. Tests cover both editions, default/minimum rosters,
account hashes/identities, existing-user inclusion, role preservation, relationships,
crew state eligibility, edition conditions, ratings, app-compatible log types and
descriptions, recruitment/battle chronology, visible notifications with historical
dates, no-op reruns, partial datasets,
timestamp helpers, batched reference reads, email suppression, and rollback/trigger
restoration. Integration tests create temporary accounts and records inside
transactions/savepoints; they do not keep a populated campaign afterward.

## Troubleshooting and cleanup

| Symptom | What to check |
| --- | --- |
| Connection refused | Start local Supabase/Docker and confirm port 54322 is available. |
| Local-only guard rejects the URL | Use the required local host, port, database, user, and a URL without query parameters. Do not bypass the guard. |
| Missing/incomplete catalog | Bootstrap using the repository's configured Supabase seed. The generator does not reconstruct missing reference data. |
| pgcrypto missing | Check local Supabase initialization; bcrypt hashing requires the extension. |
| Existing seed/options conflict | Choose a new `--seed`; the command intentionally preserves old fixtures. |
| Partial dataset exists | The campaign is gone but fixture accounts remain. Choose another seed or review cleanup by exact IDs. |
| Lock timeout | Stop conflicting local writes/generators and retry. Preview temporarily acquires write locks too. |
| Unexpected trigger | Review the local trigger and its side effects before changing the tool's allowlist. |
| No campaign after success | A preview succeeded but rolled back. Run again with `--apply` to keep it. |
| Existing login cannot see the campaign | Confirm `--apply`, local app/database configuration, membership output, and cached user/campaign data. |
| Notifications are not visible | Confirm `--apply` and the local app/database. Fresh notifications expire 30 days after generation, not after `--date`; unchanged older datasets may still contain expired rows. Use a new seed for current fixtures. |

There is **no automatic cleanup/reset command**. Review generated IDs and their
dependencies before deleting anything. Deleting only a campaign is not complete
cleanup: auth accounts and other owned content can survive. `supabase db reset`
is a separate destructive operation that erases all local data, including data
unrelated to this generator; do not use it just to remove one fixture campaign.
