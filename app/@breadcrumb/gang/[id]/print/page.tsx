import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getGangCore } from "@/app/lib/shared/gang-data"

export default async function GangPrintRosterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Reads the gang page's cached core entry instead of an uncached query
  const gangData = await getGangCore(id).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: gangData?.name || 'Gang', href: `/gang/${id}` },
        { label: 'Print' },
      ]}
    />
  )
}
