# Gang Origin Implementation

## Overview
Add gang origin functionality to the gang edit modal, following the exact same pattern as gang affiliation implementation. Gang origins will be displayed in a dropdown below the Alliance section, grouped by category.

## Database Structure
Based on user requirements and existing patterns:
- `gang_origins` table with FK to `gang_origin_categories`
- `gangs.gang_origin_id` as optional FK to `gang_origins`
- `gang_types.gang_origin_category_id` as optional FK to `gang_origin_categories`
- Category name comes from `gang_origin_categories.category_name`

## Implementation Plan

### 1. API Endpoint Updates
**File**: `app/api/gang-types/route.ts` (MODIFY existing endpoint)

#### CRITICAL FIX: Admin Filtering Logic
**Issue**: Hidden gang types (like "Palanite Enforcers (BoL)") are filtered out for admin users by default, breaking origins functionality.

**Fix the filtering logic**:
```typescript
// WRONG - This filters out hidden types for admins:
if (isAdmin && !includeAll) {
  query = query.eq('is_hidden', false);
}

// CORRECT - Only filter for non-admin users:
if (!isAdmin) {
  if (includeAll) {
    // Include "All" gang type even if hidden, but exclude other hidden types
    query = query.or('is_hidden.eq.false,gang_type_id.eq.b181b2f7-59f9-452c-84fc-89f183fb8221');
  } else {
    query = query.eq('is_hidden', false);
  }
}
// Admin users see all gang types (including hidden) by default
```

#### Add Gang Origin Data
- Add gang origin data to existing query (lines 28-31):
  ```sql
  SELECT gang_type_id, gang_type, alignment, image_url, affiliation, gang_origin_category_id
  ```
- Join with gang_origin_categories when gang_origin_category_id is present
- Add origins to response similar to affiliations (lines 51-68):
  ```typescript
  // Fetch all available origins from gang types that have them
  const gangTypeWithOrigins = data.find((type: any) => type.gang_origin_category_id);
  if (gangTypeWithOrigins) {
    // Load all origins for the category
    const { data: origins } = await supabase
      .from('gang_origins')
      .select(`
        id,
        origin_name,
        gang_origin_categories!gang_origin_category_id (
          category_name
        )
      `)
      .eq('gang_origin_category_id', gangTypeWithOrigins.gang_origin_category_id);

    allOrigins = origins || [];
  }

  // Add origins to gang types
  const gangTypesWithOrigins = gangTypes.map((gangType) => {
    return {
      ...gangType,
      available_origins: gangType.gang_origin_category_id ? allOrigins : []
    };
  });
  ```

### 2. Gang Edit Modal Updates
**File**: `components/gang/gang-edit-modal.tsx`

#### Interface Changes (lines 39-67)
```typescript
interface GangEditModalProps {
  // ... existing props
  gangOriginId: string | null;
  gangOriginName: string;
  gangTypeHasOrigin: boolean;
  // ... rest of props
}
```

#### State Management (after line 116)
```typescript
const [editedGangOriginId, setEditedGangOriginId] = useState(gangOriginId || '');

// Origin management state - reuse existing affiliation pattern (after line 124)
const [originList, setOriginList] = useState<Array<{id: string, origin_name: string, category_name: string}>>([]);
const [originListLoaded, setOriginListLoaded] = useState(false);
```

#### Data Loading Function - Reuse fetchAffiliations pattern (modify existing function around line 166)
Update `fetchAffiliations` to also load origins:
```typescript
const fetchAffiliations = async () => {
  if (affiliationListLoaded && originListLoaded) return;

  try {
    const response = await fetch('/api/gang-types');
    if (!response.ok) throw new Error('Failed to fetch gang types');
    const data = await response.json();

    // Existing affiliation logic
    const gangTypeWithAffiliations = data.find((type: any) => type.available_affiliations && type.available_affiliations.length > 0);
    if (gangTypeWithAffiliations) {
      setAffiliationList(gangTypeWithAffiliations.available_affiliations);
    }
    setAffiliationListLoaded(true);

    // New origin logic - same pattern
    const gangTypeWithOrigins = data.find((type: any) => type.available_origins && type.available_origins.length > 0);
    if (gangTypeWithOrigins) {
      setOriginList(gangTypeWithOrigins.available_origins);
    }
    setOriginListLoaded(true);
  } catch (error) {
    console.error('Error fetching affiliations/origins:', error);
    toast({
      description: 'Failed to load affiliations/origins',
      variant: "destructive"
    });
  }
};
```

#### Form Initialization (line 144)
Add `setEditedGangOriginId(gangOriginId || '');` to useEffect

#### UI Component (after line 462, before gang variants)
**Important**: Use category name as label (not generic "Gang Origin"):

```typescript
{/* Gang Origin Section - Only show if gang type supports origins */}
{gangTypeHasOrigin && (
  <div className="space-y-2">
    <p className="text-sm font-medium">{gangOriginCategoryName || 'Gang Origin'}</p>
    <select
      value={editedGangOriginId || ""}
      onChange={(e) => setEditedGangOriginId(e.target.value)}
      onFocus={fetchAffiliations}  {/* Reuse same function */}
      className="w-full p-2 border rounded-md"
    >
      {/* Default "None" option */}
      <option value="">None</option>

      {/* Display origins after they are loaded - SIMPLIFIED (no optgroup for single category) */}
      {originListLoaded ? (
        originList.map((origin) => (
          <option key={origin.id} value={origin.id}>
            {origin.origin_name}
          </option>
        ))
      ) : (
        <>
          {gangOriginId && <option value={gangOriginId}>{gangOriginName}</option>}
          <option value="" disabled>Loading Origins...</option>
        </>
      )}
    </select>
  </div>
)}
```

**Note**: Removed optgroup grouping to avoid redundancy since category name is already in the header. This prevents showing "Prefecture" twice (header + optgroup label).

#### Form Submission (line 229)
Add to updates object:
```typescript
gang_origin_id: editedGangOriginId === '' ? null : editedGangOriginId,
```

### 3. Data Loading Integration
**File**: `app/lib/shared/gang-data.ts`

#### Update GangBasic interface (line 27)
```typescript
gang_origin_id?: string | null;
gang_origin?: {
  id: string;
  origin_name: string;
  category_name: string;
} | null;
```

#### Update getGangBasic query (lines 158-166)
```typescript
gang_origin_id,
gang_origin:gang_origin_id (
  id,
  origin_name,
  gang_origin_categories!gang_origin_category_id (
    category_name
  )
),
```

### 4. Gang Page Data Assembly Fix
**File**: `app/gang/[id]/page.tsx` (CRITICAL FIX)

#### CRITICAL FIX: Missing Gang Origin Fields in Data Assembly
**Issue**: Even though `getGangBasic()` fetches gang origin data correctly, the `gangData` object construction is missing these fields.

**Fix in gangData assembly (around line 379)**:
```typescript
// Assemble the gang data structure
const gangData = {
  // ... existing fields ...
  gang_variants: gangVariants,
  gang_affiliation_id: gangBasic.gang_affiliation_id,
  gang_affiliation: gangBasic.gang_affiliation,

  // ADD THESE MISSING FIELDS:
  gang_origin_id: gangBasic.gang_origin_id,
  gang_origin: gangBasic.gang_origin,

  gang_types: gangBasic.gang_types,
  user_id: gangBasic.user_id,
  // ... rest of fields
};
```

### 5. Parent Component Updates
Update the component that renders GangEditModal to pass:
- `gangOriginId={gang.gang_origin_id}`
- `gangOriginName={gang.gang_origin?.origin_name || ''}`

### 5. Type Definitions
**File**: `types/gang.ts`
Add gang origin related interfaces:
```typescript
export interface GangOrigin {
  id: string;
  origin_name: string;
  category_name: string;
}

export interface GangOriginCategory {
  id: string;
  category_name: string;
}

// Update existing GangType interface to include:
export interface GangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
  note?: string;
  gang_origin_category_id?: string; // Add this
  available_origins?: GangOrigin[];  // Add this for API response
}
```

### 6. GangUpdates Interface
**File**: `components/gang/gang-edit-modal.tsx` (line 31)
```typescript
interface GangUpdates {
  // ... existing fields
  gang_origin_id: string | null;
}
```

## Conditional Display Logic
Following the exact same pattern as gang affiliation:
- Uses `gangTypeHasOrigin` boolean prop (similar to `gangTypeHasAffiliation`)
- Determined by gang type configuration, not whether gang currently has an origin
- Consistent with existing architecture patterns

## Files to Modify
1. **MODIFY**: `app/api/gang-types/route.ts` - **[CRITICAL]** Fix admin filtering logic + Add gang origin data to existing endpoint
2. **MODIFY**: `app/gang/[id]/page.tsx` - **[CRITICAL]** Add missing gang_origin_id and gang_origin fields to gangData assembly
3. **MODIFY**: `components/gang/gang-edit-modal.tsx` - Main UI implementation following affiliation pattern
4. **MODIFY**: `app/lib/shared/gang-data.ts` - Data loading for gang origin information
5. **MODIFY**: `types/gang.ts` - Add gang origin types and interfaces
6. **MODIFY**: Parent component using GangEditModal - Pass gang origin props

## Key Benefits of This Approach
1. **Consistency**: Follows exact same patterns as gang affiliation
2. **Performance**: Single API call loads both affiliations and origins
3. **Maintainability**: Same code patterns throughout
4. **Data integrity**: Origins tied to gang type configuration like affiliations

## CRITICAL FIXES SUMMARY
**These two fixes are essential for functionality:**
1. **Admin Filtering Fix** (gang-types API): Admin users must see hidden gang types that have origins
2. **Data Assembly Fix** (gang page): Gang origin fields must be included in gangData object construction

**Additional improvements:**
3. **UX Enhancement**: Use category name as dropdown label instead of generic "Gang Origin"
4. **Display Optimization**: Remove optgroup when there's only one category to avoid redundancy

## Testing
- Verify dropdown loads origins for admin users (including hidden gang types)
- Test that selected gang origin displays correctly in dropdown
- Test selecting/changing/clearing gang origins
- Ensure form submission includes gang_origin_id
- Verify data persistence and loading
- Confirm dropdown label shows category name (e.g., "Prefecture")