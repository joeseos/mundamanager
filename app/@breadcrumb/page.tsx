import { Home } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

export default function HomeBreadcrumb() {
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
              <BreadcrumbPage 
                className="text-gray-900 font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                <span aria-hidden="true">
                  <Home className="h-4 w-4" />
                </span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  )
} 