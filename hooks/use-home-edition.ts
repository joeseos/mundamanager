"use client"

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { EDITION_N23, EDITION_N26, sameEditionSlug, type EditionSlug } from '@/types/edition'
import { useEditions } from '@/components/edition-select'

export const HOME_EDITION_STORAGE_KEY = 'home_edition'

export function isEditionSlug(value: string | null | undefined): value is EditionSlug {
  return value === EDITION_N23 || value === EDITION_N26
}

/** Null / missing edition slug is treated as N23 for home list filtering. */
export function matchesHomeEdition(
  editionSlug: string | null | undefined,
  selected: EditionSlug
): boolean {
  return sameEditionSlug(editionSlug, selected)
}

/** Null / missing edition_id is treated as the N23 edition id when available.
 *  When `selectedEditionId` is still unresolved (editions query not loaded),
 *  returns false so lists stay empty instead of flashing every edition. */
export function matchesHomeEditionId(
  editionId: string | null | undefined,
  selectedEditionId: string | null | undefined,
  n23EditionId: string | null | undefined
): boolean {
  if (!selectedEditionId) return false
  return (editionId ?? n23EditionId ?? null) === selectedEditionId
}

function readStoredEdition(): EditionSlug {
  if (typeof window === 'undefined') return EDITION_N23
  const saved = localStorage.getItem(HOME_EDITION_STORAGE_KEY)
  return isEditionSlug(saved) ? saved : EDITION_N23
}

type Listener = () => void

let currentEdition: EditionSlug = EDITION_N23
let hydrated = false
const listeners = new Set<Listener>()

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  currentEdition = readStoredEdition()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): EditionSlug {
  ensureHydrated()
  return currentEdition
}

function getServerSnapshot(): EditionSlug {
  return EDITION_N23
}

function setStoredEdition(slug: EditionSlug) {
  ensureHydrated()
  if (currentEdition === slug) return
  currentEdition = slug
  if (typeof window !== 'undefined') {
    localStorage.setItem(HOME_EDITION_STORAGE_KEY, slug)
  }
  listeners.forEach(listener => listener())
}

export function useHomeEdition() {
  const editionSlug = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const { data: editions = [] } = useEditions()

  const setEditionSlug = useCallback((slug: EditionSlug) => {
    setStoredEdition(slug)
  }, [])

  const editionId = useMemo(
    () => editions.find(edition => edition.slug === editionSlug)?.id ?? null,
    [editions, editionSlug]
  )

  const n23EditionId = useMemo(
    () => editions.find(edition => edition.slug === EDITION_N23)?.id ?? null,
    [editions]
  )

  return { editionSlug, setEditionSlug, editionId, n23EditionId, editions }
}
