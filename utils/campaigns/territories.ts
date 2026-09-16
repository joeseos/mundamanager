import type { CampaignTerritoryRow } from '@/types/campaign';

/**
 * Columns every campaign_territories read selects. The cached reader and the add/create
 * mutations must agree, or an optimistically appended row is shaped differently from
 * every row already in state.
 */
export const CAMPAIGN_TERRITORY_COLUMNS =
  'id, territory_id, territory_name, gang_id, created_at, ruined, default_gang_territory, playing_card, description, map_object_id, map_hex_coords, show_name_on_map';

/**
 * Apply the derived fields the cached reader adds on top of the raw row, so a freshly
 * inserted territory matches what a page render would have produced for it.
 */
export function shapeCampaignTerritory(
  row: Record<string, any>,
  originalTerritoryName: string | null = null
): CampaignTerritoryRow & { original_territory_name: string | null; is_custom: boolean } {
  return {
    id: row.id,
    territory_id: row.territory_id,
    territory_name: row.territory_name,
    original_territory_name: row.territory_id ? originalTerritoryName : null,
    gang_id: row.gang_id,
    created_at: row.created_at,
    ruined: row.ruined || false,
    default_gang_territory: row.default_gang_territory || false,
    playing_card: row.playing_card ?? null,
    description: row.description ?? null,
    is_custom: !row.territory_id,
    map_object_id: row.map_object_id ?? null,
    map_hex_coords: row.map_hex_coords ?? null,
    show_name_on_map: row.show_name_on_map ?? true,
    owning_gangs: []
  };
}
