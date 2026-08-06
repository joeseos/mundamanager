"use client"

import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition'

interface EditionToggleProps {
  value: EditionSlug;
  onChange: (slug: EditionSlug) => void;
  className?: string;
}

const OPTIONS: { slug: EditionSlug; label: string }[] = [
  { slug: EDITION_N23, label: 'N23' },
  { slug: EDITION_N26, label: 'N26' },
]

export function EditionToggle({ value, onChange, className = '' }: EditionToggleProps) {
  const toggle = () => {
    onChange(value === EDITION_N23 ? EDITION_N26 : EDITION_N23)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === EDITION_N26}
      aria-label={`Edition ${value === EDITION_N23 ? 'N23' : 'N26'}. Click to switch.`}
      onClick={toggle}
      className={`inline-flex shrink-0 cursor-pointer rounded-md border border-border bg-muted/40 p-0.5 ${className}`}
    >
      {OPTIONS.map(({ slug, label }) => {
        const selected = value === slug
        return (
          <span
            key={slug}
            aria-hidden="true"
            className={`px-2.5 py-1 text-xs font-medium rounded-[5px] transition-colors pointer-events-none ${
              selected
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground opacity-70'
            }`}
          >
            {label}
          </span>
        )
      })}
    </button>
  )
}
