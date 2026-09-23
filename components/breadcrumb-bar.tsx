import { Fragment } from "react"
import Link from "next/link"
import { LuHouse } from "react-icons/lu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export interface BreadcrumbBarItem {
  label: string
  href?: string
}

const currentPageClass = "text-foreground font-medium items-center whitespace-nowrap leading-none"

/** Fixed bar under the header; the last item is the current page, and no items means Home is. */
export function BreadcrumbBar({ items = [] }: { items?: BreadcrumbBarItem[] }) {
  const homeIcon = (
    <span aria-hidden="true">
      <LuHouse className="h-4 w-4" />
    </span>
  )

  return (
    // `contents` gives the slot no layout box, so Next's scroll handler skips this fixed bar
    // and scrolls <main> to the top on navigation instead.
    <div className="contents">
      <div className="w-full fixed top-14 z-40 bg-card border-b border-neutral-800 print:hidden">
        <Breadcrumb aria-label="Breadcrumb" className="h-10 flex items-center px-4 leading-[0.5rem]">
          <BreadcrumbList>
            <BreadcrumbItem>
              {items.length === 0 ? (
                <BreadcrumbPage className={currentPageClass}>{homeIcon}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link
                    href="/"
                    prefetch={false}
                    className="text-muted-foreground hover:text-primary flex items-center"
                    aria-label="Home"
                  >
                    {homeIcon}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {items.map((item, i) => (
              <Fragment key={i}>
                <BreadcrumbSeparator className="text-gray-400">/</BreadcrumbSeparator>
                <BreadcrumbItem>
                  {i === items.length - 1 ? (
                    <BreadcrumbPage className={currentPageClass}>{item.label}</BreadcrumbPage>
                  ) : item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href} prefetch={false} className="text-muted-foreground hover:text-primary">
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  )
}
