import type { CampaignTerritoryRow } from '@/types/campaign';

/**
 * Columns every campaign_territories read selects, besides created_at, which the cached
 * reader selects in ISO form. The cached reader and the add/create mutations must
 * agree, or an optimistically appended row is shaped differently from every row
 * already in state.
 */
export const CAMPAIGN_TERRITORY_FIELDS = {
  id: true,
  territory_id: true,
  territory_name: true,
  gang_id: true,
  ruined: true,
  default_gang_territory: true,
  playing_card: true,
  description: true,
  map_object_id: true,
  map_hex_coords: true,
  show_name_on_map: true,
} as const;

/** CAMPAIGN_TERRITORY_FIELDS as a Data API select, for the mutations. */
export const CAMPAIGN_TERRITORY_COLUMNS = [...Object.keys(CAMPAIGN_TERRITORY_FIELDS), 'created_at'].join(', ');

/** Fields read from the linked `territories` row; absent for custom territories. */
export interface CampaignTerritoryTemplate {
  territory_name: string;
  credits: number | null;
}

/**
 * Apply the derived fields the cached reader adds on top of the raw row, so a freshly
 * inserted territory matches what a page render would have produced for it.
 */
export function shapeCampaignTerritory(
  row: Record<string, any>,
  template: CampaignTerritoryTemplate | null = null
): CampaignTerritoryRow & { original_territory_name: string | null; credits: number | null; is_custom: boolean } {
  return {
    id: row.id,
    territory_id: row.territory_id,
    territory_name: row.territory_name,
    original_territory_name: row.territory_id ? template?.territory_name ?? null : null,
    credits: row.territory_id ? template?.credits ?? null : null,
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
