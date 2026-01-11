# README

## Supabase functions

https://supabase.com/dashboard/project/iojoritxhpijprgkjfre/database/functions

Syncing of those files is not automatic. If you update a function on Supabase, make sure to update it here as well.

### RPC Functions

| Name                               | Arguments                                                                                              | Return type | Security |
|------------------------------------|--------------------------------------------------------------------------------------------------------|-------------|----------|
| add_fighter_injury                 | input_fighter_id uuid, input_injury_id uuid                                                            | TABLE(result json) | Definer |
| add_vehicle_effect                 | in_vehicle_id uuid, in_fighter_effect_type_id uuid, in_user_id uuid, in_fighter_effect_category_id uuid DEFAULT NULL | json | Definer |
| assign_crew_to_vehicle             | p_vehicle_id uuid, p_fighter_id uuid                                                                   | jsonb | Definer |
| get_add_fighter_details            | p_gang_type_id uuid, p_gang_affiliation_id uuid DEFAULT NULL                                           | TABLE(...) | Definer |
| get_available_skills               | fighter_id uuid                                                                                        | jsonb | Definer |
| get_equipment_with_discounts       | gang_type_id uuid DEFAULT NULL, equipment_category text DEFAULT NULL, fighter_type_id uuid DEFAULT NULL | TABLE(...) | Definer |
| get_fighter_available_advancements | fighter_id uuid                                                                                        | jsonb | Definer |
| get_fighter_types_with_cost        | p_gang_type_id uuid DEFAULT NULL, p_gang_affiliation_id uuid DEFAULT NULL, p_is_gang_addition boolean DEFAULT NULL | TABLE(...) | Definer |
| get_gang_details                   | p_gang_id uuid                                                                                         | TABLE(...) | Definer |
| get_gang_permissions               | p_user_id uuid, p_gang_id uuid                                                                         | json | Definer |
| repair_vehicle_damage              | damage_ids uuid[], repair_cost integer, in_user_id uuid                                                | json | Definer |

### Helper Functions

| Name          | Arguments                                                                                                           | Return type | Security |
|---------------|---------------------------------------------------------------------------------------------------------------------|-------------|----------|
| gang_logs     | p_gang_id uuid, p_action_type text, p_description text, p_fighter_id uuid DEFAULT NULL, p_vehicle_id uuid DEFAULT NULL | uuid | Definer |
| safe_to_numeric | v text                                                                                                            | numeric | Invoker |

### Trigger Functions

| Name                         | Trigger on         | Description                               |
|------------------------------|--------------------|-------------------------------------------|
| fighter_logs                 | fighters table     | Logs fighter changes                      |
| vehicle_logs                 | vehicles table     | Logs vehicle changes                      |
| notify_campaign_member_added | campaign_members   | Sends notification when member is added   |
| notify_friend_request_sent   | friend_requests    | Sends notification for friend requests    |
| notify_gang_invite           | campaign_gangs     | Sends notification for gang invites       |
