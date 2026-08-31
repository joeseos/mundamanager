# Contributing to Munda Manager

Thanks for wanting to help. This document covers how to get the app running, and the conventions
the codebase follows — the ones no linter or CI check enforces, so they have to be checked by eye
in review.

For bug reports, feature requests, or questions, join the
**[Discord Community](https://discord.gg/FrqEWShQd7)**. GitHub issues are not the intake route.

- [Setting up your environment](#setting-up-your-environment)
- [Setting up a local Supabase database](#setting-up-a-local-supabase-database)
- [Opening a pull request](#opening-a-pull-request)
- [Architecture and conventions](#architecture-and-conventions)
  - [Layering](#layering)
  - [Caching](#caching)
  - [Permissions and RLS](#permissions-and-rls)
  - [Database changes](#database-changes)
  - [Editions](#editions)
- [Component architecture](#component-architecture)

## Setting up your environment

1. **Prerequisites**
   - Node.js 20.20.2 (see `.nvmrc`)
   - Supabase project url and key
   - Cloudflare Turnstile keys

2. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```
   Configure the following variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=mundamanager-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=mundamanager-turnstile-key
   TURNSTILE_SECRET_KEY=mundamanager-turnstile-secret-key
   NODE_ENV=development
   ```

3. **Running the environment**
   ```bash
   npm install
   npm run dev
   ```

4. **Mobile device testing**

   `npm run dev` already listens on the LAN. The startup log prints a **Network** URL (for example `http://192.168.1.115:3000`). Open that URL on a phone on the same Wi-Fi.

   Next.js still blocks HMR and other `/_next` assets from that origin until you allow it in `next.config.js`:

   ```js
   allowedDevOrigins: ['192.168.1.115'],
   ```

   Use the same IP as the Network URL, then restart the dev server. If you skip this, the page may load but you will see `Blocked cross-origin request to Next.js dev resource` in the terminal.

   Do not commit this `next.config.js` change when you push. `allowedDevOrigins` is your local IP and should stay off the repo.

5. **Access to the DB Schema**
   The Supabase DB schema can be accessed through https://supabase-schema.vercel.app/
   Use the Supabase URL and the and the anon key to connect to it

## Setting up a local Supabase database

Run the whole stack locally with the Supabase CLI so you can experiment with
schema/backend changes without touching the production database.

> **Why are local migrations disabled in config.toml?**
> The files in `supabase/migrations/` are *incremental* deltas for developers
> who already have the full database — they assume base tables that were never
> captured as a migration, so replaying them from empty crashes. Local migration
> auto-run is therefore disabled in `supabase/config.toml`. Instead, `supabase start`
> and `supabase db reset` natively build the fresh local database via `[db.seed].sql_paths`
> in `supabase/config.toml`, loading the committed schema snapshot (`schema.public.sql`),
> helper schemas, role grants, triggers, and game reference data (`seed.sql`) in the exact right order.

**Prerequisites:** [Supabase CLI](https://supabase.com/docs/guides/cli), Docker
(for the local stack), and a `psql` client.

1. **Bootstrap the database** from the repo root:
   ```bash
   supabase start
   ```
   Or if the stack is already running and you want to clean/rebuild your local database from scratch:
   ```bash
   supabase db reset
   ```
   Supabase CLI natively resets the database and seeds the schema snapshot (`schema.public.sql`), helper schemas, role grants, triggers, and game reference data (`seed.sql`).

2. **Point `.env.local` at the local stack.** Run `supabase status` to get the local API URL and anon key, then set:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
   ```

3. **Start the app** with `npm run dev` as usual.

**Notes**
- `supabase db reset` wipes the local database, rebuilds it cleanly from the daily production schema snapshot, and seeds reference game lookup data.
- The email webhook is intentionally **not** part of local setup: it needs AWS
  SES secrets and only matters for outbound notification email. See
  `supabase/webhooks/README.md` if you need it.
- To pull the latest production schema before bootstrapping, `git pull` first —
  `schema.public.sql` is refreshed by CI daily.

See `supabase/README.md` for the full layout of the `supabase/` directory.

## Opening a pull request

1. Clone the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Added some amazing feature'`)
4. Push to the branch (`git push -u origin HEAD`)
5. Open a Pull Request

**Before you push.** There is no test suite and no workflow that lints or typechecks a pull
request, so these are on you:

```bash
npm run lint     # eslint
npm run build    # the only typecheck — tsconfig has noEmit, so nothing else runs tsc
```

Then click through the change in the browser on every page it touches.

**Titles** follow conventional commits — `fix(fighters): …`, `feat(gang): …`, `refactor(hooks): …`,
`chore(db): …`. **Bodies** explain the cause, not just the change: what was broken, why, and what a
player will notice. If a fix touches live data, say roughly how many rows.

**Previews.** Opening a PR triggers `.github/workflows/preview.yml`, which builds a Vercel preview
and comments the URL. Previews only run for non-draft PRs from repo members on a branch in this
repo — forks don't get one. Adding the `preview-test` label also points `test.mundamanager.com` at
your branch.

## Architecture and conventions

### Layering

Where code goes depends on whether it reads or writes, and whether the reader is a page or a modal.

**Mutations → server actions in `app/actions/`.** A gameplay mutation is a `'use server'` function
that authenticates, checks permissions, writes through the Supabase server client, fires the
matching cache invalidation, and returns a `{ success, data?, error? }` result.
`app/actions/update-gang.ts` is a representative example.

```ts
'use server'

import { invalidateGang, invalidateGangOverview } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
```

Do not add a new API route for a gameplay mutation. The write handlers that do live under
`app/api/` are there for a reason: admin CRUD (`app/api/admin/*`) and third-party callbacks
(`app/api/patreon/*`, `app/api/email/unsubscribe`, `app/api/notifications/[id]`).

**Page data → `app/lib/`.** Server components call a loader in `app/lib/`, which wraps its query in
`unstable_cache` with tags from `utils/cache-tags.ts`, and passes the result down as props. See
`app/lib/get-user-gangs.ts` or `app/lib/shared/gang-data.ts`. Prefer an RPC over assembling the
shape client-side — `get_gang_details` exists for exactly this.

**Client reads in modals and interactive components → TanStack Query against `app/api/`.** A modal
that needs data the page didn't already load fetches it from a route handler with `useQuery`. Query
keys are an array starting with a stable name, plus the entity id when the data is scoped to one:

```ts
useQuery({ queryKey: ['campaign-resources', campaignId], … })
useQuery({ queryKey: ['admin-gang-types'], … })
```

### Caching

`utils/cache-tags.ts` is the single source of truth, and its header comment is the specification —
read it before adding a tag. The rules that matter in review:

- **Each piece of data has one authoritative cached home per key space** (gang bundle, campaign
  entries, user lists). Every additional displayed copy carries a tag its write path provably fires.
- **Invalidate from the choke point, not per call site.** `gang-overview-{id}` is busted by
  `updateGangFinancials`, which every financial write already goes through — not by each caller
  remembering to.
- **Use the narrowest tag that covers the change.** `gangStash`, `gangPositioning`,
  `gangOverview`, `gangTacticsCards` and `gangCampaigns` exist so a stash edit doesn't evict the
  whole gang bundle. Busting `gang-{id}` for a card reorder is a regression, not a safety measure.
- **A new cached read needs both halves**: an entry in `TAGS`, and an `invalidate*` helper that
  every write path touching that data calls.
- Live battle sessions keep their own namespace (`base-battle-session-{id}`,
  `gang-battle-sessions-{gangId}`) so frequent mutations don't thrash the gang bundles.

On Vercel this is Next's built-in Data Cache. Self-hosted deploys can back it with Redis via
`cache-handler.js` — see "Self-Hosted Caching" in the README.

### Permissions and RLS

Authorization is enforced in two independent places, and a change needs both.

**Server-side, in the action or route handler.** Never rely on having hidden the button.

- `getAuthenticatedUser(supabase)` (`utils/auth.ts`) — resolves the caller, throws if signed out.
- `checkPermissionCached(userId, gangId, gangOwnerId)` (`utils/user-permissions.ts`) — returns
  `{ isOwner, isAdmin, canEdit, canDelete, canView }`. Ownership is settled outside the cache so an
  owner keeps `canEdit` even if the RPC fails.
- `checkCampaignPermissions(userId, campaignId)` — the richer campaign shape
  (`canManageMembers`, `canClaimTerritories`, `canEditBattleLogs`, …) derived from the
  `OWNER` / `ARBITRATOR` / `MEMBER` role.
- `checkAdmin(supabase, user)` (`utils/auth.ts`) — for the admin surfaces.

All of these resolve through the `check_permission` RPC; the derivation rules live in
`deriveGangPermissions` / `deriveCampaignPermissions` rather than being re-implemented per caller.

**In the database, as RLS policies.** Every table has RLS enabled, and policies lean on two
SECURITY DEFINER helpers in the `private` schema — `private.is_admin()` and
`private.is_arb(campaign_id)` — used by several hundred policies between them. A new table or
column needs its own policy; a new column on an existing table needs a check that the existing
policy still expresses the right rule.

When you touch data access, walk each role that can reach it: gang owner, campaign arbitrator,
campaign member, admin, and a signed-in stranger.

Client components receive a `userPermissions` prop and use it to gate UI. That is presentation
only — it is never the check.

### Database changes

The `supabase/` directory has three traps worth knowing before you edit it:

- **`supabase/schema/schema.public.sql` is CI-owned.** A workflow regenerates it from production
  daily with `pg_dump` and commits it to `main`. Never hand-edit it; your change will be
  overwritten, and the diff will be unreviewable either way.
- **`supabase/functions/*.sql` is not auto-synced.** If you change an RPC or trigger function in
  the Supabase dashboard, mirror it into the matching file here in the same PR. Nothing will
  detect the drift for you. Changes to these files are applied to production on merge to `main` by
  `deploy_supabase_functions.yml`.
- **`supabase/migrations/` holds incremental deltas only**, and cannot be replayed from an empty
  database. Add your migration there, but build local databases from the snapshot (see above).

Edge functions live in `supabase/edge-functions/` and deploy on merge to `main`. Webhooks in
`supabase/webhooks/` are applied by hand and deliberately kept out of CI because they embed a
header secret — see `supabase/webhooks/README.md`.

### Editions

The app supports two Necromunda editions, N23 and N26, and much of the game data is
edition-scoped. The current edition is resolved through `utils/editions.ts` and `types/edition.ts`;
ordering and eligibility tables are duplicated per edition by filename convention
(`fighterSubtypeRankN23.ts` / `fighterSubtypeRankN26.ts`, `equipmentCategoryRankN23.ts` /
`…N26.ts`, `allianceRankN23.ts` / `…N26.ts`, and so on).

If a change touches fighter types, subtypes, specialisations, equipment categories, alliances, gang
additions or rating, check it against both editions before pushing. Edition leakage — an N26 rule
applied to an N23 gang, or a picker showing the other edition's rows — is the most common class of
regression here.

## Component architecture

### Page structure

The gang page is the canonical shape — a server component resolves auth, permissions and data,
then hands it all to one client subtree:

```
app/gang/[id]/page.tsx            server component: auth, checkPermissionCached, cached loaders
└── GangPageContent               components/gang/gang-page-content.tsx
    ├── Gang                      components/gang/gang.tsx
    │   ├── DraggableFighters     components/gang/draggable-fighters.tsx
    │   │   └── MyFighters        components/gang/my-fighters.tsx
    │   │       └── FighterCard   components/gang/fighter-card.tsx
    │   │           ├── StatsTable    components/ui/fighter-card-stats-table.tsx
    │   │           └── WeaponTable   components/gang/fighter-card-weapon-table.tsx
    │   ├── GangEditModal         components/gang/gang-edit-modal.tsx
    │   └── GangResourcesModal    components/gang/gang-resources-modal.tsx
    └── stash-tab / vehicles-tab / campaign-tab / notes-tab / battle-sessions-tab
```

Keep the server/client boundary there. Pushing data fetching down into the client tree is what
turns one cached RPC into a waterfall of route handler calls.

### State and data flow

- Page data arrives as props from the server component and flows down; there is no global gang
  store. The only React contexts are narrow ones (`FighterCardModalsContext`,
  `TradingPostEditionContext`).
- Modal- and admin-scoped data is fetched with TanStack Query — see [Layering](#layering).
- Local component state for UI.
- Optimistic updates, reconciled against the server action's result.
- Real-time synchronization for battle sessions (`hooks/`).

### Practices

- Type safety throughout — `tsconfig.json` is `strict`
- Error boundaries and explicit loading states
- Hydration-safe rendering; component memoization where a list re-renders
