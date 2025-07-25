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

export default async function GangBreadcrumb({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: gangData } = await supabase
    .from('gangs')
    .select('name')
    .eq('id', id)
    .single()

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
              <BreadcrumbPage 
                className="text-gray-900 font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                {gangData?.name || 'Gang'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  )
} 