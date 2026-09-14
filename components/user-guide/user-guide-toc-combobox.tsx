'use client';

import { useMemo } from 'react';
import { Combobox } from '@/components/ui/combobox';
import type { UserGuideHeading } from '@/utils/user-guide-content';

interface UserGuideTocComboboxProps {
  headings: UserGuideHeading[];
  /** Heading currently in view (scroll-spy); shown as the closed value. */
  activeId: string | null;
}

/** Jumps to a heading the same way a `#id` link would, keeping the URL hash in sync. */
export function jumpToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  window.history.pushState(null, '', `#${id}`);
  // scroll-margin-top on the heading keeps it clear of the fixed header.
  el.scrollIntoView({ block: 'start' });
}

/**
 * Mobile replacement for the sidebar table of contents: a searchable dropdown
 * listing every heading, indented by level.
 */
export function UserGuideTocCombobox({ headings, activeId }: UserGuideTocComboboxProps) {
  const options = useMemo(
    () =>
      headings.map((heading) => ({
        value: heading.id,
        displayValue: heading.text,
        label: (
          <span className={heading.level >= 3 ? 'pl-4 text-muted-foreground' : 'font-medium'}>
            {heading.text}
          </span>
        ),
      })),
    [headings]
  );

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents">
      <Combobox
        options={options}
        value={activeId ?? undefined}
        onValueChange={jumpToHeading}
        placeholder="Jump to section..."
        dropdownPlacement="down"
        noResultsText="No matching section"
        showLabelWhenClosed
      />
    </nav>
  );
}
