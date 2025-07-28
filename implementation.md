# Next.js Cache Strategy Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Cache Tag Taxonomy](#cache-tag-taxonomy)
3. [Server Function Analysis](#server-function-analysis)
4. [Cache Invalidation Patterns](#cache-invalidation-patterns)
5. [Implementation Guidelines](#implementation-guidelines)
6. [Migration Strategy](#migration-strategy)
7. [Testing & Validation](#testing--validation)

## Architecture Overview

### Current State Analysis
- **Function Invocations**: ~millions with 6000 users
- **Primary Issue**: Overuse of `revalidatePath()` invalidating entire pages
- **Target**: 75-85% reduction in function invocations
- **Key Strategy**: Granular cache tags with surgical invalidation

### Design Principles
1. **Separate Base from Computed Data**: Cache raw database data separately from calculated values
2. **Shared Cache Tags**: Same data uses same tags across different pages
3. **Hierarchical Invalidation**: Changes cascade only to dependent data
4. **User-Scoped Caching**: User-specific data isolated from global data
5. **Minimal Invalidation**: Only invalidate what actually changed

## Cache Tag Taxonomy

### 1. Base Data Tags
**Raw database entities - rarely change, long cache lifetime**

```typescript
// Core entities
GANG_BASIC: (id: string) => `gang-basic-${id}`,           // name, type, color, alignment
GANG_CREDITS: (id: string) => `gang-credits-${id}`,       // credits only
GANG_RESOURCES: (id: string) => `gang-resources-${id}`,   // meat, reputation, scavenging_rolls
GANG_STASH: (id: string) => `gang-stash-${id}`,           // gang stash equipment

FIGHTER_BASIC: (id: string) => `fighter-basic-${id}`,     // name, stats, basic info
FIGHTER_EQUIPMENT: (id: string) => `fighter-equipment-${id}`, // equipment list
FIGHTER_SKILLS: (id: string) => `fighter-skills-${id}`,   // skills list
FIGHTER_EFFECTS: (id: string) => `fighter-effects-${id}`, // effects/injuries
FIGHTER_VEHICLES: (id: string) => `fighter-vehicles-${id}`, // assigned vehicles

CAMPAIGN_BASIC: (id: string) => `campaign-basic-${id}`,   // name, settings
CAMPAIGN_MEMBERS: (id: string) => `campaign-members-${id}`, // gang memberships
CAMPAIGN_TERRITORIES: (id: string) => `campaign-territories-${id}`, // territory control

VEHICLE_BASIC: (id: string) => `vehicle-basic-${id}`,     // vehicle stats
VEHICLE_EQUIPMENT: (id: string) => `vehicle-equipment-${id}`, // vehicle equipment
VEHICLE_EFFECTS: (id: string) => `vehicle-effects-${id}`, // vehicle effects
```

### 2. Computed Data Tags
**Calculated values derived from base data - invalidated when base data changes**

```typescript
// Calculated values
FIGHTER_TOTAL_COST: (id: string) => `fighter-cost-${id}`,     // base + equipment + skills + effects
FIGHTER_BEAST_COSTS: (id: string) => `fighter-beasts-${id}`,  // owned exotic beasts costs
GANG_RATING: (id: string) => `gang-rating-${id}`,             // sum of all fighter costs
GANG_FIGHTER_COUNT: (id: string) => `gang-fighter-count-${id}`, // active fighter count
GANG_VEHICLE_COUNT: (id: string) => `gang-vehicle-count-${id}`, // vehicle count

// Advanced calculations
CAMPAIGN_LEADERBOARD: (id: string) => `campaign-leaderboard-${id}`, // gang rankings
GANG_ADVANCEMENT_POOL: (id: string) => `gang-advancement-${id}`,     // available XP/credits
```

### 3. Composite Data Tags
**Multi-entity aggregated data - invalidated when any constituent changes**

```typescript
// Page-level aggregations
GANG_OVERVIEW: (id: string) => `gang-overview-${id}`,         // complete gang page data
GANG_FIGHTERS_LIST: (id: string) => `gang-fighters-${id}`,    // all fighters with equipment
FIGHTER_PAGE: (id: string) => `fighter-page-${id}`,           // complete fighter page data
CAMPAIGN_OVERVIEW: (id: string) => `campaign-overview-${id}`, // complete campaign data

// Cross-entity relationships
GANG_CAMPAIGNS: (id: string) => `gang-campaigns-${id}`,       // campaigns this gang is in
FIGHTER_GANG_DATA: (id: string) => `fighter-gang-${id}`,      // fighter with gang context
```

### 4. User-Scoped Tags
**User-specific data - isolated per user to prevent cross-contamination**

```typescript
// User-specific collections
USER_GANGS: (userId: string) => `user-gangs-${userId}`,           // user's gang list
USER_CAMPAIGNS: (userId: string) => `user-campaigns-${userId}`,   // user's campaigns
USER_CUSTOMIZATIONS: (userId: string) => `user-custom-${userId}`, // custom equipment/territories

// User dashboard data
USER_DASHBOARD: (userId: string) => `user-dashboard-${userId}`,    // home page data
USER_NOTIFICATIONS: (userId: string) => `user-notifications-${userId}`, // user notifications
```

### 5. Shared Data Tags
**Data used across multiple pages - ensures consistency**

```typescript
// Cross-page shared data (same data, multiple locations)
GANG_RATING_SHARED: (id: string) => `gang-rating-shared-${id}`,   // gang page + campaign page + leaderboards
FIGHTER_COST_SHARED: (id: string) => `fighter-cost-shared-${id}`, // fighter page + gang page
CAMPAIGN_GANG_LIST_SHARED: (id: string) => `campaign-gangs-shared-${id}`, // campaign page + member pages

// Global reference data
GANG_TYPES_LIST: () => `gang-types-global`,                       // gang type options
EQUIPMENT_CATALOG: () => `equipment-catalog-global`,              // equipment options
FIGHTER_TYPES_LIST: () => `fighter-types-global`,                 // fighter type options
```

## Server Function Analysis

### Functions Requiring Deconstruction

#### 1. `getGangDetails()` - Already Well Structured ✅
**Current State:** Well-architected with helper functions
**Cache Tags Used:** `GANG_OVERVIEW`, `GANG_CREDITS`, `GANG_RATING`, `GANG_FIGHTERS_LIST`
**Recommendation:** Keep as-is, serve as reference implementation

#### 2. `getCompleteFighterData()` - Needs Minor Optimization 🔄
**Current State:** Good separation, room for improvement
**Issues:** 
- Could separate basic fighter data from computed totals
- Beast cost calculation could be cached separately

**Recommended Deconstruction:**
```typescript
// Separate these functions
getFighterBasicData(fighterId: string)    // Basic stats, info - cache: FIGHTER_BASIC
getFighterEquipmentData(fighterId: string) // Equipment list - cache: FIGHTER_EQUIPMENT  
getFighterComputedCosts(fighterId: string) // Total costs - cache: FIGHTER_TOTAL_COST
getFighterOwnedBeasts(fighterId: string)   // Beast ownership - cache: FIGHTER_BEAST_COSTS
```

#### 3. Campaign Data Functions - Need Creation 🆕
**Current State:** No centralized campaign data functions
**Required Functions:**

```typescript
// New functions to create
getCampaignBasicData(campaignId: string)     // Settings, name - cache: CAMPAIGN_BASIC
getCampaignMembersData(campaignId: string)   // Gang memberships - cache: CAMPAIGN_MEMBERS  
getCampaignTerritoriesData(campaignId: string) // Territory control - cache: CAMPAIGN_TERRITORIES
getCampaignLeaderboard(campaignId: string)   // Gang rankings - cache: CAMPAIGN_LEADERBOARD

// Composite function
getCampaignOverview(campaignId: string)      // All campaign data - cache: CAMPAIGN_OVERVIEW
```

#### 4. User Data Functions - Need Creation 🆕
**Current State:** User data scattered across different queries
**Required Functions:**

```typescript
// New user-scoped functions
getUserGangsData(userId: string)             // User's gangs - cache: USER_GANGS
getUserCampaignsData(userId: string)         // User's campaigns - cache: USER_CAMPAIGNS
getUserCustomizations(userId: string)        // Custom content - cache: USER_CUSTOMIZATIONS
getUserDashboardData(userId: string)         // Home page data - cache: USER_DASHBOARD
```

#### 5. Shared Data Functions - Need Creation 🆕
**Current State:** Same data calculated multiple times in different places
**Required Functions:**

```typescript
// Cross-page shared calculations
getSharedGangRating(gangId: string)          // Used by gang page, campaigns, leaderboards
getSharedFighterCost(fighterId: string)      // Used by fighter page, gang page
getSharedCampaignGangsList(campaignId: string) // Used by campaign page, member pages
```

### Data Access Pattern Recommendations

#### Before (Monolithic):
```typescript
// ❌ Everything fetched together, any change invalidates all
getGangWithEverything(gangId: string) {
  // Basic info + fighters + stash + campaigns + rating + vehicles
  // Problem: Equipment purchase invalidates ALL of this
}
```

#### After (Granular):
```typescript
// ✅ Separate concerns, surgical invalidation
getGangBasicInfo(gangId: string)     // Only invalidated by gang setting changes
getGangCredits(gangId: string)       // Only invalidated by credit changes
getGangFightersList(gangId: string)  // Only invalidated by fighter changes
getGangRating(gangId: string)        // Only invalidated by fighter cost changes
getGangStash(gangId: string)         // Only invalidated by stash changes
```

## Cache Invalidation Patterns

### 1. Equipment Purchase Pattern
**Trigger:** User buys equipment for fighter
**Data Changed:** Fighter equipment, gang credits, gang rating, fighter cost

```typescript
export function invalidateEquipmentPurchase(params: {
  fighterId: string;
  gangId: string;
  createdBeasts?: Array<{ id: string }>;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.FIGHTER_EQUIPMENT(params.fighterId));
  revalidateTag(CACHE_TAGS.GANG_CREDITS(params.gangId));
  
  // Computed data changes  
  revalidateTag(CACHE_TAGS.FIGHTER_TOTAL_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.GANG_RATING(params.gangId));
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.GANG_RATING_SHARED(params.gangId));
  revalidateTag(CACHE_TAGS.FIGHTER_COST_SHARED(params.fighterId));
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(params.gangId));
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(params.fighterId));
  
  // Beast creation handling
  if (params.createdBeasts?.length) {
    params.createdBeasts.forEach(beast => {
      revalidateTag(CACHE_TAGS.FIGHTER_BASIC(beast.id));
      revalidateTag(CACHE_TAGS.FIGHTER_PAGE(beast.id));
    });
    revalidateTag(CACHE_TAGS.FIGHTER_BEAST_COSTS(params.fighterId));
    revalidateTag(CACHE_TAGS.GANG_FIGHTER_COUNT(params.gangId));
  }
}
```

### 2. Fighter Advancement Pattern
**Trigger:** Fighter gains skill/effect/injury
**Data Changed:** Fighter skills/effects, fighter cost, gang rating

```typescript
export function invalidateFighterAdvancement(params: {
  fighterId: string;
  gangId: string;
  advancementType: 'skill' | 'effect' | 'injury' | 'stat';
}) {
  // Base data changes
  switch (params.advancementType) {
    case 'skill':
      revalidateTag(CACHE_TAGS.FIGHTER_SKILLS(params.fighterId));
      break;
    case 'effect':
    case 'injury':
      revalidateTag(CACHE_TAGS.FIGHTER_EFFECTS(params.fighterId));
      break;
    case 'stat':
      revalidateTag(CACHE_TAGS.FIGHTER_BASIC(params.fighterId));
      break;
  }
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.FIGHTER_TOTAL_COST(params.fighterId));
  revalidateTag(CACHE_TAGS.GANG_RATING(params.gangId));
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.GANG_RATING_SHARED(params.gangId));
  revalidateTag(CACHE_TAGS.FIGHTER_COST_SHARED(params.fighterId));
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.FIGHTER_PAGE(params.fighterId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.gangId));
  revalidateTag(CACHE_TAGS.GANG_FIGHTERS_LIST(params.gangId));
}
```

### 3. Campaign Membership Pattern  
**Trigger:** Gang joins/leaves campaign
**Data Changed:** Campaign members, gang campaigns

```typescript
export function invalidateCampaignMembership(params: {
  campaignId: string;
  gangId: string;
  action: 'join' | 'leave' | 'role_change';
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.CAMPAIGN_MEMBERS(params.campaignId));
  revalidateTag(CACHE_TAGS.GANG_CAMPAIGNS(params.gangId));
  
  // Computed data changes
  revalidateTag(CACHE_TAGS.CAMPAIGN_LEADERBOARD(params.campaignId));
  
  // Shared data changes
  revalidateTag(CACHE_TAGS.CAMPAIGN_GANG_LIST_SHARED(params.campaignId));
  
  // Composite data changes
  revalidateTag(CACHE_TAGS.CAMPAIGN_OVERVIEW(params.campaignId));
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.gangId));
  
  // User-scoped changes
  const gangOwnerId = await getGangOwnerId(params.gangId);
  revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(gangOwnerId));
}
```

### 4. Gang Creation Pattern
**Trigger:** User creates new gang
**Data Changed:** User gangs, user dashboard

```typescript
export function invalidateGangCreation(params: {
  gangId: string;
  userId: string;
}) {
  // Base data changes
  revalidateTag(CACHE_TAGS.GANG_BASIC(params.gangId));
  revalidateTag(CACHE_TAGS.GANG_CREDITS(params.gangId));
  revalidateTag(CACHE_TAGS.GANG_RESOURCES(params.gangId));
  
  // User-scoped changes
  revalidateTag(CACHE_TAGS.USER_GANGS(params.userId));
  revalidateTag(CACHE_TAGS.USER_DASHBOARD(params.userId));
  
  // Composite data (new gang page)
  revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.gangId));
}
```

## Implementation Guidelines

### 1. Cache Tag Naming Conventions

```typescript
// Pattern: ENTITY_SCOPE_IDENTIFIER
GANG_BASIC         // Base entity data
GANG_RATING        // Computed entity data  
GANG_OVERVIEW      // Composite entity data
USER_GANGS         // User-scoped data
GANG_RATING_SHARED // Shared cross-page data

// Always include ID in tag generation
CACHE_TAGS.GANG_BASIC(gangId)           // ✅ Good
`gang-basic-${gangId}`                  // ✅ Good  
`gang-basic`                           // ❌ Bad - no ID
```

### 2. Invalidation Function Patterns

```typescript
// ✅ Good: Specific, focused invalidation
export function invalidateEquipmentPurchase(params: {...}) {
  // Clear documentation of what changes and why
  revalidateTag(CACHE_TAGS.FIGHTER_EQUIPMENT(params.fighterId)); // Equipment list changed
  revalidateTag(CACHE_TAGS.GANG_CREDITS(params.gangId));         // Credits spent
  // ... etc
}

// ❌ Bad: Generic, unclear invalidation
export function invalidateStuff(id: string) {
  revalidateTag(`everything-${id}`);
}
```

### 3. Server Function Architecture

```typescript
// ✅ Good: Granular, cacheable functions
export const getGangCredits = async (gangId: string) => {
  return unstable_cache(
    async () => {
      // Fetch only credits
    },
    [`gang-credits-${gangId}`],
    { tags: [CACHE_TAGS.GANG_CREDITS(gangId)] }
  )();
};

// ❌ Bad: Monolithic, over-cached function
export const getEverything = async (id: string) => {
  return unstable_cache(
    async () => {
      // Fetch everything at once
    },
    [`everything-${id}`],
    { tags: [`everything-${id}`] }
  )();
};
```

### 4. Shared Data Strategy

```typescript
// ✅ Good: Same data, same cache tags everywhere
// In gang page component:
const gangRating = await getSharedGangRating(gangId); 
// Uses cache tag: GANG_RATING_SHARED(gangId)

// In campaign page component:
const gangRating = await getSharedGangRating(gangId);
// Uses same cache tag: GANG_RATING_SHARED(gangId)

// When gang rating changes, both pages update automatically
```

## Migration Strategy

### Phase 1: Establish Enhanced Cache Tag System
**Week 1 - Foundation**

1. **Extend utils/cache-tags.ts**
   - Add all taxonomy categories (base, computed, composite, user-scoped, shared)
   - Add specialized invalidation functions
   - Add architectural documentation

2. **Create New Server Functions**
   - Campaign data functions
   - User-scoped data functions  
   - Shared data functions

### Phase 2: Eliminate revalidatePath Usage
**Week 2 - Critical Path**

1. **High-Impact Actions** (immediate 60% improvement)
   - `app/actions/add-fighter.ts`: Replace with `invalidateGangCreation()`
   - `app/actions/move-from-stash.ts`: Replace with `invalidateEquipmentTransfer()`
   - `app/actions/chem-alchemy.ts`: Replace with `invalidateGangStash()`

2. **Campaign Actions** (20% improvement)
   - All `app/actions/campaigns/[id]/*`: Remove redundant `revalidatePath()`
   - Use new campaign-specific invalidation functions

3. **Utility Actions** (10% improvement)
   - `app/actions/sell-equipment.ts`
   - `app/actions/fighter-injury.ts`
   - `app/actions/customise/*`

### Phase 3: Optimize Data Fetching
**Week 3 - Refinement**

1. **Implement Shared Data Functions**
   - Gang rating calculations
   - Fighter cost calculations
   - Campaign gang lists

2. **User-Scoped Caching**
   - User dashboard data
   - User gang lists
   - User customizations

### Phase 4: Testing & Validation
**Week 4 - Verification**

1. **Function Count Monitoring**
   - Before/after metrics for each action
   - Cache hit rate analysis
   - Page performance testing

2. **Edge Case Testing**
   - Concurrent user operations
   - Large gang operations
   - Campaign membership changes

## Testing & Validation

### 1. Unit Testing Cache Invalidation

```typescript
// Test invalidation functions
describe('invalidateEquipmentPurchase', () => {
  it('invalidates correct cache tags', async () => {
    const mockRevalidateTag = jest.fn();
    
    invalidateEquipmentPurchase({
      fighterId: 'fighter-1',
      gangId: 'gang-1'
    });
    
    expect(mockRevalidateTag).toHaveBeenCalledWith('fighter-equipment-fighter-1');
    expect(mockRevalidateTag).toHaveBeenCalledWith('gang-credits-gang-1');
    expect(mockRevalidateTag).toHaveBeenCalledWith('gang-rating-gang-1');
    // ... etc
  });
});
```

### 2. Integration Testing

```typescript
// Test complete workflows
describe('Equipment Purchase Flow', () => {
  it('updates all dependent pages correctly', async () => {
    // Purchase equipment
    await buyEquipmentForFighter({...});
    
    // Verify gang page shows updated credits
    const gangData = await getGangDetails(gangId);
    expect(gangData.credits).toBe(expectedCredits);
    
    // Verify fighter page shows new equipment
    const fighterData = await getCompleteFighterData(fighterId);
    expect(fighterData.equipment).toContainEqual(expectedEquipment);
    
    // Verify campaign page shows updated gang rating
    const campaignData = await getCampaignOverview(campaignId);
    expect(campaignData.gangs.find(g => g.id === gangId).rating).toBe(expectedRating);
  });
});
```

### 3. Performance Monitoring

```typescript
// Function invocation tracking
const trackCacheOperations = () => {
  let invocationCount = 0;
  
  const originalCache = unstable_cache;
  unstable_cache = (...args) => {
    invocationCount++;
    return originalCache(...args);
  };
  
  return () => invocationCount;
};

// Usage in tests
const getInvocationCount = trackCacheOperations();
await performEquipmentPurchase();
const invocations = getInvocationCount();
expect(invocations).toBeLessThan(5); // Target: <5 invocations per purchase
```

### 4. Cache Consistency Validation

```typescript
// Verify shared data consistency
describe('Shared Data Consistency', () => {
  it('gang rating is consistent across pages', async () => {
    // Get gang rating from different sources
    const gangPageRating = await getSharedGangRating(gangId);
    const campaignPageRating = await getCampaignGangRating(campaignId, gangId);
    const leaderboardRating = await getLeaderboardGangRating(gangId);
    
    // All should be identical (same cache)
    expect(gangPageRating).toBe(campaignPageRating);
    expect(campaignPageRating).toBe(leaderboardRating);
  });
});
```

## Success Metrics

### Quantitative Targets
- **Equipment purchases**: 50-100 → 3-5 function invocations (90-95% reduction)
- **Fighter additions**: 30-50 → 5-10 function invocations (70-85% reduction)
- **Campaign operations**: 20-40 → 3-8 function invocations (75-90% reduction)
- **Overall application**: 75-85% reduction in total function invocations

### Qualitative Improvements
- **Surgical Invalidation**: Only affected data updates, unrelated data stays cached
- **Cross-Page Consistency**: Shared data automatically updates across all pages
- **User Experience**: Faster page loads, immediate UI updates
- **Developer Experience**: Clear invalidation patterns, predictable cache behavior

---

This implementation guide provides a comprehensive foundation for building a highly efficient, granular cache system that will significantly reduce function invocations while maintaining data consistency and improving user experience.