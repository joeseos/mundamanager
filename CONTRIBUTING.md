# Contributing to Munda Manager

Thanks for your interest in contributing! For questions, join our [Discord server](https://discord.gg/FrqEWShQd7).

Non-code ways to help (design, docs, testing, community) are described on the [Join the Team](https://www.mundamanager.com/join-the-team) page.

## Practical steps to create a pull request

1. Fork and clone the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Added some amazing feature'`)
4. Push to the branch (`git push -u origin HEAD`)
5. Open a Pull Request (the PR template will prompt you for summary, type, and how you tested)

Before opening a PR, run `npm run lint` and make sure your changes work locally.

### Optional: AI pre-PR review

This is a local step before you open a PR; it is separate from any automated review that may run after the PR is opened.

Paste the following into a coding assistant to get a review of your local changes:

```
You are a senior engineer reviewing a future pull request against the full codebase.

1. Examine the files being modified, either stashed or not
2. Check against these criteria:
   - Correctness: bugs, logic errors, regressions
   - Edge cases and null/undefined handling
   - Security issues (auth, injection, data leaks)
   - Performance concerns (N+1 queries, unnecessary re-renders, large allocations)
   - Readability and maintainability
   - Adherence to project conventions in CONTRIBUTING.md and README.md
   - DRY and YAGNI: duplicated logic, unnecessary parameters, prop threading bloat
3. Focus on high-signal issues. Do not nitpick style unless it impacts clarity.
4. Compile findings as a list: file + line number, issue description, suggested fix, and severity (high/medium/low).
5. Provide a final verdict: approve, or changes requested (with summary of blockers).
6. Post the review as a comment in the chat
```

### Automated review on the PR

After a PR is opened (or marked ready for review), a **`claude-review`** check runs the same
review automatically and posts its findings as inline comments plus a summary.

- **Green check** - the review ran. Read the comments.
- **Red check** - the review did **not** run, and a comment on the PR says why. The most common
  cause is the maintainer's Claude usage limit being reached; that is not a problem with your PR.
  When this happens, human review is required before merge.

The check never blocks a merge. To re-run it after pushing fixes, remove and re-add the
`claude-review` label, or re-run the failed job from the Actions run page.

Mention `@claude` in a PR or issue comment to ask a follow-up question about a finding, or to
ask for a fix.

**Pull requests from forks are not reviewed automatically.** GitHub does not give fork PRs access
to the repository secrets the workflow needs. A maintainer applies the `claude-review` label once
they have looked over the diff.

## How to set up your environment

1. **Prerequisites**
   - Node.js 20.20.2 or newer (see `.nvmrc`)
   - Supabase project URL and key
   - Cloudflare Turnstile keys

2. **Environment setup**
   ```bash
   cp .env.example .env.local
   ```
   Configure the following variables (see `.env.example` for the full list):
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

5. **Access to the DB schema**
   The Supabase DB schema can be accessed through https://supabase-schema.vercel.app/
   Use the Supabase URL and the anon key to connect to it.

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

## Schema changes

- Put all schema changes in a migration under `supabase/migrations/` (create with `supabase migration new <descriptive-name>`).
- Do **not** edit `supabase/schema/schema.public.sql` or other schema dump files by hand.
- For RPC / SQL function changes, update both the migration and the matching file under `supabase/functions/`.

If you are unsure about anything, ask in [Discord](https://discord.gg/FrqEWShQd7).
