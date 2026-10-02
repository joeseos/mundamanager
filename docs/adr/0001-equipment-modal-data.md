# ADR 0001: Where the Equipment modal gets its data

| | |
|---|---|
| Status | Decisions agreed 2026-10-02: D1–D6 keep what is served today, D5 uses option (a), D7 uses a comparison script, and Phase 1 is skipped. Awaiting review of this document before Phase 2. |
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
| 1,055 `fighter_type_equipment` rows not tied to a fighter type | These are 1,023 vehicle-type rows (all N23; see finding 10) plus 32 gang-wide subtype rules. No rows use `custom_fighter_type_id`. There are 25 deny rows. | verified: query |

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
| Trading Post, stash or N23 vehicle | `equipment_tradingpost=true` only (N23 vehicles also send `fighter_type_id`, which holds their vehicle type id) | 15 stash, 75 stash in a campaign, 11 with custom Trading Posts, 4 N23 vehicle | `equipment.tsx:306-309` |
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

The editable Cost field is deliberate. The user also chooses, with the "Use Listed
Cost for Rating" checkbox, whether rating follows the listed price or the typed cost.
The value actually at risk is the client-sent `listed_cost`; see D2.

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
10. **There are two kinds of vehicle, and only N23's is a "vehicle" to this code.**
    - **N23 vehicles** are `vehicles` rows with a `vehicle_types` type. They open the
      "Add Vehicle Equipment" modal (`fighter-page.tsx:1505-1526`, marked N23 only),
      limited to vehicle categories. Their list rules are the 1,023
      `fighter_type_equipment` rows keyed by `vehicle_type_id`, and every one of them
      points at N23 equipment (verified: query). All 41 `vehicle_upgrade` items are N23;
      36 of them get a Body, Drive or Engine slot (verified: query).
    - **N26 vehicles** are fighters whose fighter type has `is_vehicle = true`. There are
      4 such fighter types and 564 fighters; 128 of those fighters' types belong to
      another gang type (verified: query). They open the ordinary Equipment modal with
      their fighter type (`fighter-page.tsx:1482-1503`), so they send the same call
      shapes as any fighter, and the list is labelled "Fighter's List". Their 11 list
      rules are ordinary fighter-type rules.
    - **So:** vehicle-type rules belong in the N23 core file. N26 vehicle rules go in the
      per-gang-type files like any fighter's, and the resolver treats N26 vehicles as
      fighters. That is what the RPC does today: it matches `$3` against both
      `fighter_type_id` and `vehicle_type_id`
      (`get_equipment_detailed_data.sql:266-267`).

## Decisions: answered by what is served today

Rule: each decision takes the behaviour the RPC and modal serve today. The new design
reproduces it, so no phase changes a value a user sees. The one exception is D7, which
has no current behaviour to copy.

### D1. Prices in the Trading Post tab

**Today** (verified, `get_equipment_detailed_data.sql` unless noted):

- The Trading Post tab shows fighter's-list items and Trading Post stock together, and
  prices every row in Trading Post mode:
  - **Price:** the custom Trading Post price, else its override, else the item's base
    cost. Discounts don't apply (`:343-351`).
  - **Rarity:** the custom Trading Post override, else the base value (`:322-323`).
  - **Trade Points:** the cheapest matching discount's Trade Points, else the item's
    own (`:354-357`). Fighter-type discounts therefore still change Trade Points in
    this tab, even though they don't change credits.
  - **Banned:** taken from the custom Trading Posts (`:455`).
- The Fighter's List tab prices in list mode: discounts and list rarity apply, Trade
  Points are `'0'`, and `banned` is false. The campaign Trading Post parameters are not
  sent from this tab (`equipment.tsx:297-317`).
- The Gang Legacy switch only appears on the Fighter's List tab, but its state carries
  over. When it is on, the Trading Post tab also includes the legacy type's list items
  (`equipment.tsx:319-325, 816-828`).

**So:** keep all of this. The Combat shotgun stays 60 on the Fighter's List tab and 70 on
the Trading Post tab.

**Consequence:** Trading Post mode is a pricing mode, not only a channel. In the offer
model, the `trading_post` offer exists for every item that is Trading Post stock *or*
on the fighter's list, and the Trading Post tab shows it for both. For N23 vehicles and
the stash, that tab shows Trading Post stock only (`equipment.tsx:302-309`). N26
vehicles are fighters and get the combined call like any other (finding 10).

### D2. Editable Cost, Trade Points and resource fields

**Today** (verified): the purchase dialog separates what the gang pays from what counts
towards rating.

- **What the gang pays:** the Cost field, pre-filled with the listed price. The user
  can change it, and the server charges what was typed (`purchase-modal.tsx:42,
  471-490`; `equipment.ts:477, 823`).
- **What counts towards rating:** the user chooses with the "Use Listed Cost for
  Rating" checkbox. It is ticked by default. Ticked, rating uses the listed price;
  unticked, it uses the typed cost. Master-crafted +25% is added server-side
  (`purchase-modal.tsx:45, 553-567`; `equipment.ts:478-492`).
- **Trade Points:** typed and charged as typed, in N26 (`equipment.ts:542-546`).
- **Resource amount:** typed, but rejected when it differs from a configured amount the
  server finds (`equipment.ts:535-539`).
- **The listed price itself:** sent by the client as `listed_cost`
  (`use-purchase-equipment.ts:107`).

**So:** keep the fields, the checkbox and the charge. The typed cost is the user's own
choice, so the server does not need to distrust it. The only value the server stops
taking from the client is `listed_cost`. The buy action re-resolves it for the tab the
item was bought from, and uses it when the box is ticked. On today's data it equals
what the modal displayed, so nothing visible changes. This is how "never trust a price
sent by the client" applies here: to the listed price, not to the amount the user chose
to pay.

### D3. Whose custom equipment

**Today** (verified, `get_equipment_detailed_data.sql:293-313, 723`): three sources are
shown:

- the **viewer's** own custom equipment,
- custom equipment shared with the gang's campaign,
- custom equipment stocked by the custom Trading Posts the request names.

**So:** keep the viewer. An admin or arbitrator who opens another player's gang still
sees their own custom items.

### D4. Which campaign row, and which Trading Posts

**Today** (verified):

- **Allegiance and shared custom equipment** come from the gang's `campaign_gangs`
  row whatever its status (`get_equipment_detailed_data.sql:76-81, 300-304`).
- **Both Trading Post id lists** come from `getGangCampaigns`, which does not filter by
  status. The modal takes the first entry (`gang-data.ts:474-494`,
  `fighter-page.tsx:674-681`).
- **Production:** no gang has more than one row. 268 PENDING rows carry a Trading Post
  list.
- **Official Trading Posts in the Trading Post tab:**
  - A gang in a campaign gets exactly `campaigns.trading_posts`. Its own gang type's
    post is included only if listed (`get_equipment_detailed_data.sql:90-98, 112-118`).
  - 190 campaign gangs belong to a campaign that lists none, so they get no official
    Trading Post stock.
  - 64 belong to a campaign that leaves out their own post.
  - A gang not in a campaign gets its gang type's own post.
- **Custom Trading Posts:** `campaigns.custom_trading_posts` (91 campaign gangs have
  some).
- **Other tabs:** the Fighter's List and Unrestricted tabs send no campaign ids. The
  "Trading Post" source in the item tooltip there names the gang type's own post
  (`equipment-tooltip.tsx:36-37`).

**So:** the overlay derives the same row and the same id lists server-side, per tab as
above. It sorts the rows explicitly so a second row, if one ever appears, is chosen the
same way every time. No gang has one today, so no output changes.

### D5. Who can read the catalogue

**Today** (verified): signed-in users only.

- Every source table allows `SELECT` to `authenticated` only (`pg_policies`).
- The RPC is revoked from `anon` (`get_equipment_detailed_data.sql:740-743`).

**So:** the snapshot is signed-in only. No public URL.

**Consequence for Phase 4:** a shared CDN cache cannot serve a signed-in-only response,
so the snapshot is fetched once per user per version rather than once per version. At
today's traffic:

- 1,181 distinct users called the RPC in the last 24 hours, across 2,131 user-hours
  (verified: edge logs).
- Catalogue tables were written in at least 60 distinct hours over the last 30 days,
  on 22 of those days (verified: `created_at`/`updated_at`; deletes are not visible
  this way).

There are two ways to deliver it. Either is never per open:

| Option | How | Vercel invocations | Notes |
|---|---|---|---|
| (a) Vercel route | Under `/api/`. Verifies the JWT locally, builds once per version through the Next data cache, and returns `Cache-Control: private, max-age=31536000, immutable`. | Once per user per version, roughly 1.2k–2.1k a day at today's traffic | Closest to the original design (inferred) |
| (b) Supabase GET | Parts stored per version in a table and read through a `STABLE` function over PostgREST `GET`, with the same header set through `response.headers`. | None | Needs a build step the first time a version is requested. The gateway passing the header through is unverified. |

**Chosen (2026-10-02):** option (a), the Vercel route.

### D6. The Unrestricted tab

**Today** (verified):

- **Rows:** every item of the gang's edition (`get_equipment_detailed_data.sql:588-593`)
  plus the visible custom items.
- **Prices:** list mode. Gang-type, fighter-type and affiliation discounts apply.
  Legacy discounts don't, because the list flag isn't sent (`:199, 210`).
- **Rarity:** list rarity.
- **Trade Points:** the discount's, else the item's, never `'0'`. They are charged in
  N26 (`equipment.tsx:166-169`).

**So:** keep exactly that.

### D7. How to check the new code against the old

There is nothing to copy. Nothing collects client-side logs today: there is no logging
package in `package.json` and no log table or action (verified). Shadow mode in the
browser would need new client code and a log table, both thrown away in Phase 8.

**Chosen (2026-10-02):** no browser shadow mode. Phase 7 becomes a comparison script run
against production, kept light on the database. The load limits are in the phase plan.

## Decision (proposed)

The target design stands, with the D1–D7 answers applied:

- **Offers per channel.** Each item gets one offer per channel: `fighter_list`,
  `trading_post` and `custom_tp:<id>`. Each offer has its own price, Trade Points,
  rarity, resource cost and banned flag, with values as D1 and D6 describe. Note that
  the `trading_post` offer also exists for fighter's-list items. There are no mode
  flags; the modal filters locally.
- **Rules view first.** An `equipment_rules` view unions the existing rule tables into
  one shape: kind, scope columns, specificity and value. No table migration yet.
- **Snapshot.**
  - One core file per edition. It holds items, profiles, Trading Post stock, discounts,
    rarity, count limits, and rules not tied to a fighter type. Those are the N23
    vehicle-type rules, which only the N23 file has, and the gang-wide subtype rules.
    N26 vehicles' rules are fighter-type rules (finding 10).
  - One fighter's-list rules file per gang type, **keyed by the gang type that owns
    each fighter type**. The modal loads the fighter type's file, plus the legacy and
    affiliation types' files when they differ.
  - Compact encoding: integer indexes instead of repeated UUIDs, only the columns
    needed, arrays rather than keyed objects.
  - Signed-in only (D5).
- **Version.** A `catalogue_version` row, bumped by statement-level `SECURITY DEFINER`
  triggers on every table the snapshot reads. The admin PATCH bumps it many times per
  save, which is acceptable: only the last version is requested again.
- **Snapshot delivery.** One SQL function returns the version and the data from the
  same statement. A Vercel route under `/api/` serves it (D5 option (a)):
  - It verifies the JWT locally.
  - It builds each version once through the Next data cache.
  - It responds with `Cache-Control: private, max-age=31536000, immutable`.
  - A request for a stale version gets a `no-store` redirect to the current one.
- **Overlay RPC.** It derives all context from `gang_id` server-side and checks the
  caller can edit the gang. It returns the current `catalogue_version` and:
  - the viewer's, campaign-shared and campaign-custom-Trading-Post custom items (D3),
  - the gang's campaign row whatever its status (D4),
  - the authorised official and custom Trading Post ids, by today's rules (D4),
  - custom fighter type lists,
  - campaign resource names.

  It never accepts Trading Post ids from the client. On today's data, deriving them
  server-side gives the same ids the client sends now.
- **Resolver.** A pure module (`lib/equipment/resolve.ts`) with no React or Supabase
  imports. The modal loads the snapshot with React Query, keyed on the version, with
  `staleTime: Infinity` and a long `gcTime`.
- **Buy action.** The client names the tab the item was bought from. The server checks
  the item is offered there, which for Unrestricted means anything in the gang's
  edition, and that it isn't banned. It then re-resolves the listed price in place of
  the client's `listed_cost`, which rating uses when the user ticks "Use Listed Cost for
  Rating". It charges the typed amount, as today (D2). The UI already prevents
  everything these checks reject, so no visible behaviour changes.

## Phase plan

One PR per phase; stop after each. Database phases add a migration under
`supabase/migrations/` and update the matching file under `supabase/functions/`. Nothing
is applied to production without asking first.

1. **Skipped (2026-10-02): one call for both tabs.**
   - With D1 it would change no price. It would only save the refetch when switching
     to the Trading Post tab: 838 of about 10.5k calls in the 22.6-hour window.
   - The cost: every Fighter's List open would return more rows. Phase 8 removes tab
     refetches anyway.
2. **Compute derived fields at save time.** Vehicle slot and grant option names are
   currently worked out on every read (`get_equipment_detailed_data.sql:394-437`).
   Option names also change when a granted item is renamed, so that rename must update
   them too. The vehicle slot only exists for N23 `vehicle_upgrade` items today
   (finding 10).
3. **Rules view, version table and triggers.** Add `equipment_rules`, `catalogue_version`,
   and statement-level triggers on every table the snapshot reads. That includes
   `fighter_effect_types`, `fighter_effect_type_modifiers`, `gang_types`,
   `exotic_beasts`, `weapon_profiles`, the Trading Post tables and `count_limits`.
4. **Snapshot function, delivery and compact encoding.** Use D5 option (a), the Vercel
   route under `/api/`.
   Report the compressed size of the core file and of the largest gang-type file.
   Confirm that per-edition partitioning still loses nothing (finding 2).
5. **Overlay RPC**, as described above.
6. **Resolver with golden tests.**
   - **Shapes.** Generate fixtures from the live RPC using the list-only, Trading
     Post-only and Unrestricted shapes, **plus the combined shape**. Under D1 the
     combined shape is the only source of Trading Post-tab values for fighter's-list
     items outside Trading Post stock: the Trading Post-only shape doesn't return them,
     and the list-only shape prices them differently.
   - **Gangs.** Reuse #2183's equivalence set: 14 gangs × 11 call shapes, plus the 5
     most recently updated gangs each of Outcasts (N26), Underhive Outcasts (N23),
     Venators (N23) and Venators (N26).
   - **Extra cases.**
     - Fighters whose type, legacy or affiliation comes from another gang type
       (finding 1).
     - A gang in a campaign with no listed Trading Posts, and a PENDING one (D4).
     - Both kinds of vehicle: an N23 vehicle through the vehicle modal, and an N26
       vehicle fighter, including one whose type comes from another gang type
       (finding 10).
7. **Compare old and new on production data (D7).** This replaces browser shadow mode.
   - **What it is.** A script run from a developer machine, not shipped in the app. For
     a sample of real gangs and fighters it calls the live RPC and the new resolver with
     the same inputs, and lists every difference. The UI does not change.
   - **It must not load the database noticeably:**
     - **Few calls.** Fighters with identical inputs are grouped, and the RPC is called
       once per group, not per fighter. The inputs are gang type, fighter type, origin,
       subtypes, legacy, affiliation, campaign Trading Posts and tab. The resolver side
       loads the snapshot once per run; the overlay is one small call per gang.
     - **One call at a time**, at least 4 seconds apart, so at most 900 an hour. A
       normal busy hour of the app today is about 1,000 calls (20:00 UTC).
     - **Quiet hours only**, 05:00–09:00 UTC, when the app makes 390–650 calls an hour
       (verified: edge logs for the 24 hours to 2026-10-01 20:00 UTC).
     - **Read-only and time-boxed.** Each call runs in a read-only transaction with a
       5-second statement timeout.
     - **Backs off.** It pauses after a call slower than 2 seconds, and stops after
       three in a row or on any error.
     - **Capped and resumable.** At most 3,000 calls per run. Progress is saved
       locally, so the next run continues where this one stopped.
   - **Custom equipment** depends on `auth.uid()`, so each gang's calls run as its
     owner, as #2183's equivalence test did.
8. **Switch over.** Switch the modal, then the buy action (as D2 describes), then retire
   the RPC once nothing calls it.

## Consequences

- **Fewer database calls per open.** One small overlay call replaces a 160–340 ms RPC.
  Tab toggles and the Legacy switch become local. The snapshot is fetched once per user
  per catalogue version (D5).
- **Shared, testable resolution.** Price and availability rules are resolved in
  TypeScript, shared by the modal and the buy action. They are covered by golden tests
  and by a throttled comparison against production.
- **No visible change.** No value a user sees changes. The buy action only adds
  server-side checks that reject requests the UI cannot make.
- **Today's quirks are kept on purpose:** the 60 vs 70 split, Trade Points discounts on
  the Trading Post tab, viewer-based custom equipment, and PENDING campaign rows.
  Changing any of them later is a separate, deliberate PR.
- **New moving parts:** a version table, triggers on about 20 tables, a snapshot
  delivery path, and a client cache that must be keyed on the version.
- **Mid-save snapshots.** Until the admin PATCH runs in one transaction, a snapshot can
  catch a half-applied save (question 6).

## Out of scope

- `get_fighter_types_with_cost`. It repeats the same scope matching for
  `fighter_type_availability` and prices loadouts without `equipment_discounts`.
- Modelling lists as collections of entries, each with its own price and "offered to"
  rules, as Gyrinx's N26 rebuild does.
