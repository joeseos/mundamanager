'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { createClient } from "@/utils/supabase/client"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

// Define interfaces for our data structures
interface BreadcrumbItemType {
  href: string | null
  text: React.ReactNode
  isHome?: boolean
}

interface GangData {
  name: string
  id: string
}

interface FighterData {
  fighter_name: string
  gang_id: string
  gang?: {
    name: string
  }
}

interface CampaignData {
  campaign_name: string
}

interface BreadcrumbNavProps {
  // Even if empty, good practice to define props interface
}

// Add new interface for combined state
interface BreadcrumbState {
  gang: {
    id: string
    name: string
  }
  fighter: {
    name: string
  }
  campaign: {
    name: string
  }
}

export default function BreadcrumbNav({}: BreadcrumbNavProps) {
  const paths = usePathname()
  const pathNames = paths.split('/').filter(path => path)
  const [breadcrumbState, setBreadcrumbState] = React.useState<BreadcrumbState>({
    gang: { id: '', name: '' },
    fighter: { name: '' },
    campaign: { name: '' }
  })

  // Single effect to handle both state reset and data fetching
  React.useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      const supabase = createClient()
      
      // Reset state first
      if (isMounted) {
        setBreadcrumbState({
          gang: { id: '', name: '' },
          fighter: { name: '' },
          campaign: { name: '' }
        })
      }

      // Then fetch new data based on the path
      if (pathNames[0] === 'gang' && pathNames[1]) {
        const { data: gangData, error } = await supabase
          .from('gangs')
          .select('name')
          .eq('id', pathNames[1])
          .single()
        
        if (!error && gangData && isMounted) {
          setBreadcrumbState(prev => ({
            ...prev,
            gang: {
              id: pathNames[1],
              name: gangData.name
            }
          }))
        }
      }

      if (pathNames[0] === 'fighter' && pathNames[1]) {
        const { data: fighterData, error } = await supabase
          .from('fighters')
          .select(`
            fighter_name,
            gang_id,
            gang:gang_id (
              name
            )
          `)
          .eq('id', pathNames[1])
          .single()
        
        if (!error && fighterData && isMounted) {
          setBreadcrumbState(prev => ({
            ...prev,
            fighter: {
              name: fighterData.fighter_name
            },
            gang: {
              id: fighterData.gang_id,
              name: Array.isArray(fighterData.gang) 
                ? (fighterData.gang[0] as { name: string })?.name || '' 
                : (fighterData.gang as { name: string })?.name || ''
            }
          }))
        }
      }

      if (pathNames[0] === 'campaigns' && pathNames.length > 1) {
        const { data: campaignData, error } = await supabase
          .from('campaigns')
          .select('campaign_name')
          .eq('id', pathNames[1])
          .single()
        
        if (!error && campaignData && isMounted) {
          setBreadcrumbState(prev => ({
            ...prev,
            campaign: {
              name: campaignData.campaign_name
            }
          }))
        }
      }
    }

    fetchData()

    // Cleanup function to prevent setting state after unmount
    return () => {
      isMounted = false
    }
  }, [paths]) // Only depend on paths, not pathNames since it's derived from paths

  // Memoize the fetch function to prevent unnecessary recreations
  const fetchNames = React.useCallback(async () => {
    const supabase = createClient()

    if (pathNames[0] === 'gang') {
      const { data: gangData, error } = await supabase
        .from('gangs')
        .select('name')
        .eq('id', pathNames[1])
        .single()
      
      if (!error && gangData) {
        setBreadcrumbState(prev => ({
          ...prev,
          gang: {
            id: pathNames[1],
            name: gangData.name
          }
        }))
      }
    }

    if (pathNames[0] === 'fighter') {
      const { data: fighterData, error } = await supabase
        .from('fighters')
        .select(`
          fighter_name,
          gang_id,
          gang:gang_id (
            name
          )
        `)
        .eq('id', pathNames[1])
        .single()
      
      if (!error && fighterData) {
        setBreadcrumbState(prev => ({
          ...prev,
          fighter: {
            name: fighterData.fighter_name
          },
          gang: {
            id: fighterData.gang_id,
            name: Array.isArray(fighterData.gang) 
              ? (fighterData.gang[0] as { name: string })?.name || '' 
              : (fighterData.gang as { name: string })?.name || ''
          }
        }))
      }
    }

    if (pathNames[0] === 'campaigns' && pathNames.length > 1) {
      const { data: campaignData, error } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', pathNames[1])
        .single()
      
      if (!error && campaignData) {
        setBreadcrumbState(prev => ({
          ...prev,
          campaign: {
            name: campaignData.campaign_name
          }
        }))
      }
    }
  }, [pathNames])

  // Memoize getBreadcrumbItems to prevent unnecessary recalculations
  const getBreadcrumbItems = React.useMemo(() => {
    if (pathNames[0] === 'fighter') {
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: `/gang/${breadcrumbState.gang.id}`, text: breadcrumbState.gang.name },
        { href: null, text: breadcrumbState.fighter.name }
      ]
    }
    if (pathNames[0] === 'gang') {
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: null, text: breadcrumbState.gang.name }
      ]
    }
    if (pathNames[0] === 'profile') {
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: null, text: 'Profile' }
      ]
    }
    if (pathNames[0] === 'about') {
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: null, text: 'About' }
      ]
    }
    if (pathNames[0] === 'campaigns') {
      if (pathNames.length > 1) {
        return [
          { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
          { href: '/campaigns', text: 'Campaigns' },
          { href: `/campaigns/${pathNames[1]}`, text: breadcrumbState.campaign.name }
        ]
      }
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: null, text: 'Campaigns' }
      ]
    }
    if (pathNames[0] === 'admin') {
      if (pathNames.length > 1) {
        return [
          { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
          { href: '/admin', text: 'Admin' },
          { href: null, text: pathNames[1].charAt(0).toUpperCase() + pathNames[1].slice(1) }
        ]
      }
      return [
        { href: '/', text: <Home className="h-4 w-4" />, isHome: true },
        { href: null, text: 'Admin' }
      ]
    }
    return [
      { href: null, text: <Home className="h-4 w-4" />, isHome: true }
    ]
  }, [pathNames, breadcrumbState])

  // Memoize the breadcrumb list rendering
  const renderBreadcrumbItems = React.useMemo(() => (
    <BreadcrumbList aria-label="Breadcrumb navigation">
      {getBreadcrumbItems.map((item, index, array) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <BreadcrumbSeparator 
              className="text-gray-400"
              aria-hidden="true"
            >/</BreadcrumbSeparator>
          )}
          <BreadcrumbItem>
            {item.href ? (
              <BreadcrumbLink asChild>
                <Link 
                  href={item.href} 
                  className={`${item.isHome ? 'text-gray-600' : 'text-gray-600'} hover:text-primary flex items-center`}
                  aria-current={index === array.length - 1 ? "page" : undefined}
                  aria-label={item.isHome ? "Home" : `Navigate to ${item.text}`}
                >
                  {item.isHome ? (
                    <span aria-hidden="true">
                      <Home className="h-4 w-4" />
                    </span>
                  ) : (
                    item.text
                  )}
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage 
                className="text-gray-900 font-medium items-center whitespace-nowrap leading-none"
                aria-current="page"
              >
                {item.text}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </React.Fragment>
      ))}
    </BreadcrumbList>
  ), [getBreadcrumbItems])

  return (
    <div 
      className="w-full fixed top-14 z-40 bg-white border-b border-gray-100 print:hidden"
      role="navigation"
      aria-label="Breadcrumb"
    >
      <div className="w-full">
        <Breadcrumb className="h-10 flex items-center px-4 leading-[0.5rem]">
          {renderBreadcrumbItems}
        </Breadcrumb>
      </div>
    </div>
  )
} 