# Gang Rating Column Implementation Plan - REVISED

## Key Discovery
After analyzing the codebase, **the SQL functions in `/supabase/functions/` are NOT currently in use**. The server actions use direct SQL queries instead of RPC calls to these functions. This significantly simplifies our implementation.

## Updated Implementation Strategy

### Phase 1: Update TypeScript Server Actions Only
Since SQL functions aren't used, we only need to update the TypeScript server actions to maintain the gang rating column.

#### Priority Files to Update:

1. **`/app/actions/equipment.ts`** (buyEquipmentForFighter)
   - **Current**: Updates gang credits (line ~282) but not rating
   - **Add**: `UPDATE gangs SET rating = rating + ${ratingCost} WHERE id = ${gang_id}`
   - **Location**: After the gang credits update around line 283

2. **`/app/actions/add-fighter.ts`**
   - **Current**: Calculates `ratingCost` but doesn't update gang rating
   - **Add**: Gang rating update after fighter creation
   - **Implementation**: 
     ```typescript
     await supabase
       .from('gangs')
       .update({ rating: gang.rating + ratingCost })
       .eq('id', params.gang_id);
     ```

3. **`/app/actions/sell-equipment.ts`**
   - **Current**: Updates gang credits when selling
   - **Add**: Decrease gang rating by equipment value
   - **Implementation**: 
     ```typescript
     await supabase
       .from('gangs') 
       .update({ rating: Math.max(0, gang.rating - sellValue) })
       .eq('id', gangId);
     ```

4. **`/app/actions/move-from-stash.ts`**
   - **Logic**: Equipment in stash doesn't count toward rating, but on fighter it does
   - **Add**: Increase gang rating when equipment moves from stash to fighter

5. **`/app/actions/move-to-stash.ts`**
   - **Logic**: Equipment in stash doesn't count toward rating
   - **Add**: Decrease gang rating when equipment moves from fighter to stash

6. **`/app/actions/fighter-advancement.ts`**
   - **Add**: Rating updates when fighters advance (skills, stat increases)

7. **`/app/actions/edit-fighter.ts`**
   - **Add**: Rating recalculation if fighter costs change through direct editing

8. **`/app/actions/add-gang-vehicle.ts`**
   - **Add**: Increase gang rating by vehicle cost

### Phase 2: Simplify Gang Rating Calculation
Update `/app/lib/shared/gang-data.ts`:

```typescript
export const getGangRating = async (gangId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('rating')
        .eq('id', gangId)
        .single();
      
      if (error) throw error;
      return data.rating || 0;
    },
    [`gang-rating-${gangId}`],
    {
      tags: [
        CACHE_TAGS.COMPUTED_GANG_RATING(gangId),
        CACHE_TAGS.SHARED_GANG_RATING(gangId)
      ],
      revalidate: false
    }
  )();
};
```

### Phase 3: Re-enable Campaign Rating Display
Update `/app/lib/campaigns/[id]/get-campaign-data.ts`:
- **Current**: Lines 256-264 disable gang rating calculation with TODO
- **Action**: Replace the TODO section with actual getGangRating() calls
- **Implementation**:
  ```typescript
  for (const gangId of gangIds) {
    try {
      const rating = await getGangRating(gangId, supabase);
      gangRatings.set(gangId, rating);
    } catch (error) {
      console.error(`Error getting rating for gang ${gangId}:`, error);
      gangRatings.set(gangId, 0);
    }
  }
  ```

### Phase 4: Data Synchronization
Create a one-time sync to ensure existing gang ratings are accurate:

```sql
-- Sync all gang ratings based on current fighter costs
UPDATE gangs 
SET rating = (
  SELECT COALESCE(SUM(f.credits), 0)
  FROM fighters f
  WHERE f.gang_id = gangs.id
    AND f.killed = false
    AND f.retired = false
    AND f.enslaved = false
    AND f.fighter_class != 'exotic beast'
);
```

## Benefits of Revised Approach

1. **Much Simpler**: Only TypeScript changes, no complex SQL function modifications
2. **Consistent**: All operations follow the same pattern (direct SQL queries via Supabase client)
3. **Maintainable**: Server actions are easier to debug and modify than SQL functions
4. **Less Risk**: No changes to unused SQL functions that might break other functionality

## Files Summary

### Critical Updates (8 files):
- 🔧 `/app/actions/add-fighter.ts`
- 🔧 `/app/actions/equipment.ts` 
- 🔧 `/app/actions/sell-equipment.ts`
- 🔧 `/app/actions/move-from-stash.ts`
- 🔧 `/app/actions/move-to-stash.ts`
- 🔧 `/app/actions/fighter-advancement.ts`
- 🔧 `/app/actions/edit-fighter.ts`
- 🔧 `/app/actions/add-gang-vehicle.ts`

### Data Layer Updates (2 files):
- 🔧 `/app/lib/shared/gang-data.ts`
- 🔧 `/app/lib/campaigns/[id]/get-campaign-data.ts`

### SQL Functions Status:
- ℹ️ `/supabase/functions/buy_equipment_for_fighter.sql` - NOT USED, no changes needed
- ℹ️ `/supabase/functions/delete_fighter_and_equipment.sql` - NOT USED, no changes needed
- ℹ️ `/supabase/functions/delete_equipment_from_fighter.sql` - NOT USED, no changes needed

## Implementation Priority

1. **Data Sync** (ensure current ratings are correct)
2. **Core Server Actions** (equipment.ts, add-fighter.ts, sell-equipment.ts)
3. **Gang Rating Function** (getGangRating simplification)  
4. **Campaign Display** (re-enable rating display)
5. **Remaining Actions** (stash operations, advancement, editing)
6. **Testing & Validation**

## Implementation Details

### Step 1: Data Synchronization
Before making any code changes, run this SQL to sync existing gang ratings:

```sql
-- First, let's see which gangs have incorrect ratings
SELECT 
  g.id,
  g.name,
  g.rating as stored_rating,
  COALESCE(SUM(f.credits), 0) as calculated_rating,
  g.rating - COALESCE(SUM(f.credits), 0) as difference
FROM gangs g
LEFT JOIN fighters f ON f.gang_id = g.id
  AND f.killed = false
  AND f.retired = false  
  AND f.enslaved = false
  AND f.fighter_class != 'exotic beast'
GROUP BY g.id, g.name, g.rating
HAVING g.rating != COALESCE(SUM(f.credits), 0)
ORDER BY ABS(g.rating - COALESCE(SUM(f.credits), 0)) DESC;

-- Then sync all ratings
UPDATE gangs 
SET rating = (
  SELECT COALESCE(SUM(f.credits), 0)
  FROM fighters f
  WHERE f.gang_id = gangs.id
    AND f.killed = false
    AND f.retired = false
    AND f.enslaved = false
    AND f.fighter_class != 'exotic beast'
);
```

### Step 2: Core Server Actions Pattern
Each server action that affects gang rating should follow this pattern:

```typescript
// 1. Calculate the rating change
const ratingChange = calculateRatingImpact();

// 2. Update gang credits AND rating in same operation if possible
const { error } = await supabase
  .from('gangs')
  .update({ 
    credits: newCredits,
    rating: Math.max(0, currentRating + ratingChange)
  })
  .eq('id', gangId);

// 3. Invalidate cache tags
invalidateGangFinancials(gangId);
```

### Step 3: Testing Strategy
After each implementation phase:

1. **Unit Test**: Verify rating updates correctly
2. **Integration Test**: Test full workflow (create fighter → buy equipment → check rating)
3. **Performance Test**: Compare old vs new campaign page load times
4. **Data Validation**: Run sync query to ensure no rating drift

This approach eliminates the complexity of SQL function management while achieving the same performance improvement goal.