"use client"

import { EditionToggle } from '@/components/home/edition-toggle'
import { useHomeEdition } from '@/hooks/use-home-edition'
import { EDITION_N26 } from '@/types/edition'
import { UserGuideN23 } from '@/components/user-guide/user-guide-n23'
import { UserGuideN26 } from '@/components/user-guide/user-guide-n26'

export function UserGuideContent() {
  const { editionSlug, setEditionSlug } = useHomeEdition()

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl md:text-2xl font-bold">
          User Guide: How to Use Munda Manager
        </h1>
        <EditionToggle value={editionSlug} onChange={setEditionSlug} />
      </div>

      <div className="mb-8">
        <p className="text-muted-foreground mb-2">
          Welcome to the Munda Manager user guide! This comprehensive guide will help you make the most of all the features available in Munda Manager. Whether you&apos;re creating your first gang, managing a campaign, or exploring advanced mechanics, you&apos;ll find detailed instructions and helpful tips below.
        </p>
      </div>

      {editionSlug === EDITION_N26 ? <UserGuideN26 /> : <UserGuideN23 />}
    </>
  )
}
