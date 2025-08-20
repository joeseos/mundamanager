# TanStack Query Implementation Guide

## Overview
Implementation plan for integrating TanStack Query with proper Data Access Layer architecture following TanStack best practices and community standards.

## Phase 1: Foundation Setup

### Step 1.1: Install Dependencies
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### Step 1.2: Create Query Provider
**File: `lib/providers/query-provider.tsx`**
```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**File: `lib/providers/index.ts`**
```tsx
export { QueryProvider } from './query-provider';
```

### Step 1.3: Update Root Layout
**File: `app/layout.tsx`**
```tsx
import { QueryProvider } from '@/lib/providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {/* Your existing providers */}
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
```

## Phase 2: Create Base Architecture

### Step 2.1: Query Keys Factory (Improved Architecture)
**File: `lib/queries/keys.ts`**
```tsx
export const queryKeys = {
  // =============================================================================
  // FIGHTERS - Granular with clear hierarchy
  // =============================================================================
  fighters: {
    all: ['fighters'] as const,
    lists: () => [...queryKeys.fighters.all, 'list'] as const,
    list: (gangId: string) => [...queryKeys.fighters.lists(), { gangId }] as const,
    details: () => [...queryKeys.fighters.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.fighters.details(), id] as const,
    
    // Specific fighter data (enables granular invalidation)
    equipment: (id: string) => [...queryKeys.fighters.detail(id), 'equipment'] as const,
    skills: (id: string) => [...queryKeys.fighters.detail(id), 'skills'] as const,
    effects: (id: string) => [...queryKeys.fighters.detail(id), 'effects'] as const,
    vehicles: (id: string) => [...queryKeys.fighters.detail(id), 'vehicles'] as const,
    
    // Computed values (separate caching, easy invalidation)
    totalCost: (id: string) => [...queryKeys.fighters.detail(id), 'total-cost'] as const,
    beastCosts: (id: string) => [...queryKeys.fighters.detail(id), 'beast-costs'] as const,
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
} as const;
```

### Step 2.2: API Service Layer
**File: `lib/api/fighters.ts`**
```tsx
import { createClient } from '@/utils/supabase/client';
import { 
  getFighterBasic, 
  getFighterEquipment, 
  getFighterSkills,
  getFighterEffects,
  getFighterVehicles,
  getFighterTotalCost 
} from '@/app/lib/shared/fighter-data';

export const fightersApi = {
  getBasic: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterBasic(fighterId, supabase);
  },
  
  getEquipment: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterEquipment(fighterId, supabase);
  },
  
  getSkills: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterSkills(fighterId, supabase);
  },
  
  getEffects: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterEffects(fighterId, supabase);
  },
  
  getVehicles: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterVehicles(fighterId, supabase);
  },
  
  getTotalCost: async (fighterId: string) => {
    const supabase = createClient();
    return getFighterTotalCost(fighterId, supabase);
  },
};
```

## Phase 3: Fighter Page Implementation

### Step 3.1: Fighter Query Hooks
**File: `lib/queries/fighters.ts`**
```tsx
import { useQuery } from '@tanstack/react-query';
import { fightersApi } from '@/lib/api/fighters';
import { queryKeys } from './keys';

export const useGetFighter = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.detail(fighterId),
    queryFn: () => fightersApi.getBasic(fighterId),
    enabled: !!fighterId,
  });
};

export const useGetFighterEquipment = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.equipment(fighterId),
    queryFn: () => fightersApi.getEquipment(fighterId),
    enabled: !!fighterId,
    staleTime: 1000 * 60 * 2, // 2 minutes (equipment changes frequently)
  });
};

export const useGetFighterSkills = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.skills(fighterId),
    queryFn: () => fightersApi.getSkills(fighterId),
    enabled: !!fighterId,
  });
};

export const useGetFighterEffects = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.effects(fighterId),
    queryFn: () => fightersApi.getEffects(fighterId),
    enabled: !!fighterId,
  });
};

export const useGetFighterVehicles = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.vehicles(fighterId),
    queryFn: () => fightersApi.getVehicles(fighterId),
    enabled: !!fighterId,
  });
};

export const useGetFighterTotalCost = (fighterId: string) => {
  return useQuery({
    queryKey: queryKeys.fighters.totalCost(fighterId),
    queryFn: () => fightersApi.getTotalCost(fighterId),
    enabled: !!fighterId,
  });
};
```

### Step 3.2: Convert Fighter Page Component
**Update: `components/fighter/fighter-page.tsx`**
```tsx
'use client';

import { 
  useGetFighter, 
  useGetFighterEquipment, 
  useGetFighterSkills,
  useGetFighterEffects,
  useGetFighterVehicles,
  useGetFighterTotalCost
} from '@/lib/queries/fighters';

interface FighterPageProps {
  fighterId: string;
  // ... other props
}

export default function FighterPageComponent({ fighterId, ...otherProps }: FighterPageProps) {
  const { data: fighterBasic, isLoading: basicLoading, error: basicError } = useGetFighter(fighterId);
  const { data: equipment, isLoading: equipmentLoading } = useGetFighterEquipment(fighterId);
  const { data: skills, isLoading: skillsLoading } = useGetFighterSkills(fighterId);
  const { data: effects, isLoading: effectsLoading } = useGetFighterEffects(fighterId);
  const { data: vehicles, isLoading: vehiclesLoading } = useGetFighterVehicles(fighterId);
  const { data: totalCost, isLoading: costLoading } = useGetFighterTotalCost(fighterId);
  
  // Handle loading states
  if (basicLoading) {
    return <div>Loading fighter data...</div>;
  }
  
  // Handle error states
  if (basicError) {
    return <div>Error loading fighter: {basicError.message}</div>;
  }
  
  // Handle missing data
  if (!fighterBasic) {
    return <div>Fighter not found</div>;
  }
  
  return (
    <div>
      {/* Render fighter data */}
      <h1>{fighterBasic.fighter_name}</h1>
      
      {/* Equipment section with loading state */}
      <div>
        <h2>Equipment</h2>
        {equipmentLoading ? (
          <div>Loading equipment...</div>
        ) : (
          equipment?.map(item => (
            <div key={item.fighter_equipment_id}>
              {item.equipment_name}
            </div>
          ))
        )}
      </div>
      
      {/* Skills section */}
      <div>
        <h2>Skills</h2>
        {skillsLoading ? (
          <div>Loading skills...</div>
        ) : (
          Object.entries(skills || {}).map(([skillName, skill]) => (
            <div key={skill.id}>
              {skillName}
            </div>
          ))
        )}
      </div>
      
      {/* Total cost display */}
      <div>
        <strong>Total Cost: {costLoading ? 'Calculating...' : totalCost}</strong>
      </div>
    </div>
  );
}
```

### Step 3.3: Update Fighter Page Server Component
**Update: `app/fighter/[id]/page.tsx`**
```tsx
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Check if fighter exists (minimal server-side check)
  const { data: fighterExists } = await supabase
    .from('fighters')
    .select('id, gang_id')
    .eq('id', id)
    .single();

  if (!fighterExists) {
    redirect("/");
  }

  // Get permissions
  const permissionService = new PermissionService();
  const permissions = await permissionService.getFighterPermissions(user.id, id);

  if (!permissions?.canView) {
    redirect("/");
  }

  return (
    <FighterPageComponent 
      fighterId={id}
      userId={user.id}
      permissions={permissions}
    />
  );
}
```

## Phase 4: Smart Invalidation System

### Step 4.1: Invalidation Manager
**File: `lib/mutations/invalidation.ts`**
```tsx
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries/keys';

export class InvalidationManager {
  constructor(private queryClient: QueryClient) {}
  
  // Equipment purchase - handles ALL related invalidations automatically
  equipmentPurchase(params: { fighterId: string; gangId: string; equipmentId: string }) {
    const { fighterId, gangId } = params;
    
    // Base data changes
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.fighters.equipment(fighterId) 
    });
    
    // Computed changes (cascade automatically)
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.fighters.totalCost(fighterId) 
    });
    
    // Gang changes (rating depends on fighter costs)
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.credits(gangId) 
    });
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.rating(gangId) 
    });
    
    // List views that show this data
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.fighters(gangId) 
    });
  }
  
  // Fighter advancement - type-specific invalidation
  fighterAdvancement(params: { 
    fighterId: string; 
    gangId: string; 
    type: 'skill' | 'effect' | 'stat' 
  }) {
    const { fighterId, gangId, type } = params;
    
    // Specific data type changes
    switch (type) {
      case 'skill':
        this.queryClient.invalidateQueries({ 
          queryKey: queryKeys.fighters.skills(fighterId) 
        });
        break;
      case 'effect':
        this.queryClient.invalidateQueries({ 
          queryKey: queryKeys.fighters.effects(fighterId) 
        });
        break;
      case 'stat':
        this.queryClient.invalidateQueries({ 
          queryKey: queryKeys.fighters.detail(fighterId) 
        });
        break;
    }
    
    // Always invalidate computed values
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.fighters.totalCost(fighterId) 
    });
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.rating(gangId) 
    });
    
    // Update list views
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.fighters(gangId) 
    });
  }
  
  // Pattern matching invalidation for complex scenarios
  invalidateAllFighterData(fighterId: string) {
    this.queryClient.invalidateQueries({ 
      predicate: (query) => {
        return query.queryKey.includes('fighters') && 
               query.queryKey.includes(fighterId);
      }
    });
  }
  
  // Gang-wide invalidation
  invalidateGangData(gangId: string) {
    this.queryClient.invalidateQueries({ 
      queryKey: queryKeys.gangs.detail(gangId)
    });
  }
}
```

### Step 4.2: Equipment Mutation Hooks with Smart Invalidation
**File: `lib/mutations/fighters.ts`**
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries/keys';
import { InvalidationManager } from './invalidation';

interface AddEquipmentData {
  fighterId: string;
  equipmentId: string;
  gangId: string;
  // ... other fields
}

export const useAddFighterEquipment = () => {
  const queryClient = useQueryClient();
  const invalidation = new InvalidationManager(queryClient);
  
  return useMutation({
    mutationFn: async (data: AddEquipmentData) => {
      // Call your existing server action
      const result = await addEquipmentServerAction(data);
      return result;
    },
    
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.fighters.equipment(variables.fighterId) 
      });
      
      // Snapshot current data for rollback
      const previousEquipment = queryClient.getQueryData(
        queryKeys.fighters.equipment(variables.fighterId)
      );
      
      // Optimistic update
      queryClient.setQueryData(
        queryKeys.fighters.equipment(variables.fighterId),
        (old: any[]) => [...(old || []), {
          fighter_equipment_id: `temp-${Date.now()}`,
          equipment_name: 'Adding...',
          ...variables
        }]
      );
      
      return { previousEquipment };
    },
    
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousEquipment) {
        queryClient.setQueryData(
          queryKeys.fighters.equipment(variables.fighterId),
          context.previousEquipment
        );
      }
    },
    
    onSuccess: (data, variables) => {
      // Use smart invalidation manager - handles ALL related updates
      invalidation.equipmentPurchase({
        fighterId: variables.fighterId,
        gangId: variables.gangId,
        equipmentId: variables.equipmentId
      });
    },
  });
};
```

## Phase 5: Testing & Validation

### Step 5.1: Test Fighter Page
1. Navigate to `/fighter/[id]`
2. Verify data loads correctly
3. Check React Query DevTools for query status
4. Test loading states
5. Test error handling

### Step 5.2: Test Mutations (when implemented)
1. Add equipment to fighter
2. Verify optimistic updates
3. Check data consistency after mutation
4. Test error rollback scenarios

## Phase 6: Expand to Gang Features

### Step 6.1: Gang API Layer
**File: `lib/api/gangs.ts`**
```tsx
import { createClient } from '@/utils/supabase/client';
import { 
  getGangBasic, 
  getGangCredits, 
  getGangStash,
  getGangFightersList
} from '@/app/lib/shared/gang-data';

export const gangsApi = {
  getBasic: async (gangId: string) => {
    const supabase = createClient();
    return getGangBasic(gangId, supabase);
  },
  
  getCredits: async (gangId: string) => {
    const supabase = createClient();
    return getGangCredits(gangId, supabase);
  },
  
  getStash: async (gangId: string) => {
    const supabase = createClient();
    return getGangStash(gangId, supabase);
  },
  
  getFighters: async (gangId: string) => {
    const supabase = createClient();
    return getGangFightersList(gangId, supabase);
  },
};
```

### Step 6.2: Gang Query Hooks
**File: `lib/queries/gangs.ts`**
```tsx
import { useQuery } from '@tanstack/react-query';
import { gangsApi } from '@/lib/api/gangs';
import { queryKeys } from './keys';

export const useGetGang = (gangId: string) => {
  return useQuery({
    queryKey: queryKeys.gangs.detail(gangId),
    queryFn: () => gangsApi.getBasic(gangId),
    enabled: !!gangId,
  });
};

export const useGetGangCredits = (gangId: string) => {
  return useQuery({
    queryKey: queryKeys.gangs.credits(gangId),
    queryFn: () => gangsApi.getCredits(gangId),
    enabled: !!gangId,
    staleTime: 1000 * 60 * 1, // 1 minute (credits change frequently)
  });
};

export const useGetGangStash = (gangId: string) => {
  return useQuery({
    queryKey: queryKeys.gangs.stash(gangId),
    queryFn: () => gangsApi.getStash(gangId),
    enabled: !!gangId,
  });
};

export const useGetGangFighters = (gangId: string) => {
  return useQuery({
    queryKey: queryKeys.gangs.fighters(gangId),
    queryFn: () => gangsApi.getFighters(gangId),
    enabled: !!gangId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
```

## Key Improvements Over Current Cache System

### Problems Solved:
1. **Missing Invalidations** - Centralized `InvalidationManager` prevents forgotten cache updates
2. **Over/Under Invalidation** - Granular keys only invalidate what actually changed
3. **Key Mismatches** - Consistent string-based IDs and hierarchical structure
4. **Complex Dependencies** - Smart invalidation patterns handle relationships automatically
5. **Manual Maintenance** - Built-in invalidation patterns reduce cognitive load

### Architecture Benefits:
- **Granular Control**: Invalidate `fighters.equipment(id)` vs `fighters.detail(id)` vs all fighter data
- **Automatic Relationships**: Equipment changes properly cascade to fighter cost and gang rating
- **Type Safety**: TypeScript autocomplete for all cache keys
- **Performance**: Separate caching for computed vs base data prevents unnecessary work
- **Developer Experience**: Clear patterns, easy debugging with DevTools

### Example Key Structure:
```tsx
// Generated cache keys:
queryKeys.fighters.detail('123')         // ['fighters', 'detail', '123']
queryKeys.fighters.equipment('123')      // ['fighters', 'detail', '123', 'equipment'] 
queryKeys.fighters.totalCost('123')      // ['fighters', 'detail', '123', 'total-cost']
queryKeys.gangs.fighters('456')          // ['gangs', 'detail', '456', 'fighters']

// Invalidation examples:
invalidation.equipmentPurchase({ fighterId: '123', gangId: '456', equipmentId: '789' })
// ↳ Automatically invalidates: fighter equipment, fighter cost, gang credits, gang rating, gang fighter list

// Granular invalidation:
queryClient.invalidateQueries({ queryKey: ['fighters', 'detail', '123', 'equipment'] })
// ↳ Only invalidates fighter equipment, not skills/effects

// Pattern matching:
queryClient.invalidateQueries({ predicate: query => 
  query.queryKey.includes('fighters') && query.queryKey.includes('123') 
})
// ↳ Invalidates all data related to fighter 123
```

## Migration Notes

### Coexistence Strategy
- TanStack Query queries will run alongside existing `unstable_cache` functions
- Both systems will work together during migration
- `InvalidationManager` can be extended to also invalidate `unstable_cache` tags during transition
- Gradually replace server-side caching with client-side queries
- Keep server actions for mutations initially, transition to API routes later

### Performance Considerations
- Set appropriate `staleTime` values based on data volatility:
  - Equipment/Skills: 2-5 minutes (changes frequently)
  - Fighter basic info: 5-10 minutes (changes less frequently)  
  - Reference data: 1 hour (rarely changes)
- Use `enabled` flags to prevent unnecessary requests
- Implement proper loading and error states
- Consider using `suspense: true` for critical data

### Error Handling
- Implement global error boundaries for query errors
- Set up retry policies for transient failures
- Add proper error messages for user-facing errors
- Log errors for debugging and monitoring
- Handle optimistic update rollbacks gracefully

## Phase 7: Server-Side Rendering (SSR) Implementation

### Step 7.1: SSR Strategy Overview
Implement SSR for fast first paint while maintaining client-side optimistic updates:

**Architecture:**
- **Server Component**: Fetch initial data server-side in `/app/fighter/[id]/page.tsx`
- **Client Component**: Hydrate TanStack Query cache with server data
- **Progressive Enhancement**: Client-side optimistic updates work seamlessly

### Step 7.2: Initial Data Interface
**File: `lib/types/initial-data.ts`**
```tsx
export interface InitialFighterData {
  fighter: {
    id: string;
    fighter_name: string;
    fighter_type_id: string;
    gang_id: string;
    credits: number;
    xp: number;
    total_xp: number;
    // ... other fighter fields
  };
  gang: {
    id: string;
    credits: number;
    gang_type_id: string;
    gang_affiliation_id?: string | null;
    // ... other gang fields
  };
  equipment: Equipment[];
  skills: FighterSkills;
  effects: FighterEffects;
  vehicles: Vehicle[];
  totalCost: number;
}
```

### Step 7.3: Enhanced Server Component
**Update: `app/fighter/[id]/page.tsx`**
```tsx
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import { 
  getFighterBasic, 
  getFighterEquipment, 
  getFighterSkills,
  getFighterEffects,
  getFighterVehicles,
  getFighterTotalCost 
} from "@/app/lib/shared/fighter-data";
import { getGangBasic, getGangCredits } from "@/app/lib/shared/gang-data";
import { InitialFighterData } from "@/lib/types/initial-data";

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Check if fighter exists and get basic info
  const { data: fighterExists } = await supabase
    .from('fighters')
    .select('id, gang_id')
    .eq('id', id)
    .single();

  if (!fighterExists) {
    redirect("/");
  }

  // Get permissions
  const permissionService = new PermissionService();
  const userPermissions = await permissionService.getFighterPermissions(user.id, id);

  if (!userPermissions?.canView) {
    redirect("/");
  }

  // Fetch all initial data in parallel for fast SSR
  try {
    const [
      fighter,
      gang,
      equipment,
      skills,
      effects,
      vehicles,
      totalCost,
      gangCredits
    ] = await Promise.all([
      getFighterBasic(id, supabase),
      getGangBasic(fighterExists.gang_id, supabase),
      getFighterEquipment(id, supabase),
      getFighterSkills(id, supabase),
      getFighterEffects(id, supabase),
      getFighterVehicles(id, supabase),
      getFighterTotalCost(id, supabase),
      getGangCredits(fighterExists.gang_id, supabase)
    ]);

    const initialData: InitialFighterData = {
      fighter,
      gang: { ...gang, credits: gangCredits },
      equipment: equipment || [],
      skills: skills || {},
      effects: effects || {
        injuries: [],
        advancements: [],
        bionics: [],
        cyberteknika: [],
        'gene-smithing': [],
        'rig-glitches': [],
        augmentations: [],
        equipment: [],
        user: []
      },
      vehicles: vehicles || [],
      totalCost: totalCost || fighter.credits
    };

    return (
      <FighterPageComponent 
        fighterId={id}
        userId={user.id}
        userPermissions={userPermissions}
        initialData={initialData}
      />
    );
  } catch (error) {
    console.error('Error fetching initial fighter data:', error);
    redirect("/");
  }
}
```

### Step 7.4: Updated Client Component with Hydration
**Update: `components/fighter/fighter-page.tsx`**
```tsx
import { InitialFighterData } from '@/lib/types/initial-data';

interface FighterPageProps {
  fighterId: string;
  userId: string;
  userPermissions: UserPermissions;
  initialData?: InitialFighterData; // NEW: Optional server-side data
}

export default function FighterPage({ 
  fighterId,
  userId,
  userPermissions,
  initialData // NEW
}: FighterPageProps) {
  // TanStack Query hooks with initialData from SSR
  const { data: fighterBasic, isLoading: fighterLoading, error: fighterError } = useGetFighter(
    fighterId, 
    { initialData: initialData?.fighter } // Hydrate with SSR data
  );
  
  const { data: equipment, isLoading: equipmentLoading } = useGetFighterEquipment(
    fighterId,
    { initialData: initialData?.equipment }
  );
  
  const { data: skills, isLoading: skillsLoading } = useGetFighterSkills(
    fighterId,
    { initialData: initialData?.skills }
  );
  
  const { data: effects, isLoading: effectsLoading } = useGetFighterEffects(
    fighterId,
    { initialData: initialData?.effects }
  );
  
  const { data: vehicles, isLoading: vehiclesLoading } = useGetFighterVehicles(
    fighterId,
    { initialData: initialData?.vehicles }
  );
  
  const { data: totalCost, isLoading: costLoading } = useGetFighterTotalCost(
    fighterId,
    { initialData: initialData?.totalCost }
  );

  // Gang data with SSR hydration
  const gangId = fighterBasic?.gang_id || initialData?.gang.id || 'placeholder';
  const { data: gang, isLoading: gangLoading } = useGetGang(
    gangId,
    { initialData: initialData?.gang }
  );
  
  const { data: gangCredits, isLoading: creditsLoading } = useGetGangCredits(
    gangId,
    { initialData: initialData?.gang.credits }
  );

  // Rest of component logic remains the same...
  // Loading states now only show during client-side updates
  // Initial render shows actual data from SSR
}
```

### Step 7.5: Update Query Hooks to Support initialData
**Update: `lib/queries/fighters.ts`**
```tsx
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export const useGetFighter = (
  fighterId: string, 
  options?: UseQueryOptions<any, Error, any, string[]>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.detail(fighterId),
    queryFn: () => fightersApi.getBasic(fighterId),
    enabled: !!fighterId,
    ...options // Allow initialData and other options to be passed
  });
};

export const useGetFighterEquipment = (
  fighterId: string,
  options?: UseQueryOptions<any[], Error, any[], string[]>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.equipment(fighterId),
    queryFn: () => fightersApi.getEquipment(fighterId),
    enabled: !!fighterId,
    staleTime: 1000 * 60 * 2,
    ...options
  });
};

// Similar updates for other hooks...
```

### Step 7.6: Benefits of SSR Implementation

**Performance:**
- **Instant First Paint**: HTML rendered with actual fighter data
- **Reduced Time to Content**: No loading spinners on initial page load
- **Better Core Web Vitals**: Improved LCP (Largest Contentful Paint)

**User Experience:**
- **Progressive Enhancement**: SSR data + client-side optimistic updates
- **SEO Friendly**: Server-rendered content for search engines
- **Offline Resilience**: Initial data available even if client hydration fails

**Developer Experience:**
- **Same Code**: TanStack Query hooks work seamlessly with or without initialData
- **Gradual Enhancement**: Can be implemented page by page
- **Debugging**: React Query DevTools still show cache state after hydration

### Step 7.7: Implementation Notes

**Hydration Strategy:**
- Server data is used as `initialData` for TanStack Query
- Client-side queries still run for fresh data (respecting staleTime)
- Optimistic updates work normally on hydrated data

**Error Handling:**
- Server-side errors redirect appropriately
- Client-side errors fallback to normal query error handling
- Hydration mismatches handled gracefully by React

**Performance Considerations:**
- Fetch only essential data server-side (avoid over-fetching)
- Use Promise.all() for parallel server-side data fetching
- Consider caching strategy for server-side data

## Next Steps After Implementation

1. **Monitor Performance**: Use React Query DevTools to monitor cache hits, loading times
2. **Add More Mutations**: Convert remaining server actions to TanStack mutations
3. **Optimize Queries**: Fine-tune stale times, cache times, and refetch intervals
4. **Background Sync**: Add background refetching for real-time data
5. **Offline Support**: Consider adding offline mutation queues
6. **Reduce Server Cache**: Gradually replace `unstable_cache` with client queries
7. **Expand SSR**: Apply SSR pattern to other critical pages (gang page, dashboard)

## Benefits Expected

- **Better UX**: Optimistic updates, instant loading states, fast first paint
- **Reduced Server Load**: Client-side caching reduces database hits  
- **Simplified Code**: Less boilerplate for loading/error states
- **Real-time Feel**: Background updates keep data fresh
- **Better Developer Experience**: React Query DevTools for debugging
- **SEO Benefits**: Server-rendered content for search engines
- **Performance**: Improved Core Web Vitals and perceived performance