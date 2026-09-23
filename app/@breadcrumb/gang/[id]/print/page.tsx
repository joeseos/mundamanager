import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { createClient } from "@/utils/supabase/server"
import { getGangCore } from "@/app/lib/shared/gang-data"

export default async function GangPrintRosterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Reads the gang page's cached core entry instead of an uncached query
  const gangData = await getGangCore(id, supabase).catch(() => null)

  return (
    <BreadcrumbBar
      items={[
        { label: gangData?.name || 'Gang', href: `/gang/${id}` },
        { label: 'Print' },
      ]}
    />
  )
}
