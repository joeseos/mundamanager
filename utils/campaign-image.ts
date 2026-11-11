import { portraitPublicUrl, PORTRAIT_CATALOGUES } from '@/utils/portrait-catalogue';

export function campaignPortraitPublicUrl(storagePath: string | null | undefined): string | undefined {
  return portraitPublicUrl(PORTRAIT_CATALOGUES.campaign.publicBase, storagePath);
}

function presentUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Custom upload, then the catalogue portrait, then the campaign type image.
 * Empty when none of those are set; the UI shows the flag placeholder.
 */
export function resolveCampaignImageUrl(options: {
  imageUrl?: string | null;
  portraitUrl?: string | null;
  typeImageUrl?: string | null;
}): string {
  const { imageUrl, portraitUrl, typeImageUrl } = options;
  return presentUrl(imageUrl) ?? presentUrl(portraitUrl) ?? presentUrl(typeImageUrl) ?? '';
}
