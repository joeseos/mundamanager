<!-- Title: conventional commit, e.g. fix(fighters): keep the variant when a retype changes fighter_type_id -->

## What & why

<!--
What was broken or missing, what this changes, and what a player will notice.
Prose is fine — the best PRs here read as a short explanation, not a filled-in form.
If it fixes a bug, say what caused it. If it touches live data, say roughly how many rows.
Link related PRs/issues.
-->

## How to verify

<!--
Steps a reviewer can follow on the preview deploy: which page, what to click, what should happen.
Call out anything that only reproduces with specific data — edition, gang type, campaign role,
fighter subtype. Screenshots for UI changes.
-->

- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds — this is the only typecheck; no workflow runs it on the PR
- [ ] Checked in the browser on the affected pages

## Conventions

<!--
Tick what applies, delete the rest. These are the things no CI check will catch.
Each heading links to the reasoning in CONTRIBUTING.md.
-->

**[Layering](https://github.com/joeseos/mundamanager/blob/main/CONTRIBUTING.md#layering)**

- [ ] Gameplay mutations go through a server action in `app/actions/` — not a new API route
      (`app/api/` writes are for admin CRUD and third-party callbacks: Patreon, Discord, email)
- [ ] Page data is loaded server-side in `app/lib/` and passed down from the server component
- [ ] Client-side reads in modals/components use TanStack Query against an `app/api/` route,
      with a query key that includes the entity id (e.g. `['campaign-resources', campaignId]`)

**[Caching](https://github.com/joeseos/mundamanager/blob/main/CONTRIBUTING.md#caching)** — `utils/cache-tags.ts`

- [ ] New cached read has a tag in `TAGS`, and every write path that changes it fires the
      matching `invalidate*` helper
- [ ] Invalidation is called from the choke point, not hand-written per call site
- [ ] Picked the narrowest tag that covers the change (`gangOverview` / `gangStash` /
      `gangPositioning` rather than busting `gang-{id}` wholesale)

**[Permissions and RLS](https://github.com/joeseos/mundamanager/blob/main/CONTRIBUTING.md#permissions-and-rls)**

- [ ] Authorization is enforced server-side (`getAuthenticatedUser`, `checkPermissionCached`,
      `checkAdmin`), not only by hiding the control in the UI
- [ ] New or changed tables/columns are covered by RLS policies, using the
      `private.is_admin()` / `private.is_arb()` helpers where they apply
- [ ] Access checked for each role that can reach it: owner, campaign arbitrator, member, admin

**[Database changes](https://github.com/joeseos/mundamanager/blob/main/CONTRIBUTING.md#database-changes)** — `supabase/`

- [ ] Schema change has a migration in `supabase/migrations/`
- [ ] `supabase/schema/schema.public.sql` left untouched — CI regenerates and commits it
- [ ] Any RPC/trigger edited in the Supabase dashboard is mirrored into
      `supabase/functions/*.sql` (not auto-synced)
- [ ] Edge function changes live under `supabase/edge-functions/` (deployed on merge to `main`)

**[Editions](https://github.com/joeseos/mundamanager/blob/main/CONTRIBUTING.md#editions)**

- [ ] Behaviour checked for both N23 and N26 where the change is edition-sensitive
      (`utils/editions.ts`, the `*RankN23.ts` / `*RankN26.ts` tables)

**Housekeeping**

- [ ] No local `allowedDevOrigins` change committed in `next.config.js`
- [ ] New env vars / GitHub secrets listed here and set before merge

## Preview

<!--
The preview workflow comments a Vercel URL on this PR.
Add the `preview-test` label to also point test.mundamanager.com at this branch.
-->
