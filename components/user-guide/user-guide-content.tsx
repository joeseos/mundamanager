"use client"

import { useEffect } from 'react'
import { EditionToggle } from '@/components/home/edition-toggle'
import { useHomeEdition } from '@/hooks/use-home-edition'
import { useActiveHeading } from '@/hooks/use-active-heading'
import { EDITION_N23, EDITION_N26 } from '@/types/edition'
import type { EditionSlug } from '@/types/edition'
import type { PreparedUserGuide } from '@/utils/user-guide-content'
import { UserGuideToc } from '@/components/user-guide/user-guide-toc'
import { UserGuideTocCombobox } from '@/components/user-guide/user-guide-toc-combobox'
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp'
import '@/components/ui/rich-text-editor.css'

interface UserGuideContentProps {
  guides: Record<EditionSlug, PreparedUserGuide>
}

// Fixed header (h-14) + breadcrumb bar (h-10) = 6rem; matches `top-24` / `scroll-mt-24`.
const HEADER_OFFSET_PX = 96

export function UserGuideContent({ guides }: UserGuideContentProps) {
  const { editionSlug, setEditionSlug } = useHomeEdition()

  const activeSlug: EditionSlug = editionSlug === EDITION_N26 ? EDITION_N26 : EDITION_N23
  const guide = guides[activeSlug]
  const hasContent = !isHtmlEffectivelyEmpty(guide.html)
  const headingIds = guide.headings.map((heading) => heading.id)
  // activeSlug doubles as the content key: the article subtree is keyed by it,
  // so the hook re-attaches to the freshly mounted headings on toggle.
  const activeId = useActiveHeading(hasContent ? headingIds : [], HEADER_OFFSET_PX, activeSlug)

  // Widen the shared layout wrapper while the guide is mounted so the TOC gets
  // its own column without shrinking the article. Same pattern as gang.tsx.
  useEffect(() => {
    const wrapper = document.getElementById('main-content-wrapper')
    if (!wrapper) return
    wrapper.classList.remove('max-w-5xl')
    wrapper.classList.add('max-w-7xl')
    return () => {
      wrapper.classList.remove('max-w-7xl')
      wrapper.classList.add('max-w-5xl')
    }
  }, [])

  return (
    <div className="w-full flex flex-col md:flex-row md:items-start gap-4">
      {/* Desktop/tablet: sticky table of contents in its own column. */}
      {hasContent && guide.headings.length > 0 && (
        <aside className="hidden md:block md:w-64 lg:w-72 shrink-0 md:sticky md:top-24 max-h-[calc(100svh-7rem)] overflow-y-auto">
          <div className="bg-card shadow-md rounded-lg p-4">
            <UserGuideToc headings={guide.headings} activeId={activeId} />
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 bg-card shadow-md rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h1 className="text-2xl md:text-2xl font-bold">
            User Guide: How to Use Munda Manager
          </h1>
          <EditionToggle value={editionSlug} onChange={setEditionSlug} />
        </div>

        <div className="mb-6">
          <p className="text-muted-foreground mb-2">
            Welcome to the Munda Manager user guide! This comprehensive guide will help you make the most of all the features available in Munda Manager. Whether you&apos;re creating your first gang, managing a campaign, or exploring advanced mechanics, you&apos;ll find detailed instructions and helpful tips below.
          </p>
        </div>

        {/* Only the active edition is rendered so heading ids stay unique in the DOM. */}
        {hasContent ? (
          <div key={activeSlug}>
            {/* Mobile: jump-to-section dropdown replaces the sidebar. */}
            {guide.headings.length > 0 && (
              <div className="md:hidden mb-6">
                <UserGuideTocCombobox headings={guide.headings} activeId={activeId} />
              </div>
            )}
            {/* scroll-mt keeps anchored headings clear of the sticky header; markers match the TOC.
                .heading-anchor is the "#" permalink injected after each heading: hidden until the
                heading is hovered (or the link is focused via keyboard). */}
            <div
              className={[
                'prose max-w-none',
                '[&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24',
                '[&_li]:marker:text-red-800',
                '[&_.heading-anchor]:ml-2 [&_.heading-anchor]:no-underline [&_.heading-anchor]:font-normal',
                '[&_.heading-anchor]:text-muted-foreground [&_.heading-anchor]:opacity-0',
                '[&_.heading-anchor]:transition-opacity [&_.heading-anchor]:duration-150',
                '[&_h1:hover_.heading-anchor]:opacity-100 [&_h2:hover_.heading-anchor]:opacity-100 [&_h3:hover_.heading-anchor]:opacity-100',
                '[&_.heading-anchor:focus-visible]:opacity-100',
                '[&_.heading-anchor:hover]:text-red-800',
              ].join(' ')}
              dangerouslySetInnerHTML={{ __html: guide.html }}
            />
          </div>
        ) : (
          <p className="text-muted-foreground italic text-center">
            This guide has no content yet.
          </p>
        )}
      </div>
    </div>
  )
}
