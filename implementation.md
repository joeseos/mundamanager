# TanStack Query Migration Implementation Plan

## Current State Analysis

### Fighter Page Architecture (`app/fighter/[id]/page.tsx`)
- **Server Component**: Fetches fighter data using granular shared functions with `unstable_cache`
- **Data Sources**: 
  - Fighter basic info, equipment, skills, effects, vehicles
  - Gang data (basic, positioning, credits)
  - Fighter types and sub-types
  - Campaign relationships
  - Exotic beast ownership data
- **Caching**: Uses Next.js `unstable_cache` with custom cache tags
- **Client Component**: `components/fighter/fighter-page.tsx` handles UI state and mutations

### Current Server Actions
- **XP Updates**: `updateFighterXp`, `updateFighterXpWithOoa`
- **Fighter Details**: `updateFighterDetails`
- **Status Changes**: `editFighterStatus` (kill, retire, sell, etc.)
- **Cache Invalidation**: Manual cache tag invalidation after mutations

## Migration Strategy

### Phase 1: Setup TanStack Query Infrastructure

#### 1.1 Install Dependencies
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

#### 1.2 Create Query Client Provider
**File**: `app/providers/query-client-provider.tsx`
```tsx
'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function QueryClientProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          gcTime: 5 * 60 * 1000, // 5 minutes
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

#### 1.3 Wrap Root Layout
**File**: `app/layout.tsx`
```tsx
import { QueryClientProviderWrapper } from './providers/query-client-provider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <QueryClientProviderWrapper>
          {children}
        </QueryClientProviderWrapper>
      </body>
    </html>
  )
}
```

### Phase 2: Create Query Functions

#### 2.1 Fighter Query Functions
**File**: `app/lib/queries/fighter-queries.ts`

Instead of rewriting all the query logic, we'll create query functions that reuse the existing database query logic from `app/lib/fighter-data.ts`, but without the `unstable_cache` wrapper:

```tsx
import { createClient } from '@/utils/supabase/client'
import type { FighterBasic, FighterEquipment, FighterSkill, FighterEffect } from '@/app/lib/fighter-data'

// Extract query logic from existing functions in fighter-data.ts
async function queryFighterBasic(fighterId: string): Promise<FighterBasic> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fighters')
    .select(`
      id, fighter_name, label, note, note_backstory, credits,
      cost_adjustment, movement, weapon_skill, ballistic_skill,
      strength, toughness, wounds, initiative, attacks,
      leadership, cool, willpower, intelligence, xp,
      special_rules, fighter_class, fighter_class_id,
      fighter_type, fighter_type_id, fighter_gang_legacy_id,
      fighter_gang_legacy:fighter_gang_legacy_id(id, fighter_type_id, name),
      fighter_sub_type_id, killed, starved, retired, enslaved,
      recovery, captured, free_skill, kills, gang_id,
      fighter_pet_id, image_url, position
    `)
    .eq('id', fighterId)
    .single()

  if (error) throw error
  return data
}

async function queryFighterEquipment(fighterId: string): Promise<FighterEquipment[]> {
  const supabase = createClient()
  // Copy the exact query logic from getFighterEquipment in fighter-data.ts
  // but without the unstable_cache wrapper
  // ... (copy existing implementation)
}

export const fighterQueries = {
  // Query keys
  keys: {
    all: ['fighters'] as const,
    fighter: (id: string) => [...fighterQueries.keys.all, id] as const,
    basic: (id: string) => [...fighterQueries.keys.fighter(id), 'basic'] as const,
    equipment: (id: string) => [...fighterQueries.keys.fighter(id), 'equipment'] as const,
    skills: (id: string) => [...fighterQueries.keys.fighter(id), 'skills'] as const,
    effects: (id: string) => [...fighterQueries.keys.fighter(id), 'effects'] as const,
    vehicles: (id: string) => [...fighterQueries.keys.fighter(id), 'vehicles'] as const,
    totalCost: (id: string) => [...fighterQueries.keys.fighter(id), 'total-cost'] as const,
  },

  // Query functions - reuse database query logic without cache
  basic: (fighterId: string) => ({
    queryKey: fighterQueries.keys.basic(fighterId),
    queryFn: () => queryFighterBasic(fighterId),
  }),

  equipment: (fighterId: string) => ({
    queryKey: fighterQueries.keys.equipment(fighterId),
    queryFn: () => queryFighterEquipment(fighterId),
  }),

  // Add other query functions following the same pattern...
}
```

#### 2.2 Gang Query Functions
**File**: `app/lib/queries/gang-queries.ts`
```tsx
export const gangQueries = {
  keys: {
    all: ['gangs'] as const,
    gang: (id: string) => [...gangQueries.keys.all, id] as const,
    basic: (id: string) => [...gangQueries.keys.gang(id), 'basic'] as const,
    credits: (id: string) => [...gangQueries.keys.gang(id), 'credits'] as const,
    fighters: (id: string) => [...gangQueries.keys.gang(id), 'fighters'] as const,
  },

  basic: (gangId: string) => ({
    queryKey: gangQueries.keys.basic(gangId),
    queryFn: async () => {
      const supabase = createClient()
      // Implementation...
    },
  }),

  // Add other gang queries...
}
```

### Phase 3: Implement Direct Server Action Integration

#### 3.1 Client Components Call Server Actions Directly
Instead of creating wrapper mutation functions, client components will call server actions directly using TanStack Query's `useMutation`:

```tsx
// components/fighter/fighter-page-client.tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateFighterXpWithOoa, updateFighterDetails } from '@/app/actions/edit-fighter'
import { fighterQueries, gangQueries } from '@/app/lib/queries'

export default function FighterPageClient({ fighterId }: { fighterId: string }) {
  const queryClient = useQueryClient()

  // Direct server action call with TanStack Query optimistic updates
  const updateXpMutation = useMutation({
    mutationFn: updateFighterXpWithOoa, // Direct server action call
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: fighterQueries.keys.basic(variables.fighter_id) })

      // Optimistic update
      const previousFighter = queryClient.getQueryData(fighterQueries.keys.basic(variables.fighter_id))
      queryClient.setQueryData(fighterQueries.keys.basic(variables.fighter_id), (old: any) => ({
        ...old,
        xp: old.xp + variables.xp_to_add,
        kills: old.kills + (variables.ooa_count || 0),
      }))

      return { previousFighter }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousFighter) {
        queryClient.setQueryData(fighterQueries.keys.basic(variables.fighter_id), context.previousFighter)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: fighterQueries.keys.basic(fighterId) })
      queryClient.invalidateQueries({ queryKey: gangQueries.keys.fighters() })
    },
  })

  const handleAddXp = (xpAmount: number, ooaCount?: number) => {
    updateXpMutation.mutate({
      fighter_id: fighterId,
      xp_to_add: xpAmount,
      ooa_count: ooaCount,
    })
  }

  // ... rest of component
}
```

### Phase 4: Migrate Server Component

#### 4.1 Update Fighter Page Server Component
**File**: `app/fighter/[id]/page.tsx`
```tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fighterQueries, gangQueries } from '@/app/lib/queries'
import { FighterPageClient } from '@/components/fighter/fighter-page-client'
import { createClient } from '@/utils/supabase/server'
import { getFighterBasic, getFighterEquipment, getFighterSkills, getFighterEffects, getFighterVehicles, getFighterTotalCost } from '@/app/lib/fighter-data'
import { getGangBasic, getGangPositioning, getGangCredits } from '@/app/lib/gang-data'

export default async function FighterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  })

  const supabase = await createClient()

  try {
    // Prefetch fighter data in parallel using existing cached functions
    await Promise.all([
      queryClient.prefetchQuery({
        ...fighterQueries.basic(id),
        queryFn: () => getFighterBasic(id, supabase),
      }),
      queryClient.prefetchQuery({
        ...fighterQueries.equipment(id),
        queryFn: () => getFighterEquipment(id, supabase),
      }),
      queryClient.prefetchQuery({
        ...fighterQueries.skills(id),
        queryFn: () => getFighterSkills(id, supabase),
      }),
      queryClient.prefetchQuery({
        ...fighterQueries.effects(id),
        queryFn: () => getFighterEffects(id, supabase),
      }),
      queryClient.prefetchQuery({
        ...fighterQueries.vehicles(id),
        queryFn: () => getFighterVehicles(id, supabase),
      }),
      queryClient.prefetchQuery({
        ...fighterQueries.totalCost(id),
        queryFn: () => getFighterTotalCost(id, supabase),
      }),
    ])

    // Get basic fighter data to determine gang ID
    const fighterBasic = await getFighterBasic(id, supabase)
    
    if (fighterBasic) {
      // Prefetch gang data
      await Promise.all([
        queryClient.prefetchQuery({
          ...gangQueries.basic(fighterBasic.gang_id),
          queryFn: () => getGangBasic(fighterBasic.gang_id, supabase),
        }),
        queryClient.prefetchQuery({
          ...gangQueries.credits(fighterBasic.gang_id),
          queryFn: () => getGangCredits(fighterBasic.gang_id, supabase),
        }),
        // Add other gang queries as needed
      ])
    }

    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <FighterPageClient fighterId={id} />
      </HydrationBoundary>
    )
  } catch (error) {
    console.error('Error in fighter page:', error)
    redirect('/')
  }
}
```

### Phase 5: Update Client Component

#### 5.1 Convert Fighter Page to Use TanStack Query
**File**: `components/fighter/fighter-page-client.tsx`
```tsx
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fighterQueries, gangQueries } from '@/app/lib/queries'
import { updateFighterXpWithOoa, updateFighterDetails, editFighterStatus } from '@/app/actions/edit-fighter'

export default function FighterPageClient({ fighterId }: { fighterId: string }) {
  const queryClient = useQueryClient()

  // Queries - TanStack Query handles caching and background refetching
  const { data: fighter, isLoading: fighterLoading } = useQuery(fighterQueries.basic(fighterId))
  const { data: equipment, isLoading: equipmentLoading } = useQuery(fighterQueries.equipment(fighterId))
  const { data: gang, isLoading: gangLoading } = useQuery(
    gangQueries.basic(fighter?.gang_id || ''),
    { enabled: !!fighter?.gang_id }
  )

  // Direct server action mutations with optimistic updates
  const updateXpMutation = useMutation({
    mutationFn: updateFighterXpWithOoa,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: fighterQueries.keys.basic(variables.fighter_id) })
      const previousFighter = queryClient.getQueryData(fighterQueries.keys.basic(variables.fighter_id))
      
      // Optimistic update
      queryClient.setQueryData(fighterQueries.keys.basic(variables.fighter_id), (old: any) => ({
        ...old,
        xp: old.xp + variables.xp_to_add,
        kills: old.kills + (variables.ooa_count || 0),
      }))
      
      return { previousFighter }
    },
    onError: (err, variables, context) => {
      if (context?.previousFighter) {
        queryClient.setQueryData(fighterQueries.keys.basic(variables.fighter_id), context.previousFighter)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: fighterQueries.keys.basic(fighterId) })
    },
  })

  const updateDetailsMutation = useMutation({
    mutationFn: updateFighterDetails,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fighterQueries.keys.fighter(fighterId) })
    },
  })

  // Handlers calling server actions directly
  const handleAddXp = (xpAmount: number, ooaCount?: number) => {
    updateXpMutation.mutate({
      fighter_id: fighterId,
      xp_to_add: xpAmount,
      ooa_count: ooaCount,
    })
  }

  const handleUpdateDetails = (details: any) => {
    updateDetailsMutation.mutate({
      fighter_id: fighterId,
      ...details,
    })
  }

  if (fighterLoading || equipmentLoading || gangLoading) {
    return <div>Loading...</div>
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      {/* Fighter components using queried data */}
      <FighterDetailsCard
        fighter={fighter}
        onAddXp={handleAddXp}
        onUpdateDetails={handleUpdateDetails}
        // ... other props
      />
      {/* ... rest of components */}
    </main>
  )
}
```

### Phase 6: Remove Legacy Cache System

#### 6.0 Update Import Paths
First, update the server component to import from `app/lib/fighter-data.ts` (the correct current path):

**File**: `app/fighter/[id]/page.tsx` - Update imports to match current structure:
```tsx
import { 
  getFighterBasic,
  getFighterEquipment,
  getFighterSkills,
  getFighterEffects,
  getFighterVehicles,
  getFighterTotalCost
} from '@/app/lib/fighter-data'  // Current actual path

import {
  getGangBasic,
  getGangPositioning,
  getGangCredits
} from '@/app/lib/gang-data'  // Current actual path
```

### Phase 6: Remove Legacy Cache System

#### 6.1 Remove unstable_cache Usage
- Remove `unstable_cache` wrappers from `app/lib/fighter-data.ts`
- Remove cache tag invalidation from server actions
- Update server actions to only perform mutations, not cache management

#### 6.2 Refactor Server Actions for TanStack Query
**File**: `app/actions/edit-fighter.ts`

The server actions need to be updated to remove all cache invalidation code since TanStack Query will handle cache management:
```tsx
'use server'

export async function updateFighterXpWithOoa(params: UpdateFighterXpWithOoaParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedUser(supabase)

    // Get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, xp, kills, fighter_name')
      .eq('id', params.fighter_id)
      .single()

    if (fighterError || !fighter) {
      throw new Error('Fighter not found')
    }

    // Update XP and kills
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({ 
        xp: fighter.xp + params.xp_to_add,
        kills: fighter.kills + (params.ooa_count || 0),
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp, kills, gang_id')
      .single()

    if (updateError) throw updateError

    // Keep existing logging (business logic)
    try {
      await logFighterAction({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        action_type: 'fighter_xp_changed',
        old_value: fighter.xp,
        new_value: updatedFighter.xp,
        user_id: user.id
      })
    } catch (logError) {
      console.error('Failed to log fighter XP change:', logError)
    }

    // REMOVE: All cache invalidation code - TanStack Query handles cache management
    // The following lines should be removed during migration:
    // invalidateFighterData(params.fighter_id, fighter.gang_id)
    // revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighter_id))
    // revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id))
    // await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase)
    
    return {
      success: true,
      data: { 
        fighter: updatedFighter,
        xp: updatedFighter.xp,
        total_xp: updatedFighter.xp,
        kills: updatedFighter.kills
      }
    }
  } catch (error) {
    console.error('Error updating fighter XP with OOA:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }
  }
}

export async function updateFighterDetails(params: UpdateFighterDetailsParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedUser(supabase)

    // ... existing business logic ...

    // REMOVE: All cache invalidation - TanStack Query handles it
    // The following lines should be removed during migration:
    // invalidateFighterData(params.fighter_id, fighter.gang_id)
    // await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase)
    // revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighter_id))
    // revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id))

    return {
      success: true,
      data: { fighter: updatedFighter }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }
  }
}
```

## Migration Benefits

### Performance Improvements
- **Automatic Background Refetching**: Keep data fresh without user intervention
- **Request Deduplication**: Multiple components requesting same data get deduplicated
- **Optimistic Updates**: Immediate UI feedback for better user experience
- **Intelligent Caching**: Data persists across navigation and refreshes
- **SSR First Paint**: Server prefetching ensures immediate content rendering

### Developer Experience
- **Declarative Data Fetching**: Clear separation between data and UI logic
- **Built-in Loading/Error States**: Standardized handling of async states
- **DevTools Integration**: Powerful debugging capabilities
- **TypeScript Support**: Full type safety for queries and mutations
- **Direct Server Action Integration**: No wrapper functions needed

### Maintenance Benefits
- **Automatic Cache Invalidation**: TanStack Query handles when to refetch data
- **Reduced Complexity**: No manual cache tag management
- **Cleaner Server Actions**: Focus on business logic only
- **Better Error Handling**: Built-in retry and error boundary support
- **Simplified Architecture**: Direct client-to-server action communication

## Implementation Timeline

### Week 1: Infrastructure Setup
- Install TanStack Query
- Create providers and query client setup
- Set up basic query structure

### Week 2: Fighter Page Migration
- Create fighter query functions
- Migrate fighter page server component
- Update client component to use queries

### Week 3: Server Action Integration
- Refactor server actions to remove cache invalidation
- Implement direct server action calls with TanStack Query
- Add optimistic updates in client components

### Week 4: Testing & Cleanup
- Remove legacy cache system
- Update server actions
- Performance testing and optimization

## Risk Mitigation

### Backwards Compatibility
- Keep existing API routes during transition
- Gradual migration approach
- Feature flags for testing

### Data Consistency
- Server actions retain all business logic and validation
- Only cache management is moved to TanStack Query
- Database constraints ensure data integrity
- Direct server action calls maintain existing API contracts

### Performance Monitoring
- Monitor query performance
- Set up proper stale time and cache time values
- Use React Query DevTools for debugging

## Success Metrics

- **Reduced bundle size**: Remove Next.js cache dependencies
- **Improved user experience**: Faster perceived performance with optimistic updates
- **Reduced server load**: Better client-side caching reduces API calls
- **Developer productivity**: Easier data management and debugging

## Current Implementation Examples (2024)

### Equipment Purchase Flow with Optimistic Updates

The current equipment purchase flow demonstrates TanStack Query best practices with server actions:

#### Server Action (Database Mutation Only)
**File**: `app/actions/equipment.ts`
```typescript
'use server'

export async function buyEquipmentForFighter(params: BuyEquipmentParams) {
  // 1. Business logic and validation
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  // 2. Database mutations
  const result = await supabase.rpc('buy_equipment_for_fighter', {
    fighter_id: params.fighter_id,
    equipment_id: params.equipment_id,
    gang_id: params.gang_id,
    manual_cost: params.manual_cost,
    master_crafted: params.master_crafted
  })
  
  // 3. Server-side cache invalidation (for SSR data)
  invalidateFighterEquipmentPurchase({
    fighterId: params.fighter_id,
    gangId: params.gang_id
  })
  
  // 4. Return result (TanStack Query handles client cache)
  return result
}
```

#### Client Component with Optimistic Updates
**File**: `components/equipment.tsx`
```typescript
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/app/lib/queries/keys'
import { buyEquipmentForFighter } from '@/app/actions/equipment'

export function EquipmentPurchase({ fighterId, gangId }: Props) {
  const queryClient = useQueryClient()
  
  const buyEquipmentMutation = useMutation({
    // 1. Direct server action call
    mutationFn: buyEquipmentForFighter,
    
    // 2. Optimistic updates (immediate UI feedback)
    onMutate: async (variables) => {
      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.fighters.equipment(fighterId) 
      })
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.gangs.credits(gangId) 
      })

      // Snapshot current state for rollback
      const previousEquipment = queryClient.getQueryData(
        queryKeys.fighters.equipment(fighterId)
      )
      const previousGangCredits = queryClient.getQueryData(
        queryKeys.gangs.credits(gangId)
      )

      // Optimistically update gang credits (payment)
      queryClient.setQueryData(
        queryKeys.gangs.credits(gangId), 
        (old: number) => (old || 0) - (variables.manual_cost || 0)
      )

      // Optimistically add equipment to fighter
      queryClient.setQueryData(
        queryKeys.fighters.equipment(fighterId), 
        (old: Equipment[]) => [
          ...(old || []),
          {
            ...purchaseItem,
            fighter_equipment_id: `temp-${Date.now()}`,
            cost: purchaseCost,
            purchase_cost: purchaseCost,
            is_master_crafted: variables.master_crafted
          }
        ]
      )

      // Return rollback data
      return { previousEquipment, previousGangCredits }
    },
    
    // 3. Automatic error rollback
    onError: (err, variables, context) => {
      // TanStack Query automatically rolls back optimistic updates
      if (context?.previousEquipment) {
        queryClient.setQueryData(
          queryKeys.fighters.equipment(fighterId), 
          context.previousEquipment
        )
      }
      if (context?.previousGangCredits) {
        queryClient.setQueryData(
          queryKeys.gangs.credits(gangId), 
          context.previousGangCredits
        )
      }
    },
    
    // 4. Success handling (automatic cache update from server response)
    onSuccess: (data, variables, context) => {
      // TanStack Query automatically updates cache with server response
      // No manual cache management needed!
    }
  })

  const handlePurchase = (equipmentId: string, cost: number) => {
    buyEquipmentMutation.mutate({
      fighter_id: fighterId,
      equipment_id: equipmentId,
      gang_id: gangId,
      manual_cost: cost
    })
  }

  return (
    <div>
      <button 
        onClick={() => handlePurchase('123', 50)}
        disabled={buyEquipmentMutation.isPending}
      >
        {buyEquipmentMutation.isPending ? 'Purchasing...' : 'Buy Equipment'}
      </button>
    </div>
  )
}
```

### Cache Key Structure

**File**: `app/lib/queries/keys.ts`
```typescript
export const queryKeys = {
  fighters: {
    all: ['fighters'] as const,
    detail: (id: string) => ['fighters', id, 'detail'] as const,
    equipment: (id: string) => ['fighters', id, 'equipment'] as const,
    skills: (id: string) => ['fighters', id, 'skills'] as const,
    effects: (id: string) => ['fighters', id, 'effects'] as const,
  },
  gangs: {
    all: ['gangs'] as const,
    detail: (id: string) => ['gangs', id, 'detail'] as const,
    credits: (id: string) => ['gangs', id, 'credits'] as const,
    rating: (id: string) => ['gangs', id, 'rating'] as const,
  }
}

// String conversion for server-side cache invalidation
export const cacheKeys = {
  fighters: {
    equipment: (id: string) => 'fighters.' + id + '.equipment',
    detail: (id: string) => 'fighters.' + id + '.detail',
  },
  gangs: {
    credits: (id: string) => 'gangs.' + id + '.credits',
    rating: (id: string) => 'gangs.' + id + '.rating',
  }
}
```

### Server-Side Cache Invalidation

**File**: `app/lib/queries/invalidation.ts`
```typescript
import { revalidateTag } from 'next/cache'
import { cacheKeys } from './keys'

export function invalidateFighterEquipmentPurchase(params: {
  fighterId: string
  gangId: string
}) {
  // Invalidate SSR cache tags for next page load
  revalidateTag(cacheKeys.fighters.equipment(params.fighterId))
  revalidateTag(cacheKeys.fighters.detail(params.fighterId))
  revalidateTag(cacheKeys.gangs.credits(params.gangId))
  
  // TanStack Query client cache is handled automatically
  // through query invalidation in the mutation callbacks
}
```

### TanStack Query Best Practices Demonstrated

1. **Separation of Concerns**:
   - Server actions handle business logic and database mutations
   - TanStack Query handles client-side cache management
   - Server-side cache invalidation for SSR performance

2. **Optimistic Updates**:
   - Immediate UI feedback using `onMutate`
   - Automatic rollback on errors using `onError`
   - Server response automatically updates cache

3. **Cache Coordination**:
   - Same logical keys converted to different formats
   - Client-side: Arrays for TanStack Query
   - Server-side: Strings for revalidateTag

4. **Error Handling**:
   - Built-in retry mechanisms
   - Automatic optimistic update rollbacks
   - Graceful error states in UI

This approach provides the benefits of both caching systems: TanStack Query's powerful client-side cache management with Next.js server-side caching for optimal SSR performance.