import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getFighterBasic } from "@/app/lib/shared/fighter-data"
import { getGangCore } from "@/app/lib/shared/gang-data"

export default async function FighterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Reads the fighter/gang cached entries instead of an uncached query
  const fighterData = await getFighterBasic(id).catch(() => null)
  const gang = fighterData?.gang_id
    ? await getGangCore(fighterData.gang_id).catch(() => null)
    : null

  return (
    <BreadcrumbBar
      items={[
        { label: gang?.name || 'Gang', href: `/gang/${fighterData?.gang_id}` },
        { label: fighterData?.fighter_name || 'Fighter' },
      ]}
    />
  )
}
