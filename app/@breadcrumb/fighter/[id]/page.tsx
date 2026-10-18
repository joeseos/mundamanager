import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { createClient } from "@/utils/supabase/server"
import { getFighterBasic } from "@/app/lib/shared/fighter-data"
import { getGangCore } from "@/app/lib/shared/gang-data"
import { getUserIdFromClaims } from "@/utils/auth"

export default async function FighterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  // The fighter is read over the direct connection, which doesn't check who is
  // asking, so confirm the user first
  const userId = await getUserIdFromClaims(supabase)

  // Reads the fighter/gang cached entries instead of an uncached query
  const fighterData = userId ? await getFighterBasic(id).catch(() => null) : null
  const gang = fighterData?.gang_id
    ? await getGangCore(fighterData.gang_id, supabase).catch(() => null)
    : null

  return (
    <BreadcrumbBar
      items={[
        { label: gang?.name || 'Gang', href: fighterData?.gang_id ? `/gang/${fighterData.gang_id}` : undefined },
        { label: fighterData?.fighter_name || 'Fighter' },
      ]}
    />
  )
}
