# README

## Local development

To spin up a fresh local database, run `supabase start` or `supabase db reset` from the repo root and follow the "Setting up a local Supabase database" section of the top-level README. Local migration auto-run is disabled in `config.toml` because the files in `migrations/` are incremental deltas that assume a pre-existing base schema. Instead, `supabase start` / `supabase db reset` automatically build the fresh database natively using `[db.seed].sql_paths` configured in `config.toml`.

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
