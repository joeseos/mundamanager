import type { CatalogueSlot, Portrait } from '@/utils/portrait-catalogue';

/** Gallery section for a campaign type. Types have no parent or variant aliases. */
export function catalogueSlotForCampaignType(
  campaignTypeName: string | null | undefined
): CatalogueSlot | null {
  const name = campaignTypeName?.trim();
  if (!name) return null;
  return { groupLabel: name, label: null };
}

/** Portraits linked to one campaign type. Matching uses the foreign key, not the stored name. */
export function portraitsForCampaignType(portraits: Portrait[], campaignTypeId: string): Portrait[] {
  return portraits.filter((portrait) => portrait.campaign_type_id === campaignTypeId);
}
