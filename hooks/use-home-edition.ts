"use client"

import { useCallback, useSyncExternalStore } from 'react'
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition'

export const HOME_EDITION_STORAGE_KEY = 'home_edition'

function isEditionSlug(value: string | null | undefined): value is EditionSlug {
  return value === EDITION_N23 || value === EDITION_N26
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

/**
 * The edition selected by the home toggle, backed by localStorage.
 *
 * Deliberately network-free: the slug is available synchronously on first
 * render, so lists filter correctly on first paint and a failed request can
 * never leave edition-scoped UI rendering empty.
 */
export function useHomeEdition() {
  const editionSlug = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setEditionSlug = useCallback((slug: EditionSlug) => {
    setStoredEdition(slug)
  }, [])

  return { editionSlug, setEditionSlug }
}
