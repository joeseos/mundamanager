export const queryKeys = {
  // =============================================================================
  // FIGHTERS - Granular with clear hierarchy
  // =============================================================================
  fighters: {
    all: ['fighters'] as const,
    lists: () => [...queryKeys.fighters.all, 'list'] as const,
    list: (gangId: string) => [...queryKeys.fighters.lists(), { gangId }] as const,
    
    // Fighter-specific data (fighter-id first, then data type)
    detail: (id: string) => ['fighters', id, 'detail'] as const,
    equipment: (id: string) => ['fighters', id, 'equipment'] as const,
    skills: (id: string) => ['fighters', id, 'skills'] as const,
    effects: (id: string) => ['fighters', id, 'effects'] as const,
    vehicles: (id: string) => ['fighters', id, 'vehicles'] as const,
    
    // Computed values (fighter-id first)
    totalCost: (id: string) => ['fighters', id, 'total-cost'] as const,
    beastCosts: (id: string) => ['fighters', id, 'beast-costs'] as const,
  },
  
  // =============================================================================
  // GANGS - Clear relationships and dependencies
  // =============================================================================
  gangs: {
    all: ['gangs'] as const,
    lists: () => [...queryKeys.gangs.all, 'list'] as const,
    list: (userId: string) => [...queryKeys.gangs.lists(), { userId }] as const,
    details: () => [...queryKeys.gangs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.gangs.details(), id] as const,
    
    // Gang specific data
    credits: (id: string) => [...queryKeys.gangs.detail(id), 'credits'] as const,
    resources: (id: string) => [...queryKeys.gangs.detail(id), 'resources'] as const,
    stash: (id: string) => [...queryKeys.gangs.detail(id), 'stash'] as const,
    positioning: (id: string) => [...queryKeys.gangs.detail(id), 'positioning'] as const,
    
    // Computed gang values
    rating: (id: string) => [...queryKeys.gangs.detail(id), 'rating'] as const,
    fighterCount: (id: string) => [...queryKeys.gangs.detail(id), 'fighter-count'] as const,
    beastCount: (id: string) => [...queryKeys.gangs.detail(id), 'beast-count'] as const,
    
    // Related data (different from gang detail)
    fighters: (id: string) => [...queryKeys.gangs.detail(id), 'fighters'] as const,
    campaigns: (id: string) => [...queryKeys.gangs.detail(id), 'campaigns'] as const,
    vehicles: (id: string) => [...queryKeys.gangs.detail(id), 'vehicles'] as const,
  },
  
  // =============================================================================
  // CAMPAIGNS - Multi-tenant aware
  // =============================================================================
  campaigns: {
    all: ['campaigns'] as const,
    lists: () => [...queryKeys.campaigns.all, 'list'] as const,
    list: (userId: string) => [...queryKeys.campaigns.lists(), { userId }] as const,
    details: () => [...queryKeys.campaigns.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.campaigns.details(), id] as const,
    
    // Campaign specific data
    members: (id: string) => [...queryKeys.campaigns.detail(id), 'members'] as const,
    territories: (id: string) => [...queryKeys.campaigns.detail(id), 'territories'] as const,
    battles: (id: string, filters?: object) => 
      [...queryKeys.campaigns.detail(id), 'battles', ...(filters ? [filters] : [])] as const,
    triumphs: (typeId: string) => [...queryKeys.campaigns.all, 'triumphs', typeId] as const,
  },
  
  // =============================================================================
  // REFERENCE DATA - Global cached data
  // =============================================================================
  reference: {
    gangTypes: () => ['reference', 'gang-types'] as const,
    fighterTypes: (gangTypeId?: string) => 
      ['reference', 'fighter-types', ...(gangTypeId ? [gangTypeId] : [])] as const,
    equipment: () => ['reference', 'equipment'] as const,
    territories: () => ['reference', 'territories'] as const,
    skills: () => ['reference', 'skills'] as const,
  },
  
  // =============================================================================
  // VEHICLES - Vehicle-specific data
  // =============================================================================
  vehicles: {
    all: ['vehicles'] as const,
    detail: (id: string) => ['vehicles', id] as const,
    equipment: (id: string) => ['vehicles', id, 'equipment'] as const,
    effects: (id: string) => ['vehicles', id, 'effects'] as const,
  },
} as const

// =============================================================================
// CACHE KEY UTILITIES - Convert arrays to strings for revalidateTag
// =============================================================================

/**
 * Convert TanStack Query key array to string for revalidateTag
 */
function keyToString(key: readonly (string | number | object)[]): string {
  return key
    .map(item => 
      typeof item === 'object' ? JSON.stringify(item) : String(item)
    )
    .join('.');
}

/**
 * String versions of query keys for revalidateTag compatibility
 * These are used by server-side invalidation functions
 */
export const cacheKeys = {
  fighters: {
    all: () => keyToString(queryKeys.fighters.all),
    detail: (id: string) => keyToString(queryKeys.fighters.detail(id)),
    equipment: (id: string) => keyToString(queryKeys.fighters.equipment(id)),
    skills: (id: string) => keyToString(queryKeys.fighters.skills(id)),
    effects: (id: string) => keyToString(queryKeys.fighters.effects(id)),
    vehicles: (id: string) => keyToString(queryKeys.fighters.vehicles(id)),
    totalCost: (id: string) => keyToString(queryKeys.fighters.totalCost(id)),
  },
  gangs: {
    all: () => keyToString(queryKeys.gangs.all),
    detail: (id: string) => keyToString(queryKeys.gangs.detail(id)),
    credits: (id: string) => keyToString(queryKeys.gangs.credits(id)),
    resources: (id: string) => keyToString(queryKeys.gangs.resources(id)),
    rating: (id: string) => keyToString(queryKeys.gangs.rating(id)),
    stash: (id: string) => keyToString(queryKeys.gangs.stash(id)),
    fighterCount: (id: string) => keyToString(queryKeys.gangs.fighterCount(id)),
  },
  vehicles: {
    detail: (id: string) => keyToString(queryKeys.vehicles.detail(id)),
    equipment: (id: string) => keyToString(queryKeys.vehicles.equipment(id)),
    effects: (id: string) => keyToString(queryKeys.vehicles.effects(id)),
  },
}