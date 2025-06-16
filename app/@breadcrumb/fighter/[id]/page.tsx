import { Home } from 'lucide-react'
import { createClient } from "@/utils/supabase/server"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import Link from 'next/link'

export default async function FighterBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: fighterData } = await supabase
    .from('fighters')
    .select(`
      fighter_name,
      gang_id,
      gang:gang_id (
        name
      )
    `)
    .eq('id', id)
    .single()

  const gangName = fighterData?.gang 
    ? Array.isArray(fighterData.gang) 
      ? (fighterData.gang[0] as any)?.name || '' 
      : (fighterData.gang as any)?.name || ''
    : ''

  return (
    <div 
      className="w-full fixed top-14 z-40 bg-white border-b border-gray-100 print:hidden"
      role="navigation"
      aria-label="Breadcrumb"
      data-scroll-ignore="true"
    >
      <div className="w-full">
        <Breadcrumb className="h-10 flex items-center px-4 leading-[0.5rem]">
          <BreadcrumbList aria-label="Breadcrumb navigation">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link 
                  href="/" 
                  className="text-gray-600 hover:text-primary flex items-center"
                  aria-label="Home"
                >
                  <span aria-hidden="true">
                    <Home className="h-4 w-4" />
                  </span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator 
              className="text-gray-400"
              aria-hidden="true"
            >/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link 
                  href={`/gang/${fighterData?.gang_id}`} 
                  className="text-gray-600 hover:text-primary"
                  aria-label={`Navigate to ${gangName || 'Gang'}`}
                >
                  {gangName || 'Gang'}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator 
              className="text-gray-400"
              aria-hidden="true"
            >/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage 
                className="text-gray-900 font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                {fighterData?.fighter_name || 'Fighter'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  )
} 