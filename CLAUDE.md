# CLAUDE.md

## Rules

- **Never apply Supabase migrations directly to the remote database** (i.e. never call `apply_migration` via MCP or `supabase db push` against production). Always create a migration file in `supabase/migrations/` and let it be applied through the normal PR and deployment process.
