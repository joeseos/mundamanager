// custom_shared column that holds the id of each kind of shareable custom asset.
export const CUSTOM_SHARED_COLUMNS = {
  fighter: 'custom_fighter_type_id',
  equipment: 'custom_equipment_id',
  gangType: 'custom_gang_type_id',
  skill: 'custom_skill_id',
  tradingPost: 'custom_trading_post_id',
  collection: 'custom_collection_id',
} as const;

export type CustomSharedItemType = keyof typeof CUSTOM_SHARED_COLUMNS;

export function isCustomSharedItemType(value: string): value is CustomSharedItemType {
  return Object.prototype.hasOwnProperty.call(CUSTOM_SHARED_COLUMNS, value);
}
