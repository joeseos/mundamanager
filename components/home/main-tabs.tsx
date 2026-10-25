import Link from 'next/link'

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
        const className = `md:[word-spacing:0vw] [word-spacing:100vw] flex-1 md:p-4 p-2 leading-none text-center transition-colors ${
          active === key ? 'text-foreground font-medium border-b-0 border-primary' : 'text-muted-foreground hover:text-foreground'
        }`
        return onHomeTab && isHomeTab(key) ? (
          <button key={key} onClick={() => onHomeTab(key)} className={className}>
            {title}
          </button>
        ) : (
          <Link key={key} href={href} prefetch={false} className={className}>
            {title}
          </Link>
        )
      })}
    </div>
  )
}
