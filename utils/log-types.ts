/**
 * Shared action type → display label map for gang and fighter log UIs.
 * Single source of truth — imported by both gang-logs.tsx and fighter-logs.tsx.
 */
export const LOG_TYPE_LABELS: Record<string, string> = {
  // Credits & reputation
  'credits_earned': 'Credits earned',
  'credits_spent': 'Credits spent',
  'credits_changed': 'Credits changed',
  'reputation_gained': 'Reputation gained',
  'reputation_lost': 'Reputation lost',
  'reputation_changed': 'Reputation changed',

  // Fighter lifecycle
  'fighter_added': 'Fighter added',
  'fighter_removed': 'Fighter removed',
  'fighter_killed': 'Fighter killed',
  'fighter_resurected': 'Fighter resurected',
  'fighter_retired': 'Fighter retired',
  'fighter_unretired': 'Fighter unretired',
  'fighter_enslaved': 'Fighter enslaved',
  'fighter_rescued': 'Fighter rescued',
  'fighter_starved': 'Fighter starved',
  'fighter_fed': 'Fighter fed',
  'fighter_captured': 'Fighter captured',
  'fighter_released': 'Fighter released',
  'fighter_copied': 'Fighter copied',

  // Fighter stats
  'fighter_xp_changed': 'XP changed',
  'fighter_total_xp_changed': 'Total XP changed',
  'fighter_kills_changed': 'OOA count changed',
  'fighter_OOA_changed': 'OOA count changed',
  'fighter_kill_count_changed': 'Kill count changed',
  'fighter_cost_adjusted': 'Cost adjusted',

  // Fighter advancement
  'fighter_characteristic_advancement': 'Characteristic advanced',
  'fighter_skill_advancement': 'Skill advanced',
  'fighter_skill_learned': 'Skill learned',
  'fighter_skill_removed': 'Skill removed',
  'fighter_characteristic_removed': 'Characteristic removed',
  'fighter_injured': 'Fighter injured',
  'fighter_recovered': 'Fighter recovered',
  'injury_roll': 'Lasting Injury roll',

  // Equipment
  'equipment_purchased': 'Equipment purchased',
  'equipment_purchased_to_stash': 'Equipment purchased to stash',
  'equipment_sold': 'Equipment sold',
  'Equipment removed': 'Equipment removed',
  'equipment_moved_to_stash': 'Equipment moved to stash',
  'equipment_moved_from_stash': 'Equipment moved from stash',
  'equipment_granted': 'Equipment granted',

  // Vehicles
  'vehicle_added': 'Vehicle added',
  'vehicle_deleted': 'Vehicle removed',
  'vehicle_sold': 'Vehicle sold',
  'vehicle_updated': 'Vehicle updated',
  'vehicle_removed': 'Vehicle removed',
  'vehicle_cost_changed': 'Vehicle cost changed',
  'vehicle_assigned': 'Vehicle assigned',
  'vehicle_unassigned': 'Vehicle unassigned',
  'vehicle_assignment_changed': 'Vehicle assigned',
  'vehicle_name_changed': 'Vehicle name changed',

  // Vehicle equipment
  'vehicle_equipment_purchased': 'Vehicle equipment purchased',
  'vehicle_equipment_sold': 'Vehicle equipment sold',
  'Vehicle equipment removed': 'Vehicle equipment removed',
  'vehicle_equipment_moved_to_stash': 'Vehicle equipment to stash',
  'vehicle_equipment_moved_from_stash': 'Vehicle equipment from stash',
  'vehicle_equipment_granted': 'Vehicle equipment granted',

  // Vehicle damage
  'vehicle_damage_added': 'Vehicle Lasting Damage sustained',
  'vehicle_damage_removed': 'Vehicle Lasting Damage removed',
  'vehicle_damage_repaired': 'Vehicle Lasting Damage repaired',
  'vehicle_damage_roll': 'Vehicle Lasting Damage roll',

  // Gang
  'stash_update': 'Stash updated',
  'alignment_change': 'Alignment changed',
  'gang_created': 'Gang created',
  'gang_deleted': 'Gang deleted',
  'name_change': 'Name changed',
  'name_changed': 'Name changed',
  'gang_type_changed': 'Gang type changed',

  // Campaign
  'campaign_joined': 'Campaign joined',
  'campaign_left': 'Campaign left',
  'battle_won': 'Battle won',
  'battle_lost': 'Battle lost',
  'battle_draw': 'Battle draw',
  'territory_claimed': 'Territory claimed',
  'territory_lost': 'Territory lost',
};

/** Look up a display label for an action type, falling back to the raw value. */
export function getLogTypeLabel(actionType: string): string {
  return LOG_TYPE_LABELS[actionType] || actionType;
}
