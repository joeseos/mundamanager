import Link from 'next/link'
import type { ReactNode } from 'react'

export type HomeTabKey = 'gangs' | 'campaigns' | 'customassets'
export type MainTabKey = HomeTabKey | 'articles' | 'forum'

const TABS: { key: MainTabKey; title: string; href: string }[] = [
  { key: 'gangs', title: 'Gangs', href: '/?tab=gangs' },
  { key: 'campaigns', title: 'Campaigns', href: '/?tab=campaigns' },
  { key: 'customassets', title: 'Custom Assets', href: '/?tab=customassets' },
  { key: 'articles', title: 'Articles', href: '/articles' },
  { key: 'forum', title: 'Forum', href: '/forum' },
]

const isHomeTab = (key: MainTabKey): key is HomeTabKey => key !== 'articles' && key !== 'forum'

interface MainTabsProps {
  active: MainTabKey;
  /** On the home page, its own tabs switch in place instead of opening the page again. */
  onHomeTab?: (tab: HomeTabKey) => void;
}

/** The tab bar on the home page, /articles and /forum. */
export function MainTabs({ active, onHomeTab }: MainTabsProps) {
  return (
    <div className="w-full bg-card shadow-md rounded-lg flex justify-center">
      {TABS.map(({ key, title, href }) => {
        const className = `md:[word-spacing:0vw] [word-spacing:100vw] flex-1 md:p-4 p-2 leading-none md:leading-normal text-center transition-colors ${
          active === key ? 'text-foreground font-medium border-b-0 border-primary' : 'text-muted-foreground hover:text-foreground'
        }`
        const current = active === key ? 'page' : undefined
        return onHomeTab && isHomeTab(key) ? (
          <button key={key} onClick={() => onHomeTab(key)} aria-current={current} className={className}>
            {title}
          </button>
        ) : (
          <Link key={key} href={href} prefetch={false} aria-current={current} className={className}>
            {title}
          </Link>
        )
      })}
    </div>
  )
}

interface MainTabHeaderProps {
  title: string;
  /** h1 on the pages the tabs link to, h2 inside the home page. */
  as?: 'h1' | 'h2';
  /** Buttons and toggles on the right. */
  children?: ReactNode;
  className?: string;
}

/** A tab's title row, as tall as a button, so the title sits in the same place on every tab. */
export function MainTabHeader({ title, as: Heading = 'h2', children, className }: MainTabHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 min-h-10 ${className ?? ''}`}>
      <Heading className="text-xl md:text-2xl font-bold">{title}</Heading>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
