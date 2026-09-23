import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { createClient } from "@/utils/supabase/server"
import { getFighterBasic } from "@/app/lib/shared/fighter-data"
import { getGangCore } from "@/app/lib/shared/gang-data"

export default async function FighterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  // Reads the fighter/gang cached entries instead of an uncached query
  const fighterData = await getFighterBasic(id, supabase).catch(() => null)
  const gang = fighterData?.gang_id
    ? await getGangCore(fighterData.gang_id, supabase).catch(() => null)
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
