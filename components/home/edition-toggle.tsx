"use client"

import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition'

interface EditionToggleProps {
  value: EditionSlug;
  onChange: (slug: EditionSlug) => void;
  className?: string;
  disabled?: boolean;
}

const OPTIONS: { slug: EditionSlug; label: string }[] = [
  { slug: EDITION_N23, label: 'N23' },
  { slug: EDITION_N26, label: 'N26' },
]

export function EditionToggle({ value, onChange, className = '', disabled = false }: EditionToggleProps) {
  const toggle = () => {
    if (disabled) return
    onChange(value === EDITION_N23 ? EDITION_N26 : EDITION_N23)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === EDITION_N26}
      aria-disabled={disabled}
      disabled={disabled}
      aria-label={
        disabled
          ? `Edition ${value === EDITION_N23 ? 'N23' : 'N26'} (locked)`
          : `Edition ${value === EDITION_N23 ? 'N23' : 'N26'}. Click to switch.`
      }
      onClick={toggle}
      className={`inline-flex shrink-0 rounded-md border border-border bg-muted/40 p-0.5 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
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
