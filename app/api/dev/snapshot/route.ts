import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/utils/supabase/server'
import {
  getGangCore,
  getGangPositioning,
  getGangStash,
  getGangCampaigns,
  getGangFightersList,
  getGangVehicles,
} from '@/app/lib/shared/gang-data'

/**
 * Dev-only rendering-identity snapshot for the cache refactor.
 *
 * GET /api/dev/snapshot?gangId=<uuid>
 *
 * Serializes the exact outputs of the shared data functions the gang and
 * fighter pages consume. Capture before a refactor phase, capture after,
 * diff the JSON — any difference is a rendering regression for that phase.
 * Disabled outside development (404).
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.DEBUG_SNAPSHOT !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const gangId = request.nextUrl.searchParams.get('gangId')
  if (!gangId) {
    return NextResponse.json({ error: 'gangId query param required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const [core, positioning, stash, campaigns, fighters, vehicles] =
    await Promise.all([
      getGangCore(gangId, supabase),
      getGangPositioning(gangId, supabase),
      getGangStash(gangId, supabase),
      getGangCampaigns(gangId, supabase),
      getGangFightersList(gangId, supabase),
      getGangVehicles(gangId, supabase),
    ])

  // Stable key order + sorted collections so diffs are order-insensitive.
  // basic/credits/ratingAndWealth keys are kept so snapshots stay diffable
  // against branches that predate getGangCore.
  const { credits, rating, wealth, alliance, ...basic } = core ?? ({} as any)
  const snapshot = {
    basic,
    positioning,
    credits,
    ratingAndWealth: { rating, wealth },
    stash: sortById(stash),
    campaigns,
    fighters: sortById(fighters),
    vehicles: sortById(vehicles),
  }

  return new NextResponse(stableStringify(snapshot), {
    headers: { 'content-type': 'application/json' },
  })
}

function sortById<T extends { id?: string }>(items: T[] | null | undefined): T[] {
  return [...(items ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2)
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeysDeep(value[k])])
    )
  }
  return value
}
