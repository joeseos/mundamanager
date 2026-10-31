import type { CatalogueSlot } from '@/utils/portrait-catalogue';

/** Gallery section for a campaign type. Matching uses the type id, not the name. */
export function catalogueSlotForCampaignType(
  campaignTypeId: string | null | undefined,
  campaignTypeName: string | null | undefined
): CatalogueSlot | null {
  const id = campaignTypeId?.trim();
  if (!id) return null;
  return {
    groupLabel: campaignTypeName?.trim() || 'Campaign',
    label: null,
    campaignTypeId: id,
  };
}
