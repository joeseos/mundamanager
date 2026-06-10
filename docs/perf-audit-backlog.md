# Performance & Cost Audit Backlog (2026-06)

Source: codebase audit of Vercel invocation/compute and Supabase costs, focused on the
most-viewed pages (`/gang/[id]`, `/fighter/[id]`). Issue #1 from the audit (unconfigured
TanStack QueryClient) was fixed in PR #1747. The remaining nine findings below are drafted
as Trello-ready tickets: each has a problem statement, affected files, suggested approach,
and acceptance criteria.

---

## Ticket 1 — Reduce Supabase query fan-out on gang and fighter pages

**Priority: High · Effort: Large**

**Problem.** A single gang page load executes ~28-30 Supabase queries; a fighter page
~18-25. `getGangFightersList()` (`app/lib/shared/gang-data.ts:914-2011`) alone runs 13+
sub-queries; `getGangCampaigns()` (`gang-data.ts:474-782`) runs 9-10 and contains
sequential per-campaign fallback queries inside a loop (~line 715); `getFighterEquipment()`
(`app/lib/shared/fighter-data.ts:204-502`) runs 5. Every cache invalidation rebuilds the
whole cascade, and even warm renders pay dozens of data-cache lookups. This dominates
Vercel function duration.

**Approach.**
- Quick win first: batch the sequential `campaign_members` fallback loop in
  `getGangCampaigns` into a single `.in()` query.
- Then collapse related sub-queries: equipment + effects + skills for all fighters can be
  fetched in fewer, wider queries (or a Postgres view/RPC) rather than one cached function
  per slice.
- Measure before/after with Vercel function duration on `/gang/[id]`.

**Acceptance criteria.** Gang page executes ≤10 Supabase queries on a cold cache; no
sequential queries inside loops; page renders identically (compare a large gang before/after).

---

## Ticket 2 — Stop capturing the request-scoped Supabase client inside unstable_cache

**Priority: High (correctness/security) · Effort: Medium**

**Problem.** All ~60 cached functions (e.g. `getGangCredits`, `gang-data.ts:246-264`)
close over the per-request, user-authenticated Supabase client, but cache keys are only
entity-scoped (`gang-credits-${gangId}`). Whoever populates a cache entry first does so
under *their* RLS context, and the result is served to every other user. This is a
documented Next.js anti-pattern and a latent data-leak/cache-poisoning bug. It works today
only because page-level permission checks happen at render time.

**Approach.** Inside `unstable_cache` callbacks, use a non-request-scoped client (anon or
service-role, since the cached data is entity-scoped, not user-scoped) created inside the
callback. Keep all permission filtering at render time, where it already lives (e.g.
`app/gang/[id]/page.tsx:125`). Audit the 60 functions in `gang-data.ts`, `fighter-data.ts`,
`get-campaign-data.ts`, `get-user-gangs.ts` — the change is mechanical once the client
factory is chosen.

**Acceptance criteria.** No `unstable_cache` callback references a client passed in from a
request; viewing a gang as owner vs. visitor still shows/hides `note_private` correctly.

---

## Ticket 3 — Replace 34× revalidatePath('/') with granular tag invalidation

**Priority: High · Effort: Medium (~1 day)**

**Problem.** 34 call sites invalidate broad caches on every custom-content mutation,
forcing full query-cascade rebuilds on subsequent views. Locations:
`app/actions/customise/custom-trading-posts.ts` (×11), `custom-skills.ts` (×6),
`custom-share.ts` (×5), `custom-equipment.ts` (×3), `custom-fighters.ts` (×3),
`custom-gang-types.ts` (×3), `custom-weapon-profiles.ts` (×1), plus `create-gang.ts:53`,
`copy-gang.ts:605`, `auth.ts:215`.

**Approach.** The granular tag system already exists (`utils/cache-tags.ts`) and the
correct pattern is already used in `create-gang.ts:86-92` (`invalidateGangCreation`,
`invalidateGangCount`). Replace each `revalidatePath('/')` with the specific
`revalidateTag()` calls for the entities the action mutates.

**Acceptance criteria.** Zero `revalidatePath('/')` outside auth flows; after editing a
custom item, the affected page reflects the change but an unrelated gang page serves from
cache (verify via Vercel logs/x-vercel-cache).

---

## Ticket 4 — Add Cache-Control headers so Cloudflare can cache public API routes

**Priority: High · Effort: Small**

**Problem.** `next.config.js` sets only security headers. Cloudflare caches nothing, so
every request to public reference endpoints (`/api/equipment`, `/api/gang-types`,
`/api/skill-types`, …) is a full Vercel invocation + Supabase read.

**Approach.** Add `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`
to public catalog routes (CDN-only caching: short/zero browser max-age so purges remain
possible). Decision already made: accept the ≤5 min staleness window rather than build
Cloudflare purge plumbing. Optional follow-up: call Cloudflare's purge-by-URL API from the
admin mutation actions so admins see their own edits instantly (purge-by-URL works on all
CF plans; needs CF_ZONE_ID + token with Zone.Cache Purge).

**Acceptance criteria.** `curl -I` on the catalog endpoints shows the header; repeat
requests within the TTL are served by Cloudflare (cf-cache-status: HIT); admin edits appear
within 5 minutes.

---

## Ticket 5 — Add a TTL fallback to unstable_cache entries

**Priority: Medium · Effort: Small**

**Problem.** All ~60 `unstable_cache` calls use `revalidate: false`. If any tag
invalidation path is missed, stale data is served forever; cache entries also accumulate
without bound.

**Approach.** Add `revalidate: 3600` (or longer for near-static reference data) as a safety
net across `gang-data.ts`, `fighter-data.ts`, `get-campaign-data.ts`, `get-user-gangs.ts`,
`get-battle-session-data.ts`, `fighter-advancements.ts`. Tag invalidation remains the
primary freshness mechanism.

**Acceptance criteria.** No `revalidate: false` remains; existing tag-driven invalidation
still works (edit a fighter, see it immediately).

---

## Ticket 6 — Shrink gang/fighter page payloads and memoize heavy client components

**Priority: Medium · Effort: Large**

**Problem.** The gang page serializes ~500KB-1MB of JSON into `initialGangData` props
(`app/gang/[id]/page.tsx:98-146`), slowing TTFB and hydration. Client components are
monoliths: `fighter-advancement-list.tsx` 2,574 lines, `gang.tsx` 1,511,
`fighter-page.tsx` 1,394, `fighter-equipment-list.tsx` 1,130. `gang-page-content.tsx`
defines 15+ `useCallback`s but no child uses `React.memo`, so every state update re-renders
the full tree. `admin-edit-fighter-type.tsx` (2,301 lines) contains a ref-based workaround
for 1000ms-per-keystroke lag — a symptom of the same problem.

**Approach.**
- Trim `initialGangData` to fields the client actually renders (audit usage in
  `gang-page-content.tsx` / `gang.tsx`).
- Wrap the major children of gang/fighter pages in `React.memo` (they already receive
  memoized callbacks, so this is the missing half).
- Split the worst monoliths into per-section components with local state; this should make
  the admin keystroke ref-hack removable.

**Acceptance criteria.** Gang page RSC payload measurably smaller (compare
content-length); typing in admin fighter-type form is smooth with controlled inputs; no
visual/behavioral changes.

---

## Ticket 7 — Fix N+2 query pattern in getUserGangs (home page)

**Priority: Medium · Effort: Small**

**Problem.** `app/lib/get-user-gangs.ts:103-156` issues per-gang queries for variants and
campaigns: 10 gangs = 21 queries on every cold home-page load.

**Approach.** Collect gang IDs and batch: one `gang_variant_types` query with
`.in('id', allVariantIds)` and one `campaign_gangs` query with `.in('gang_id', allGangIds)`,
then group results in JS.

**Acceptance criteria.** `getUserGangs` executes exactly 3 queries regardless of gang
count; home page renders identical gang cards.

---

## Ticket 8 — Cache or push down weapon-profile computation

**Priority: Medium · Effort: Medium**

**Problem.** `applyWeaponModifiers` runs per equipment item per fighter on every cache
rebuild (`fighter-data.ts` ~line 463 and within `getGangFightersList`), costing
~50-100ms of Node CPU per gang render. There are no Postgres RPCs; all aggregation is
billed as Vercel compute.

**Approach.** Either (a) cache the *computed* weapon profiles under the existing
`COMPUTED_*` tag layer so the math runs once per invalidation instead of per render, or
(b) move the aggregation into a Postgres function/view. Option (a) is smaller and fits the
existing cache architecture; start there.

**Acceptance criteria.** Weapon-modifier computation no longer runs on warm renders
(verify via timing log or profiler); displayed weapon stats unchanged.

---

## Ticket 9 — Consolidate duplicate data paths (API routes vs server actions)

**Priority: Low · Effort: Medium**

**Problem.** 63 API routes, several overlapping server actions (e.g. `/api/gangs/[id]`
PATCH vs `app/actions/update-gang.ts`). `components/gang/campaign-tab.tsx:296-332`
refetches captives/stats client-side even though the server already shipped that data.
`/api/equipment` returns the entire catalog unpaginated. Tiptap (~300KB, 11 packages) is
statically imported though it only powers notes tabs.

**Approach.**
- Pick one mutation path per entity (server actions) and delete the redundant API routes.
- Pass captives/stats from the gang page server props instead of refetching in
  `campaign-tab.tsx`.
- `next/dynamic` the tiptap editor components.
- Add pagination or field selection to `/api/equipment` (pairs with Ticket 4).

**Acceptance criteria.** No entity has two write paths; gang page makes no client fetch
for data already in `initialGangData`; tiptap chunks load only when a notes tab opens.
