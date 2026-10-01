# ADR 0001: Where the Equipment modal gets its data

| | |
|---|---|
| Status | Proposed. Phase 0 (investigation) is done; nothing after it has started. |
| Date | 2026-10-01 |
| Scope | `components/equipment/equipment.tsx`, `buyEquipmentForFighter`, `public.get_equipment_detailed_data` |

Every claim below is labelled **verified** (with a `file:line` or the production query
it came from) or **inferred**. Line numbers are against `main` at `f726596`. Production
queries were read-only, run on 2026-10-01 against project `iojoritxhpijprgkjfre`.
`pg_stat_statements` was last reset at 2026-09-30 21:21 UTC, so its counts cover about
22.6 hours.

## Context

The Equipment modal asks Postgres to resolve the whole equipment catalogue for one
fighter, vehicle or gang stash every time it opens. It does this by calling
`get_equipment_detailed_data` straight from the browser through PostgREST. That function
is a ~34 KB `LANGUAGE sql` statement that resolves six concerns at once: fighter's-list
grants and denies, Trading Post access, price, rarity, count limits and display data.
Two mode flags (`fighter_type_equipment`, `equipment_tradingpost`) change the values it
returns as well as which rows it returns.

The proposal is to replace the per-open call with:

1. a versioned, CDN-cached rules snapshot,
2. a small per-gang overlay call, and
3. one pure TypeScript resolver that both the modal and the buy action use.

### Starting facts, re-checked

| Fact in the brief | Re-check | Source |
|---|---|---|
| ~11.2k POSTs/day, all from browsers | 10,495 calls as `authenticated` in 22.6 h, about 11.1k/day. A further 36 calls ran as `postgres`; these were manual tests, not the app. | verified: `pg_stat_statements` |
| ~8.7k fighter's-list only, ~780 combined, 16 with custom Trading Post ids | 8,657 fighter's list without `fighter_id` (9,312 including the variants), 838 combined, 28 with custom Trading Post ids. The brief left out two more shapes: **214 Unrestricted** (no flags) and **105 Trading Post only**. Full table under question 1. | verified: `pg_stat_statements` |
| `only_equipment_id` and `equipment_category` never appear | Confirmed. No recorded shape includes them, and no app code sends them. | verified: `pg_stat_statements`, `equipment.tsx:285-325` |
| Combat shotgun costs 60 list-only and 70 combined | Confirmed for a House Goliath Bruiser: list-only 60, list + Trading Post 70, Unrestricted 60. | verified: query calling the live RPC with `only_equipment_id` |
| 1,055 `fighter_type_equipment` rows not tied to a fighter type | These are 1,023 vehicle-type rows plus 32 gang-wide subtype rules. No rows use `custom_fighter_type_id`. There are 25 deny rows. | verified: query |

## Phase 0 findings

### 1. What the modal sends, and when

**Call shapes.** The request body is built in `equipment.tsx:285-325`. Shapes, with their
production counts:

| Tab and caller | Parameters (beyond `gang_id`, plus `gang_type_id` when the gang has one) | Calls | Source |
|---|---|---|---|
| Fighter's List (the default when opened from a fighter) | `fighter_type_id`, `fighter_type_equipment=true` | 8,657, plus 16 for custom gang types (no `gang_type_id`) | `equipment.tsx:137-139, 297-299` |
| Same, with `fighter_id` | plus `fighter_id` when the gang has an affiliation or the Gang Legacy switch is on | 639 | `equipment.tsx:319-325` |
| Trading Post, fighter | `fighter_type_id`, `fighter_type_equipment=true`, `equipment_tradingpost=true` (the **combined** call) | 426 + 108 with `fighter_id` | `equipment.tsx:300-305` |
| Same, gang in a campaign | plus `campaign_trading_post_type_ids` | 257 + 22 with `fighter_id` + 8 for custom gang types | `equipment.tsx:310-313` |
| Same, campaign has custom Trading Posts | plus `campaign_custom_trading_post_ids` | 17 | `equipment.tsx:314-316` |
| Trading Post, stash, vehicle or custom fighter | `equipment_tradingpost=true` only (vehicles also send `fighter_type_id`) | 15 stash, 75 stash in a campaign, 11 with custom Trading Posts, 4 vehicle | `equipment.tsx:306-309` |
| Unrestricted | no flags | 187 fighter, 12 with `fighter_id`, 7 custom gang type, 8 stash | `equipment.tsx:296-317` (neither flag set) |

All counts: verified, `pg_stat_statements`, grouped by the parameter list PostgREST
records.

**When a call is made.** All verified:

- **On every open.** Both callers mount the modal conditionally
  (`fighter-page.tsx:1482-1503`, `1506-1526`; `stash-tab.tsx:993-1013`), so every open
  starts from empty state. Once the session resolves (`equipment.tsx:192-199`), the
  effect at `equipment.tsx:525-543` fetches the current tab.
- **On tab toggles, the first time per tab.** Each radio button clears
  `fetchedContextsRef` and empties the list (`equipment.tsx:743-747, 759-763, 774-778`).
  The effect then fetches unless that tab's bucket is already cached
  (`equipment.tsx:419-434, 507-521, 531-533`).
- **On every visit to the Trading Post tab while the gang is in a campaign.** That
  result is never cached (`equipment.tsx:427-433`, `533`), so each switch back to Trading
  Post refetches.
- **On every Gang Legacy switch.** The switch calls `fetchAllCategories` directly
  (`equipment.tsx:816-828`) and overwrites the Fighter's List bucket.
- **Other reads.** A vehicle with no `vehicleTypeId` first reads `vehicle_types`
  (`equipment.tsx:201-228`). A fighter with no `fighterTypeId` first reads `fighters`
  (`equipment.tsx:245-271`).

**Inferred race.** `fetchAllCategories` writes to `setEquipment` whatever tab it was
called for (`equipment.tsx:437-438`). A tab switch while a fetch is in flight can briefly
show the previous tab's rows until the next fetch replaces them.

**Is a price from the combined call ever shown or charged for a fighter's-list item?**
Yes. All verified:

- In the combined call, any row has `adjusted_cost = e.cost` when
  `equipment_tradingpost = true` and no custom Trading Post override applies, so
  fighter-type and gang-type discounts are dropped
  (`get_equipment_detailed_data.sql:343-351`, branch at `:349`). Availability falls back
  to the base value (`:322-332`).
- The modal shows these rows in the Trading Post tab with a "Fighter's List" badge
  (`equipment.tsx:370-375, 934-938`). It displays `adjusted_cost` (`equipment.tsx:942-961`).
- The purchase dialog pre-fills the cost with `adjusted_cost` (`purchase-modal.tsx:42`).
  The hook sends `listed_cost = adjusted_cost` (`use-purchase-equipment.ts:107`). The
  server charges `manual_cost ?? listed_cost` and rates with `listed_cost`
  (`app/actions/equipment.ts:477-480`). Buying a Combat shotgun for a Bruiser from the
  Trading Post tab therefore charges 70 and adds 70 to rating, where the Fighter's List
  tab charges 60.
- In N26, the Trading Post tab also charges Trade Points for these items
  (`equipment.tsx:169`; `purchase-modal.tsx:85-89, 101-102`). The list-only call
  returns `trade_points = '0'` (`get_equipment_detailed_data.sql:354-357`).
- The Unrestricted tab prices like the Fighter's List: discounts apply, and so do
  gang-type and origin rarity overrides (`get_equipment_detailed_data.sql:324-331, 350`).
  Only the Trading Post tab drops them.

### 2. The buy path and where the price comes from

The path is: the modal's `PurchaseModal` → `usePurchaseEquipment`, or the parent's
optimistic handler → `buyEquipmentForFighter`. The optimistic handlers pass `params`
through unchanged (`fighter-equipment-list.tsx:133-164`, `vehicle-equipment-list.tsx:519-548`).

| Value | Where it comes from | Trusts the client? | Source |
|---|---|---|---|
| Credits charged | `manual_cost ?? listed_cost ?? equipment.cost` | **Yes.** The cost field is a free-text input pre-filled with `adjusted_cost`. A code comment says the trust is deliberate. | `purchase-modal.tsx:42, 471-490`; `use-purchase-equipment.ts:102, 107`; `equipment.ts:472-477` |
| Rating cost | `listed_cost` when "Use Listed Cost for Rating" is on (the default), otherwise the paid cost | **Yes.** Master-crafted +25% is added server-side and gated by edition. | `purchase-modal.tsx:45, 553-567`; `equipment.ts:478-492` |
| Trade Points | `manual_trade_points ?? equipment.trade_points`. The client always sends it in N26. | **Yes.** It is only checked against the gang's balance. | `purchase-modal.tsx:87-89, 101-102, 521-526`; `equipment.ts:542-552` |
| Campaign resource amount | Client `resourceCost.amount` | **Partly.** It is compared with `custom_trading_post_equipment.cost_resource_amount` only when a matching row is found. The lookup does not filter by Trading Post or by the campaign's authorised posts. | `equipment.ts:496-540` |
| Granted equipment cost | `grants_equipment.options[].additional_cost`, read from the database | No | `equipment.ts:645-713` |
| Affordability | Server compares the gang's credits with the charged cost | No | `equipment.ts:499-502` |

The server never checks whether the item is actually available to this buyer: no check
of fighter's list, Trading Post, `banned`, count limits or edition (verified: none of
these are read in `equipment.ts:309-1125`). `banned` is enforced only by the disabled
Buy button (`equipment.tsx:993-1008`). The base `cost` read at `equipment.ts:385-470` is
only a fallback.

**Inferred:** "never trust a price sent by the client" collides with a deliberate
feature, the editable Cost field. See decision D2.

### 3. Every caller of `get_equipment_detailed_data`

- **App code:** one call site, `components/equipment/equipment.tsx:327-338`. The
  only other mentions are a comment (`app/actions/equipment.ts:543`) and SQL comments in
  migrations (verified: grep over `app`, `components`, `hooks`, `utils`, `supabase`).
- **SQL:** no function, view or `cron` job calls it. `get_fighter_types_with_cost`
  mentions it only in a comment (verified: `pg_proc.prosrc`, `pg_views`, `cron.job`).
- **Edge functions:** none (verified: grep over `supabase/edge-functions`).
- **`only_equipment_id` and `equipment_category`:** never sent by app code, and never
  seen in production (verified: above). They are still in the signature
  (`get_equipment_detailed_data.sql:12, 17`).

`app/actions/equipment.ts:474` still refers to `get_equipment_with_discounts`, and
`supabase/README.md` lists it. Neither is evidence that the function is used.

### 4. Who can open the Equipment modal

Anyone with `canEdit` on the gang: the gang owner, a site admin, or the OWNER or
ARBITRATOR of a campaign the gang has **accepted** a place in. All verified:

- `deriveGangPermissions` and `isArbitrator`: `utils/user-permissions.ts:81-101`.
- The ACCEPTED filter: `supabase/functions/check_permission.sql:37-48`.
- The Add buttons are disabled without `canEdit`: `fighter-equipment-list.tsx:871-875`,
  `vehicle-equipment-list.tsx:940-941`, `stash-tab.tsx:835-836`.

This gate is UI-only. The RPC is granted to every `authenticated` user and does not
check gang ownership, so anyone signed in can call it with any `gang_id` (verified:
`get_equipment_detailed_data.sql:740-743`; there is no ownership predicate in the body).

**Consequence:** custom equipment is matched on the viewer
(`get_equipment_detailed_data.sql:296, 723`). An admin or arbitrator who opens another
player's modal sees their own custom equipment instead of the owner's, and can buy it
for that gang.

### 5. Can a gang be in more than one campaign?

The schema allows it, the UI prevents it, and production has none.

- **Schema:** no unique constraint, unique index or trigger limits `campaign_gangs.gang_id`
  (verified: `pg_constraint`, `pg_indexes`, `pg_trigger`).
- **Server action:** only rejects the same campaign twice
  (`app/actions/campaigns/[id]/campaign-members.ts:85-96`).
- **UI:** the gang picker disables any gang with a `campaign_gangs` row, including a
  PENDING one (`components/campaigns/[id]/campaign-members-table.tsx:330, 643-644`).
- **Production:** 19,201 gangs have a row, and none has more than one. 272 gangs' only
  row is PENDING (verified: query).

Code on both sides is written as if a gang had many campaigns. The modal takes the
first entry (`fighter-page.tsx:674-681`, `gang-page-content.tsx:613-620`), and the RPC
takes `LIMIT 1` with no `ORDER BY` (`get_equipment_detailed_data.sql:76-81`).

**PENDING is the live inconsistency.** `getGangCampaigns` does not filter by status
(`app/lib/shared/gang-data.ts:474-494`). Nor do the RPC's allegiance and campaign-shared
custom equipment (`get_equipment_detailed_data.sql:76-81, 300-304, 668-673`). An invited
but not yet accepted gang therefore gets that campaign's Trading Post restrictions,
allegiance and shared items, but `check_permission` does not treat it as a member.

### 6. The admin equipment PATCH

It makes many separate PostgREST calls. There is no transaction and no RPC (verified:
`app/api/admin/equipment/route.ts:619-1215`):

- An `UPDATE` of `equipment` (`:666-686`).
- Delete and re-insert of `weapon_profiles` (`:691-721`).
- Delete and re-insert of `fighter_type_equipment` (`:727-762`).
- Delete and re-insert of gang-type discounts, origin discounts, three kinds of
  availability and `count_limits` (`:766-976`).
- Effects and modifiers in a loop (`:987+`).

Each call commits on its own. Several failures are logged and not thrown (for example
`:808, 828, 845`), so a request can return success after a partial write. The route
calls no `revalidateTag`, and `utils/cache-tags.ts` has no equipment catalogue tag
(verified: grep).

Consequences for the version trigger (inferred):

- One save bumps the version about 10–25 times, once per statement.
- A snapshot built between two of those statements captures a half-applied edit, for
  example an item briefly missing from every list between the delete and re-insert of
  `fighter_type_equipment`. The next statement's bump makes that version stale, so the
  half-applied state is only served to someone who fetched inside that window.

### 7. How the gang and fighter pages load data

Both are dynamic server components. They read cookies through `createClient`, so each
request renders on a Vercel function (`app/gang/[id]/page.tsx:23-91`,
`app/fighter/[id]/page.tsx:11-63`). Their data comes from per-entity `unstable_cache`
entries with `revalidate: false`, busted by tag from server actions (verified):

| Loader | Cache tags | Fields relevant here | Source |
|---|---|---|---|
| `getGangCore` | `gang-{id}`, `global-gang-types` | `gang_type_id`, `custom_gang_type_id`, `gang_origin_id`, `gang_subtypes`, `alignment`, `gang_affiliation_id`, `edition_slug`, `user_id`, `credits`, `trade_points`, `reputation` | `gang-data.ts:153-249` |
| `getGangCampaigns` | `gang-campaigns-{id}`, `campaign-*-{cid}` | campaign id, `campaign_gang_id`, `trading_posts`, `custom_trading_posts` and their names, allegiance, resources and quantities | `gang-data.ts:445-780` |
| `getGangFightersBundle` | `gang-roster-{id}` | fighter type, subtypes, legacy, custom fighter type | `gang-data.ts:802-1129` |

Where things can come from:

- **Gang context: the page.** Everything the resolver needs about the gang is already in
  the props. The buy action can re-read the same cached loaders server-side to derive
  context without trusting the client.
- **Catalogue version: not the page.** These entries are never invalidated by catalogue
  edits. Nothing busts a tag on an admin save, and a database trigger cannot call
  `revalidateTag`. A version in page props would be stale until something else busted
  the gang's cache. The version has to come from a fresh read when the modal opens,
  which the overlay RPC already is.
- **Cost of that read:** the overlay is a browser-to-Supabase call, as the current RPC
  is, so it adds no Vercel invocations.

### Other findings that change the design

1. **Rules files must be keyed by the fighter type's gang type, not the gang's.**
   83,435 of 835,779 fighters (10%) have a fighter type from another gang type (Hired
   Guns, Hangers-on and the like). Every one of the 20,346 legacy fighters reaches a
   list through another gang type's fighter type. So do 22,035 fighters in affiliated
   gangs (verified: query). A modal may need up to three rules files: the fighter
   type's, the legacy type's and the affiliation type's. The RPC already reads all
   three identities (`get_equipment_detailed_data.sql:65-66, 266-272`).
2. **Per-edition files lose nothing today.** No `fighter_type_equipment` or Trading Post
   row points at equipment of another edition, and no equipment or fighter type lacks an
   edition or gang type (verified: query). The schema doesn't enforce this. In list and
   Trading Post modes the RPC does not filter official equipment by edition
   (`get_equipment_detailed_data.sql:588-593`).
3. **The catalogue is not public today.** Every snapshot table allows `SELECT` to
   `authenticated` only (verified: `pg_policies`). A public CDN URL would expose it to
   signed-out visitors. See decision D5.
4. **A `/api/*` route won't get session cookies.** The proxy skips `/api/` and `*.json`
   (`proxy.ts:118-130`). A snapshot route there therefore gets no `Set-Cookie`, which
   would otherwise stop the CDN caching it.
5. **Custom Trading Post data is already readable by everyone signed in.** All
   `custom_trading_post_*`, `custom_equipment` and `custom_shared` tables allow `SELECT`
   to `authenticated` (verified: `pg_policies`). Client-supplied `$10` therefore leaks
   nothing. The real problem is authority: the client picks which custom Trading Posts
   are offered and priced (`get_equipment_detailed_data.sql:127-128, 251-252, 311-312, 707-708`).
6. **"First row wins" ambiguities are latent.** These are the origin rarity `LIMIT 1`
   (`get_equipment_detailed_data.sql:326-327`), the multi-row availability joins
   (`:464-473`) and the modal's dedupe by first `equipment_id` (`equipment.tsx:378-382`).
   No `(equipment_id, scope)` key in `equipment_availability` has conflicting rows today
   (verified: query). The resolver should define an order rather than inherit one.
7. **Deploys run in parallel.** A merge to `main` runs `psql -f` on each changed
   `supabase/functions/*.sql` file (`.github/workflows/deploy_supabase_functions.yml`).
   The same push deploys Vercel (`.github/workflows/deploy.yml`). Without
   `BEGIN`/`COMMIT` in the file, psql commits a `DROP` before the `CREATE`, so callers
   briefly see the function missing. The app and the database also go live in either
   order.
8. **Self-hosting.** `next.config.js:3-5` and `README.md` ("Self-Hosted Caching
   (Coolify)") describe a Coolify deployment with no Vercel CDN. Without a CDN or proxy
   in front, "built once per version" holds per browser, not globally (inferred).
9. **React Query's default `gcTime` is 10 minutes** (`app/providers/query-client-provider.tsx:15-16`).
   A snapshot query needs its own `gcTime`. Otherwise reopening after 10 idle minutes
   refetches it, cheaply, from the browser's HTTP cache.

## Decisions needed before Phase 1

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | What should a fighter's-list item cost when bought from the Trading Post tab? | (a) List price and no Trade Points, as on the Fighter's List tab. (b) The Trading Post price, as today. (c) Show both offers. | (c) in the target design, with (a) as the default the Buy button uses. Phase 1 makes this possible without a refetch. |
| D2 | What happens to the editable Cost, Trade Points and resource fields? | (a) Keep them as an explicit override. The server resolves the listed price, uses it for rating and as the default charge, and logs any override. (b) Remove them. | (a). Players use the override for house rules. "Never trust the client" then applies to the listed price, the rating and availability. |
| D3 | Whose custom equipment does the modal show? | (a) The viewer's, as today. (b) The gang owner's plus campaign-shared items. | (b). Admins and arbitrators edit on the owner's behalf. |
| D4 | Which campaign counts? | (a) Any `campaign_gangs` row, as today. (b) ACCEPTED only, matching `check_permission`. | (b). Consider a unique partial index on `campaign_gangs(gang_id) WHERE status = 'ACCEPTED'` as a separate change. |
| D5 | Who can read the snapshot? | (a) Public, cached by the CDN. (b) Signed-in only, which means no shared CDN cache and a function call per user per version. (c) Public files in Storage, written when the version bumps. | (a) if catalogue rules may be public. They contain no user data. Otherwise (c). |
| D6 | Does the Unrestricted tab keep list pricing and rarity? | Keep, or switch to base values. | Keep. It is unchanged today and outside the 60 vs 70 issue. |
| D7 | Where does Phase 7 send its difference logs? | (a) Console only. (b) A sampled insert into a Supabase table. (c) A Vercel route, which breaks the no-new-invocations rule. | (b), sampled. |

## Decision (proposed)

The target design stands, with these changes from Phase 0:

- **Offers per channel.** Each item gets one offer per channel: `fighter_list`,
  `trading_post` and `custom_tp:<id>`. Each offer has its own price, Trade Points,
  rarity, resource cost and banned flag. There are no mode flags; the modal filters
  locally.
- **Rules view first.** An `equipment_rules` view unions the existing rule tables into
  one shape: kind, scope columns, specificity and value. No table migration yet.
- **Snapshot.**
  - One core file per edition. It holds items, profiles, Trading Post stock, discounts,
    rarity, count limits, and rules not tied to a fighter type (vehicle rules and
    gang-wide subtype rules).
  - One fighter's-list rules file per gang type, **keyed by the gang type that owns
    each fighter type**. The modal loads the fighter type's file, plus the legacy and
    affiliation types' files when they differ.
  - Compact encoding: integer indexes instead of repeated UUIDs, only the columns
    needed, arrays rather than keyed objects.
- **Version.** A `catalogue_version` row, bumped by statement-level `SECURITY DEFINER`
  triggers on every table the snapshot reads. The admin PATCH bumps it many times per
  save, which is acceptable: only the last version is requested again.
- **Snapshot route.** It lives under `/api/`, so the proxy adds no cookies. One SQL
  function returns the version and the data from the same statement. The route serves
  them with `Cache-Control: public, max-age=31536000, immutable`, or the D5 alternative.
  A request for a stale version gets a `no-store` redirect to the current one.
- **Overlay RPC.** It derives all context from `gang_id` server-side and checks the
  caller can edit the gang. It returns the current `catalogue_version` and:
  - custom items, chosen per D3,
  - the authorised **official** Trading Post type ids,
  - custom Trading Post rules, for the custom posts the gang's ACCEPTED campaign allows,
  - custom fighter type lists,
  - campaign resource names.

  Both kinds of Trading Post id are decided server-side, never taken from the client.
- **Resolver.** A pure module (`lib/equipment/resolve.ts`) with no React or Supabase
  imports. The modal loads the snapshot with React Query, keyed on the version, with
  `staleTime: Infinity` and a long `gcTime`.
- **Buy action.** It re-resolves the purchased item on the server from cached gang
  context, the overlay data and the snapshot. It uses that listed price for rating and
  as the default charge, and enforces `banned` and availability. Overrides are allowed
  only as D2 decides.

## Phase plan

One PR per phase; stop after each. Database phases add a migration under
`supabase/migrations/` and update the matching file under `supabase/functions/`. Nothing
is applied to production without asking first.

1. **Separate list and Trading Post prices.** Phase 0 confirmed the 60 vs 70 issue. The
   RPC returns list and Trading Post price, Trade Points and rarity as separate columns,
   and the modal stops refetching on tab toggles.
   - Changing the return type needs a `DROP` of the current signature. Wrap the
     function file in `BEGIN`/`COMMIT` so callers never see it missing (finding 7).
   - The app must accept both the old and the new row shape while the two deploys race.
   - Existing columns keep their current values unless D1 says otherwise.
2. **Compute derived fields at save time.** Vehicle slot and grant option names are
   currently worked out on every read (`get_equipment_detailed_data.sql:394-437`).
   Option names also change when a granted item is renamed, so that rename must update
   them too.
3. **Rules view, version table and triggers.** Add `equipment_rules`, `catalogue_version`,
   and statement-level triggers on every table the snapshot reads. That includes
   `fighter_effect_types`, `fighter_effect_type_modifiers`, `gang_types`,
   `exotic_beasts`, `weapon_profiles`, the Trading Post tables and `count_limits`.
4. **Snapshot function, versioned route and compact encoding.** Report the compressed
   size of the core file and of the largest gang-type file. Confirm that per-edition
   partitioning still loses nothing (finding 2).
5. **Overlay RPC**, as described above, with D3 and D4 applied.
6. **Resolver with golden tests.**
   - Generate fixtures from the live RPC per channel, using list-only and Trading
     Post-only shapes, not the combined one.
   - Reuse #2183's equivalence set: 14 gangs × 11 call shapes, plus the 5 most recently
     updated gangs each of Outcasts (N26), Underhive Outcasts (N23), Venators (N23) and
     Venators (N26).
   - Add fighters whose type, legacy or affiliation comes from another gang type
     (finding 1).
7. **Shadow mode.** The modal computes both versions and logs any differences, per D7.
   The UI does not change.
8. **Switch over.** Switch the modal, then the buy action, then retire the RPC once
   nothing calls it.

## Consequences

- **Fewer database calls per open.** One small overlay call replaces a 160–340 ms RPC.
  Tab toggles and the Legacy switch become local.
- **Shared, testable resolution.** Price and availability rules are resolved in
  TypeScript, shared by the modal and the buy action, and covered by golden tests.
- **Server-side validation.** The buy action gains validation it does not have today.
  Behaviour changes are limited to D1–D4, each landing in a named PR.
- **New moving parts:** a version table, triggers on about 20 tables, a cached route, and
  a client cache that must be keyed on the version.
- **Mid-save snapshots.** Until the admin PATCH runs in one transaction, a snapshot can
  catch a half-applied save (question 6).

## Out of scope

- `get_fighter_types_with_cost`. It repeats the same scope matching for
  `fighter_type_availability` and prices loadouts without `equipment_discounts`.
- Modelling lists as collections of entries, each with its own price and "offered to"
  rules, as Gyrinx's N26 rebuild does.
