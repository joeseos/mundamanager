import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getCampaignBasic } from "@/app/lib/campaigns/[id]/get-campaign-data"

export default async function CampaignBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Reads the campaign page's cached basic entry instead of an uncached query
  const campaignData = await getCampaignBasic(id).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: 'Campaigns', href: '/?tab=campaigns' },
        { label: campaignData?.campaign_name || 'Campaign' },
      ]}
    />
  )
}
