# Gang Origin Equipment Discounts & Availability Implementation

## Overview
Implement gang origin-specific equipment discounts and availability adjustments to complement existing gang-level and fighter-level pricing systems.

## Current State Analysis

### Database Schema ✅
- `equipment_discounts` table now has `gang_origin_id` column
- `equipment_availability` table now has `gang_origin_id` column
- Gang origin data is accessible through `fighters.gang_id → gangs.gang_origin_id` relationship

### Existing Discount System
The `get_equipment_with_discounts.sql` function currently handles:
1. **Gang-level discounts**: Based on `gang_type_id`
2. **Fighter-level discounts**: Based on `fighter_type_id` and legacy fighter types
3. **Availability adjustments**: Based on `gang_type_id`

### Key Discovery: Gang Access Already Available ✅
The RPC function already has access to gang data through the existing LATERAL join:
```sql
LEFT JOIN LATERAL (
    SELECT
        fgl.fighter_type_id AS legacy_ft_id,
        ga.fighter_type_id AS affiliation_ft_id
    FROM fighters f
    LEFT JOIN gangs g ON f.gang_id = g.id  -- ← GANG ACCESS ALREADY HERE
    WHERE f.id = $6
) legacy ON TRUE
```

This means `g.gang_origin_id` is already accessible without any frontend changes!

### Sample Gang Origin Data
```sql
-- Equipment discounts with gang origin
gang_origin_id: 'cac5000b-718f-4fcb-9af6-92a3ff331b72'
- Stub Gun: adjusted_cost "35" (was base cost)
- Autogun: adjusted_cost "45"
- Shotgun: adjusted_cost "30"

-- Equipment availability with gang origin
gang_origin_id: 'cac5000b-718f-4fcb-9af6-92a3ff331b72'
- Equipment ID "1723d275-0071-4df8-b5f0-03c34707056d": availability "R8"
```

## Simplified Implementation Plan

### Database-Only Solution (No Frontend Changes Required)

Since the RPC function already has access to gang data through the fighters table, we can implement gang origin equipment discounts purely through database changes without any frontend modifications.

#### Step 1: Update get_equipment_with_discounts.sql Function
**File**: `/supabase/functions/get_equipment_with_discounts.sql`

The existing LATERAL join already provides access to gang data:
```sql
LEFT JOIN LATERAL (
    SELECT
        fgl.fighter_type_id AS legacy_ft_id,
        ga.fighter_type_id AS affiliation_ft_id,
        g.gang_origin_id AS gang_origin_id  -- ADD THIS LINE
    FROM fighters f
    LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
    LEFT JOIN gangs g ON f.gang_id = g.id  -- ← GANG ACCESS ALREADY HERE
    LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
    WHERE f.id = $6
) legacy ON TRUE
```

#### Step 2: Update Discount Calculation Logic
Extend the existing discount queries to include gang origin-based discounts:

**Current discount logic**:
```sql
-- Best discount among gang-level, fighter_type_id, or legacy fighter_type_id
COALESCE(
  (SELECT GREATEST(0, MAX(ed2.discount::numeric))
   FROM equipment_discounts ed2
   WHERE ed2.equipment_id = e.id
     AND (gang-level OR fighter-level conditions)
  ), 0
)
```

**Updated logic to include gang origin**:
```sql
-- Add gang origin condition to existing discount queries
-- In all discount calculation sections, add:
OR (legacy.gang_origin_id IS NOT NULL AND ed2.gang_origin_id = legacy.gang_origin_id)
```

#### Step 3: Update Adjusted Cost Calculation
Extend adjusted cost logic to prioritize gang origin adjusted costs:

**Priority order**:
1. Gang origin `adjusted_cost` (highest priority)
2. Fighter-specific `adjusted_cost`
3. Gang-level `adjusted_cost`
4. Base cost minus discount (lowest priority)

#### Step 4: Update Availability Logic
Extend availability queries to include gang origin availability with proper priority:

```sql
-- Priority order for availability:
-- 1. Gang origin availability (highest priority)
-- 2. Gang-level availability
-- 3. Base equipment availability (lowest priority)
COALESCE(
  (SELECT ea_origin.availability
   FROM equipment_availability ea_origin
   WHERE ea_origin.equipment_id = e.id
   AND ea_origin.gang_origin_id = legacy.gang_origin_id),
  (SELECT ea_gang.availability
   FROM equipment_availability ea_gang
   WHERE ea_gang.equipment_id = e.id
   AND ea_gang.gang_type_id = $1),
  e.availability
) as availability
```

## Implementation Steps - Database Only

### Step 1: Update get_equipment_with_discounts.sql Function
Since the function already accesses gang data through fighters.gang_id, no frontend changes are needed.

**Required Changes**:
1. Add `gang_origin_id` to the existing LATERAL join output
2. Update discount calculation queries to include gang origin conditions
3. Update adjusted cost calculation to prioritize gang origin adjustments
4. Update availability logic to include gang origin availability (like the R8 availability example)

### Step 2: Testing & Verification
1. Test gang origin discounts apply correctly
2. Test gang origin availability adjustments work
3. Test priority system works (origin > gang > base)
4. Test edge cases (no origin, multiple discounts)

**No frontend changes required** - the equipment pricing will automatically reflect gang origin discounts through the existing data flow.

## Expected Behavior

### Before Implementation
- Palanite Enforcer with Prefecture origin: Gets gang-level discounts only
- Equipment shows base costs or gang-level adjusted costs

### After Implementation
- Palanite Enforcer with Prefecture origin: Gets gang-level AND origin-specific discounts
- Prefecture-specific equipment shows special pricing (e.g., Stub Gun for 35 credits instead of base)
- Origin-specific availability adjustments apply

## Success Criteria
1. ✅ Gang origin discounts apply to equipment pricing
2. ✅ Gang origin availability adjustments work
3. ✅ Discount priority system works correctly
4. ✅ No regression in existing discount functionality
5. ✅ Performance remains acceptable