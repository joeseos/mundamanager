import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { createClient } from "@/utils/supabase/server"
import { getGangCore } from "@/app/lib/shared/gang-data"
import { getUserIdFromClaims } from "@/utils/auth"

export default async function GangPrintRosterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // The gang is read over the direct connection, which doesn't check who is
  // asking, so confirm the user first
  const userId = await getUserIdFromClaims(supabase)

  // Reads the gang page's cached core entry instead of an uncached query
  const gangData = userId ? await getGangCore(id).catch(() => null) : null

  return (
    <BreadcrumbBar
      items={[
        { label: gangData?.name || 'Gang', href: `/gang/${id}` },
        { label: 'Print' },
      ]}
    />
  )
}
