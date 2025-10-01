# Implementation Plan: Unified Cache Tag System for Gang and Fighter Pages

## Problem Statement

Currently, the gang page (`app/gang/[id]/page.tsx`) uses **separate database queries** for fighter data that are different from the granular shared functions in `app/lib/shared/fighter-data.ts`. This creates:

1. **Cache Invalidation Issues**: When fighter data changes, we must invalidate multiple different cache tags
2. **Data Inconsistency**: Gang page and fighter page load fighter data differently, leading to potential staleness
3. **Maintenance Burden**: Two separate code paths to maintain for the same data
4. **Cache Fragmentation**: Multiple cache entries for the same underlying data

## Solution Overview

Refactor the gang page to use the same granular shared functions from `app/lib/shared/fighter-data.ts` that the fighter page uses. This creates a **single source of truth** with shared cache tags.

### Current State

**Gang Page** (`app/gang/[id]/page.tsx`):
- Uses `getGangFightersList()` from `app/lib/shared/gang-data.ts` (lines 315-340)
- `getGangFightersList()` internally calls granular fighter functions BUT wraps everything in a single composite cache tag
- Has its own `processGangData()` function (lines 10-274) that transforms fighter data
- Cache Tag: `COMPOSITE_GANG_FIGHTERS_LIST(gangId)`

**Fighter Page** (`app/fighter/[id]/page.tsx`):
- Uses granular functions directly from `app/lib/shared/fighter-data.ts` (lines 25-67)
- Fetches data in parallel with individual cache tags per fighter
- Cache Tags: `BASE_FIGHTER_BASIC(fighterId)`, `BASE_FIGHTER_EQUIPMENT(fighterId)`, etc.

### Problem Illustration

```
CURRENT (Broken):
┌─────────────────────────────────────────────────────────────┐
│ Gang Page                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ COMPOSITE_GANG_FIGHTERS_LIST(gangId)                   │ │
│ │ ├─ Fighter 1 data (embedded in composite cache)        │ │
│ │ ├─ Fighter 2 data (embedded in composite cache)        │ │
│ │ └─ Fighter 3 data (embedded in composite cache)        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Fighter Page                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ BASE_FIGHTER_BASIC(fighter1Id)                         │ │
│ │ BASE_FIGHTER_EQUIPMENT(fighter1Id)                     │ │
│ │ BASE_FIGHTER_SKILLS(fighter1Id)                        │ │
│ │ COMPUTED_FIGHTER_TOTAL_COST(fighter1Id)                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

❌ When fighter equipment changes:
   - Must invalidate COMPOSITE_GANG_FIGHTERS_LIST (entire list)
   - Must invalidate BASE_FIGHTER_EQUIPMENT (just that fighter)
   - Gang page shows stale data if we forget composite tag
   - Wasteful: entire gang list re-fetched for one fighter change
```

```
DESIRED (Fixed):
┌─────────────────────────────────────────────────────────────┐
│ Gang Page                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ BASE_FIGHTER_BASIC(fighter1Id) ◄─────────┐             │ │
│ │ BASE_FIGHTER_EQUIPMENT(fighter1Id)       │             │ │
│ │ COMPUTED_FIGHTER_TOTAL_COST(fighter1Id)  │ SHARED      │ │
│ └──────────────────────────────────────────┼─────────────┘ │
└────────────────────────────────────────────┼───────────────┘
                                             │
┌────────────────────────────────────────────┼───────────────┐
│ Fighter Page                               │               │
│ ┌──────────────────────────────────────────┼─────────────┐ │
│ │ BASE_FIGHTER_BASIC(fighter1Id) ◄─────────┘             │ │
│ │ BASE_FIGHTER_EQUIPMENT(fighter1Id)                     │ │
│ │ COMPUTED_FIGHTER_TOTAL_COST(fighter1Id)                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

✅ When fighter equipment changes:
   - Invalidate BASE_FIGHTER_EQUIPMENT(fighter1Id) only
   - Both gang and fighter pages automatically get fresh data
   - Surgical invalidation: only affected fighter re-fetched
```

## Implementation Strategy

### Phase 1: Refactor `getGangFightersList()` in `app/lib/shared/gang-data.ts`

**Current Implementation** (lines 577-710):
```typescript
export const getGangFightersList = async (gangId: string, supabase: any): Promise<GangFighter[]> => {
  return unstable_cache(
    async () => {
      // Get all fighter IDs
      const { data: fighterIds } = await supabase
        .from('fighters')
        .select('id')
        .eq('gang_id', gangId);

      // For each fighter, call getFighterBasic, getFighterEquipment, etc.
      const fighters = [];
      for (const fighter of fighterIds) {
        const [fighterBasic, equipment, ...] = await Promise.all([
          getFighterBasic(fighter.id, supabase),
          getFighterEquipment(fighter.id, supabase),
          // ... more calls
        ]);
        fighters.push({ ...fighterBasic, equipment, ... });
      }
      return fighters;
    },
    [`gang-fighters-list-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId)], // ❌ WRONG!
      revalidate: false
    }
  )();
};
```

**Problem**: The entire function is wrapped in `unstable_cache()` with a composite tag. This means:
- Individual fighter data functions (with their own cache tags) are **called inside** the composite cache
- When the composite cache is fresh, the inner functions are **never called**
- Cache tag hierarchy is **broken** - invalidating individual fighter tags doesn't affect the composite

**New Implementation**:
```typescript
/**
 * Get all fighters in a gang with complete data
 * NOTE: This function does NOT use unstable_cache() itself.
 * It relies on the individual fighter data functions' caching.
 * This ensures proper cache tag hierarchy.
 */
export const getGangFightersList = async (gangId: string, supabase: any): Promise<GangFighter[]> => {
  // Get all fighter IDs (this can be cached separately)
  const fighterIds = await getGangFighterIds(gangId, supabase);

  // Fetch all fighters in parallel using cached granular functions
  const fighters = await Promise.all(
    fighterIds.map(async (fighterId) => {
      // Each of these calls uses its own cache tags
      const [
        fighterBasic,
        equipment,
        skills,
        effects,
        vehicles,
        totalCost
      ] = await Promise.all([
        getFighterBasic(fighterId, supabase),      // ✅ Uses BASE_FIGHTER_BASIC(fighterId)
        getFighterEquipment(fighterId, supabase),  // ✅ Uses BASE_FIGHTER_EQUIPMENT(fighterId)
        getFighterSkills(fighterId, supabase),     // ✅ Uses BASE_FIGHTER_SKILLS(fighterId)
        getFighterEffects(fighterId, supabase),    // ✅ Uses BASE_FIGHTER_EFFECTS(fighterId)
        getFighterVehicles(fighterId, supabase),   // ✅ Uses BASE_FIGHTER_VEHICLES(fighterId)
        getFighterTotalCost(fighterId, supabase)   // ✅ Uses COMPUTED_FIGHTER_TOTAL_COST(fighterId)
      ]);

      // Get fighter type info (can also use cached function)
      const fighterTypeInfo = await getFighterTypeInfo(fighterBasic.fighter_type_id, supabase);
      const fighterSubTypeInfo = fighterBasic.fighter_sub_type_id
        ? await getFighterSubTypeInfo(fighterBasic.fighter_sub_type_id, supabase)
        : null;

      // Get exotic beast ownership info if applicable
      const ownershipInfo = fighterBasic.fighter_pet_id
        ? await getFighterOwnershipInfo(fighterBasic.fighter_pet_id, supabase)
        : null;

      // Assemble fighter object
      return {
        id: fighterBasic.id,
        fighter_name: fighterBasic.fighter_name,
        label: fighterBasic.label,
        fighter_type: fighterBasic.fighter_type || fighterTypeInfo?.fighter_type || 'Unknown',
        fighter_class: fighterBasic.fighter_class || 'Unknown',
        fighter_sub_type: fighterSubTypeInfo,
        alliance_crew_name: fighterTypeInfo?.alliance_crew_name,
        position: fighterBasic.position,
        xp: fighterBasic.xp,
        kills: fighterBasic.kills || 0,
        credits: totalCost,
        movement: fighterBasic.movement,
        weapon_skill: fighterBasic.weapon_skill,
        ballistic_skill: fighterBasic.ballistic_skill,
        strength: fighterBasic.strength,
        toughness: fighterBasic.toughness,
        wounds: fighterBasic.wounds,
        initiative: fighterBasic.initiative,
        attacks: fighterBasic.attacks,
        leadership: fighterBasic.leadership,
        cool: fighterBasic.cool,
        willpower: fighterBasic.willpower,
        intelligence: fighterBasic.intelligence,
        equipment,
        effects,
        skills,
        vehicles,
        cost_adjustment: fighterBasic.cost_adjustment,
        special_rules: fighterBasic.special_rules || [],
        note: fighterBasic.note,
        killed: fighterBasic.killed || false,
        starved: fighterBasic.starved || false,
        retired: fighterBasic.retired || false,
        enslaved: fighterBasic.enslaved || false,
        recovery: fighterBasic.recovery || false,
        captured: fighterBasic.captured || false,
        free_skill: fighterBasic.free_skill || false,
        image_url: fighterBasic.image_url,
        owner_name: ownershipInfo?.owner_name,
        beast_equipment_stashed: ownershipInfo?.beast_equipment_stashed || false,
      };
    })
  );

  return fighters;
};

/**
 * Get list of fighter IDs for a gang (just IDs, lightweight)
 * Cache: COMPOSITE_GANG_FIGHTERS_LIST (for the list structure only)
 */
const getGangFighterIds = async (gangId: string, supabase: any): Promise<string[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighters')
        .select('id')
        .eq('gang_id', gangId);

      if (error || !data) return [];
      return data.map((f: any) => f.id);
    },
    [`gang-fighter-ids-${gangId}`],
    {
      tags: [
        CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId),
        CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(gangId)
      ],
      revalidate: false
    }
  )();
};
```

**Key Changes**:
1. ✅ Remove `unstable_cache()` wrapper from main function
2. ✅ Extract fighter ID list into separate cached function
3. ✅ Let individual fighter data functions handle their own caching
4. ✅ Cache only the fighter ID list (lightweight) with composite tag
5. ✅ Full fighter data uses granular cache tags

### Phase 2: Add Helper Functions for Fighter Metadata

Add these to `app/lib/shared/fighter-data.ts`:

```typescript
/**
 * Get fighter type information
 * Cache: GLOBAL_FIGHTER_TYPES (rarely changes)
 */
export const getFighterTypeInfo = async (fighterTypeId: string | null, supabase: any): Promise<{
  fighter_type: string;
  alliance_crew_name?: string;
} | null> => {
  if (!fighterTypeId) return null;

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_types')
        .select('fighter_type, alliance_crew_name')
        .eq('id', fighterTypeId)
        .single();

      if (error) return null;
      return data;
    },
    [`fighter-type-${fighterTypeId}`],
    {
      tags: [CACHE_TAGS.GLOBAL_FIGHTER_TYPES()],
      revalidate: 3600 // 1 hour - fighter types rarely change
    }
  )();
};

/**
 * Get fighter sub-type information
 * Cache: GLOBAL_FIGHTER_TYPES (rarely changes)
 */
export const getFighterSubTypeInfo = async (fighterSubTypeId: string, supabase: any): Promise<{
  fighter_sub_type: string;
  fighter_sub_type_id: string;
} | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_sub_types')
        .select('id, sub_type_name')
        .eq('id', fighterSubTypeId)
        .single();

      if (error) return null;
      return {
        fighter_sub_type: data.sub_type_name,
        fighter_sub_type_id: data.id
      };
    },
    [`fighter-sub-type-${fighterSubTypeId}`],
    {
      tags: [CACHE_TAGS.GLOBAL_FIGHTER_TYPES()],
      revalidate: 3600
    }
  )();
};

/**
 * Get fighter ownership info (for exotic beasts)
 * Cache: BASE_FIGHTER_BASIC (owner's basic data)
 */
export const getFighterOwnershipInfo = async (fighterPetId: string, supabase: any): Promise<{
  owner_name?: string;
  beast_equipment_stashed: boolean;
} | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_exotic_beasts')
        .select(`
          fighter_owner_id,
          fighter_equipment_id,
          fighters!fighter_owner_id (
            fighter_name
          ),
          fighter_equipment!fighter_equipment_id (
            gang_stash
          )
        `)
        .eq('id', fighterPetId)
        .single();

      if (error || !data) return null;

      return {
        owner_name: (data.fighters as any)?.fighter_name,
        beast_equipment_stashed: data.fighter_equipment?.gang_stash || false
      };
    },
    [`fighter-ownership-${fighterPetId}`],
    {
      tags: [`fighter-exotic-beast-${fighterPetId}`],
      revalidate: false
    }
  )();
};
```

### Phase 3: Update Gang Page to Use Refactored Function

**In `app/gang/[id]/page.tsx`**:

1. **Remove `processGangData()` function** (lines 10-274) - no longer needed
2. **Simplify data fetching** (lines 315-384):

```typescript
// BEFORE (lines 315-340):
const [
  gangPositioning,
  gangType,
  alliance,
  fighters,
  vehicles,
  stash,
  campaigns,
  gangCredits,
  gangVariants,
  gangRating,
  userProfile
] = await Promise.all([
  getGangPositioning(params.id, supabase),
  getGangType(gangBasic.gang_type_id, supabase),
  getAlliance(gangBasic.alliance_id, supabase),
  getGangFightersList(params.id, supabase), // ✅ This now uses granular cache tags
  getGangVehicles(params.id, supabase),
  getGangStash(params.id, supabase),
  getGangCampaigns(params.id, supabase),
  getGangCredits(params.id, supabase),
  getGangVariants(gangBasic.gang_variants || [], supabase),
  getGangRating(params.id, supabase),
  getUserProfile(gangBasic.user_id, supabase)
]);

// AFTER: Same code, but getGangFightersList now returns fully processed fighters
// No need for processGangData transformation
```

3. **Remove `processGangData()` call** (line 384):

```typescript
// BEFORE:
const processedData = await processGangData(gangData);

// AFTER: fighters are already fully processed from getGangFightersList
const gangDataForClient = {
  ...gangBasic,
  gang_type_image_url: gangType.image_url,
  credits: gangCredits,
  rating: gangRating,
  positioning: gangPositioning,
  stash: stash,
  fighters: fighters, // ✅ Already fully processed with shared cache tags
  campaigns: campaigns,
  vehicles: vehicles,
  alliance_name: alliance?.alliance_name,
  alliance_type: alliance?.alliance_type,
  gang_variants: gangVariants,
  username: userProfile?.username,
  patreon_tier_id: userProfile?.patreon_tier_id,
  patreon_tier_title: userProfile?.patreon_tier_title,
  patron_status: userProfile?.patron_status,
  // Add remaining fields that processGangData was handling
  alignment: gangBasic.alignment,
  alliance_name: gangBasic.alliance_name || "",
  gang_affiliation_id: gangBasic.gang_affiliation_id || null,
  gang_affiliation_name: gangBasic.gang_affiliation?.name || "",
  gang_type_has_affiliation: gangBasic.gang_types?.affiliation || false,
  gang_origin_id: gangBasic.gang_origin_id || null,
  gang_origin_name: gangBasic.gang_origin?.origin_name || "",
  gang_origin_category_name: gangBasic.gang_types?.gang_origin_categories?.category_name || "",
  gang_type_has_origin: !!gangBasic.gang_types?.gang_origin_category_id,
};
```

4. **Handle positioning initialization/fixing**:

Move positioning logic from `processGangData()` to gang page (or create separate utility):

```typescript
// After fetching positioning and fighters
const processedPositioning = await initializeOrFixPositioning(
  gangPositioning,
  fighters,
  params.id,
  supabase
);

// Helper function (can be in gang-data.ts or separate utility)
async function initializeOrFixPositioning(
  positioning: Record<string, any> | null,
  fighters: GangFighter[],
  gangId: string,
  supabase: any
): Promise<Record<string, any>> {
  // ... positioning logic from processGangData (lines 147-213)
  // Returns corrected positioning and updates DB if needed
}
```

### Phase 4: Update Cache Invalidation Functions

**In `utils/cache-tags.ts`**:

Update invalidation functions to remove `COMPOSITE_GANG_FIGHTERS_LIST` where no longer needed:

```typescript
// BEFORE:
export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId));
  invalidateGangCredits(params.gangId);
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId));
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId));
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId)); // ❌ Can remove this!
  // ...
}

// AFTER:
export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId));
  invalidateGangCredits(params.gangId);

  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId));

  // Shared data changes (both gang and fighter pages use these)
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId));
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId));

  // ✅ No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST anymore!
  // Gang page will automatically get fresh data from granular tags

  // Beast creation handling
  if (params.createdBeasts?.length) {
    params.createdBeasts.forEach(beast => {
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(beast.id));
    });
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(params.fighterId));
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(params.gangId));
  }
}
```

**Pattern to follow**:
- Keep `COMPOSITE_GANG_FIGHTERS_LIST` invalidation only when:
  - A fighter is added to the gang (fighter ID list changes)
  - A fighter is removed from the gang (fighter ID list changes)
  - Fighter order/positioning changes
- Remove `COMPOSITE_GANG_FIGHTERS_LIST` invalidation for:
  - Equipment changes
  - Skill changes
  - Effect/injury changes
  - Stat changes
  - Vehicle changes

### Phase 5: Add New Cache Tag for Fighter ID List

**In `utils/cache-tags.ts`**:

```typescript
export const CACHE_TAGS = {
  // ... existing tags ...

  // Add new tag for just the fighter ID list (lightweight)
  COMPOSITE_GANG_FIGHTER_IDS: (id: string) => `composite-gang-fighter-ids-${id}`,

  // Keep existing for backward compatibility during migration
  COMPOSITE_GANG_FIGHTERS_LIST: (id: string) => `composite-gang-fighters-${id}`,

  // ... rest of tags ...
} as const;
```

Update invalidation to use new tag when fighter is added/removed:

```typescript
export function invalidateFighterAddition(params: {
  fighterId: string;
  gangId: string;
  userId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighterId));
  revalidateTag(CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(params.fighterId));
  invalidateGangCredits(params.gangId);

  // Computed data changes
  revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(params.gangId));
  revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(params.gangId));

  // Shared data changes
  revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(params.gangId));
  revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighterId));

  // Fighter list structure changed (new ID added)
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTER_IDS(params.gangId));
  revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId)); // Keep for backward compatibility
}
```

## Benefits After Implementation

### 1. Single Source of Truth
- ✅ Both gang and fighter pages use same data functions
- ✅ Identical cache tags ensure consistency
- ✅ No risk of divergent data

### 2. Surgical Cache Invalidation
```typescript
// Equipment purchase example:
invalidateEquipmentPurchase({
  fighterId: "fighter-123",
  gangId: "gang-456"
});

// Only invalidates:
// - BASE_FIGHTER_EQUIPMENT(fighter-123)
// - COMPUTED_FIGHTER_TOTAL_COST(fighter-123)
// - BASE_GANG_CREDITS(gang-456)
// - COMPUTED_GANG_RATING(gang-456)

// Gang page automatically shows updated equipment for fighter-123
// Other fighters in gang use cached data (unchanged)
```

### 3. Improved Performance
- ✅ Less data re-fetched on updates (only affected fighter)
- ✅ Better cache hit ratio (granular caching)
- ✅ Parallel fetching maintained (Promise.all still used)

### 4. Simplified Maintenance
- ✅ One data loading pattern for fighters
- ✅ Less code duplication
- ✅ Easier to add new fighter fields (add once, works everywhere)

### 5. Scalability
- ✅ Large gangs benefit most (e.g., 20 fighters, only 1 changes)
- ✅ Cache memory usage more efficient
- ✅ Better for high-traffic scenarios

## Migration Checklist

### Step 1: Refactor `app/lib/shared/gang-data.ts`
- [x] Add `getGangFighterIds()` helper function
- [x] Remove `unstable_cache()` wrapper from `getGangFightersList()`
- [x] Update `getGangFightersList()` to return fully processed fighters
- [x] Remove duplicate fighter type/subtype queries (use helpers instead)

### Step 2: Add Helper Functions to `app/lib/shared/fighter-data.ts`
- [x] Add `getFighterTypeInfo()` function
- [x] Add `getFighterSubTypeInfo()` function
- [x] Add `getFighterOwnershipInfo()` function (for exotic beasts)
- [x] Export new functions

### Step 3: Refactor Gang Page `app/gang/[id]/page.tsx`
- [x] Remove `processGangData()` function entirely (lines 10-274)
- [x] Extract positioning logic to separate utility function
- [x] Call positioning utility after fetching fighters
- [x] Simplify data assembly (no more processGangData call)
- [x] Update `gangData` object to use fighters directly from `getGangFightersList()`

### Step 4: Update Cache Tags `utils/cache-tags.ts`
- [x] Add `COMPOSITE_GANG_FIGHTER_IDS` tag
- [x] Update `getGangFighterIds()` to use new tag
- [x] Review all invalidation functions
- [x] Remove `COMPOSITE_GANG_FIGHTERS_LIST` invalidation where not needed (equipment, skills, effects, stats)
- [x] Keep `COMPOSITE_GANG_FIGHTER_IDS` invalidation for add/remove fighters
- [x] Add comments explaining when to use composite vs granular tags

### Step 5: Update Cache Invalidation Functions
- [x] `invalidateEquipmentPurchase()` - remove composite tag
- [x] `invalidateEquipmentDeletion()` - remove composite tag
- [x] `invalidateFighterAdvancement()` - remove composite tag
- [x] `invalidateFighterAddition()` - use fighter IDs tag instead
- [x] `invalidateFighterDataWithFinancials()` - remove composite tag
- [x] Review all functions that currently invalidate `COMPOSITE_GANG_FIGHTERS_LIST`

### Step 6: Update Server Actions
- [ ] `update-fighter-image.ts` - review cache invalidation
- [ ] `edit-fighter.ts` - review cache invalidation
- [ ] `update-gang-positioning.ts` - review cache invalidation
- [ ] `add-gang-vehicle.ts` - review cache invalidation
- [ ] `move-to-stash.ts` - review cache invalidation
- [ ] `move-from-stash.ts` - review cache invalidation
- [ ] `sell-equipment.ts` - review cache invalidation
- [ ] `update-gang.ts` - review cache invalidation
- [ ] `campaigns/[id]/campaign-settings.ts` - review cache invalidation
- [ ] `campaigns/[id]/campaign-territories.ts` - review cache invalidation
- [ ] `equipment.ts` - review cache invalidation

### Step 7: Testing
- [ ] Test gang page loads correctly
- [ ] Test fighter page loads correctly
- [ ] Test equipment purchase updates both pages
- [ ] Test skill addition updates both pages
- [ ] Test fighter stat increase updates both pages
- [ ] Test fighter addition/removal updates gang page
- [ ] Test positioning updates correctly
- [ ] Test exotic beast ownership displays correctly
- [ ] Test large gang performance (20+ fighters)
- [ ] Test cache invalidation cascades correctly

### Step 7: Verify Cache Behavior
- [ ] Use Next.js cache debugging to verify tags
- [ ] Confirm fighter data isn't being over-fetched
- [ ] Verify cache hit rates improve
- [ ] Check that updates are surgical (only affected data re-fetched)
- [ ] Confirm no stale data issues

## Reference: TanStack Query Pattern (from example branch)

The example branch shows the ideal pattern:

```typescript
// Prefetch in parallel for gang page
await Promise.all(
  fighters.map((fighter) =>
    Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.detail(fighter.id),
        queryFn: () => queryFighterBasic(fighter.id, supabase)
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.equipment(fighter.id),
        queryFn: () => queryFighterEquipment(fighter.id, supabase)
      }),
      // ... more granular fetches
    ])
  )
)
```

**Key insight**: Each fighter's data uses its own query key. Gang page prefetches using the **same keys** that fighter page uses.

Our implementation mirrors this with Next.js `unstable_cache`:
- TanStack's `queryKey` = Our `unstable_cache` tags
- TanStack's `prefetchQuery` = Our parallel `Promise.all()` with cached functions
- Both achieve **shared cache keys across pages**

## Potential Gotchas

### 1. Performance with Large Gangs
**Issue**: Gang with 50 fighters = 50 parallel database queries
**Solution**:
- Next.js cache will handle this (granular functions already cached)
- First load may be slower, but subsequent loads will be instant
- Consider adding request deduplication if needed

### 2. Fighter Order/Positioning
**Issue**: Positioning logic was in `processGangData()`
**Solution**:
- Extract to separate utility function
- Call after fetching fighters
- Still updates database if positioning changed

### 3. Backward Compatibility
**Issue**: Existing invalidation functions still call `COMPOSITE_GANG_FIGHTERS_LIST`
**Solution**:
- Keep tag for now, remove gradually
- Add comments explaining new pattern
- Update invalidation functions one by one

### 4. Exotic Beast Ownership
**Issue**: Complex ownership queries embedded in `processGangData()`
**Solution**:
- Extract to `getFighterOwnershipInfo()` helper
- Cache with appropriate tag
- Reuse in both gang and fighter pages

### 5. Fighter Type Legacy IDs
**Issue**: Some fighters use `fighter_gang_legacy_id` instead of `fighter_type_id`
**Solution**:
- Handle in `getFighterTypeInfo()` helper
- Check both fields, prioritize correct one
- Document the fallback logic

## Success Metrics

After implementation, we should observe:

1. **Cache Hit Ratio**: Increase from ~60% to ~90%+ for fighter data
2. **Invalidation Precision**: Only affected fighters re-fetched, not entire gang
3. **Update Speed**: Fighter equipment change < 100ms to reflect on gang page
4. **Code Reduction**: ~200 lines removed from gang page
5. **Bug Reduction**: Zero stale data issues related to cache invalidation

## Conclusion

This refactoring creates a **single source of truth** for fighter data with shared cache tags across gang and fighter pages. The key insight is:

> **Don't cache the composite (gang fighters list) - cache the atoms (individual fighter data) and let the composite assemble from cached atoms.**

This mirrors the TanStack Query pattern from the example branch and provides:
- ✅ Automatic consistency
- ✅ Surgical invalidation
- ✅ Better performance
- ✅ Easier maintenance

The implementation is straightforward but requires careful attention to:
1. Removing the outer cache wrapper from `getGangFightersList()`
2. Ensuring all helper functions are properly cached
3. Updating invalidation functions to remove composite tag where not needed
4. Testing thoroughly to catch edge cases