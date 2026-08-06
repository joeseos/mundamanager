"use client"

import { useState } from 'react'

/**
 * Runs `onEditionChange` during render when `editionId` changes.
 * Shared by Create Gang / Create Campaign to clear selections that no longer
 * belong to the newly selected edition (React "adjust state when prop changes"
 * pattern, same as the prevX/setPrevX used elsewhere in this codebase).
 */
export function useEditionChangeReset(
  editionId: string | null | undefined,
  onEditionChange: (editionId: string | null | undefined) => void
) {
  const [prevEditionId, setPrevEditionId] = useState(editionId)
  if (editionId !== prevEditionId) {
    setPrevEditionId(editionId)
    onEditionChange(editionId)
  }
}
