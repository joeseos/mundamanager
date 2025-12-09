# Implementation Plan: Admin Injuries & Rig Glitches Modal

## Overview

Create a new admin component for managing **Injuries** and **Rig Glitches** in the admin dashboard. These are both `fighter_effect_types` differentiated by their `fighter_effect_category_id`.

## Current System Understanding

### Database Structure
- **`fighter_effect_categories`** - Contains category definitions including "injuries" and "rig-glitches"
- **`fighter_effect_types`** - Effect definitions with `effect_name`, `fighter_effect_category_id`, `type_specific_data` (JSONB)
- **`fighter_effect_type_modifiers`** - Stat modifiers (e.g., -1 to Movement) linked to effect types

### Existing Components
- `AdminFighterEffects` (`components/admin/admin-fighter-effects.tsx`) - Reusable component for managing fighter effects and modifiers
- `AdminScenariosModal` - Good pattern reference for CRUD operations with create/edit modes

### Existing APIs
- `/api/admin/fighter-effects` - GET/POST/DELETE for fighter effect types and modifiers
- `/api/admin/fighter-effects?categories=true` - Fetches all categories
- `/api/fighters/injuries` - Read-only endpoint for fetching injuries/rig-glitches (used by fighter UI)

## Implementation Steps

### Step 1: Create New Admin Modal Component

**File:** `components/admin/admin-injuries-glitches.tsx`

```typescript
interface AdminInjuriesGlitchesModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}
```

**Key Features:**
1. Category selector dropdown (Injury vs Rig Glitch)
2. Effect selector dropdown (list existing effects in selected category)
3. Create/Edit/Delete modes (following `AdminScenariosModal` pattern)
4. Reuse `AdminFighterEffects` component for managing modifiers

**UI Structure:**
```
┌─────────────────────────────────────────────────┐
│ Manage Injuries & Rig Glitches            [X]   │
├─────────────────────────────────────────────────┤
│ Category *                                      │
│ [Dropdown: Injury | Rig Glitch]                 │
│                                                 │
│ Select Effect                    [Create New]   │
│ [Dropdown: existing effects]                    │
│                                                 │
│ Effect Name *                                   │
│ [Input field]                                   │
│                                                 │
│ ─────────── Effects Section ───────────         │
│ [AdminFighterEffects component]                 │
│ - Shows modifiers for selected effect           │
│ - Add/Delete modifiers                          │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Cancel] [Create/Update Effect] [Delete Effect] │
└─────────────────────────────────────────────────┘
```

### Step 2: Add PATCH Method to Fighter Effects API

**File:** `app/api/admin/fighter-effects/route.ts`

The existing API lacks a PATCH method. Add:

```typescript
export async function PATCH(request: NextRequest) {
  // Update effect_name, fighter_effect_category_id, type_specific_data
  // for a given effect ID
}
```

### Step 3: Update Admin Page

**File:** `app/admin/page.tsx`

1. Add import for new component
2. Add state: `const [showInjuriesGlitches, setShowInjuriesGlitches] = useState(false);`
3. Add to `coreSections` array:
   ```typescript
   {
     title: "Injuries & Rig Glitches",
     description: "Manage injuries and rig glitches",
     action: () => setShowInjuriesGlitches(true),
     icon: LuHeartCrack // or similar icon
   }
   ```
4. Add conditional render for the modal

### Step 4: Component Implementation Details

#### State Management
```typescript
const [selectedCategory, setSelectedCategory] = useState<'injuries' | 'rig-glitches'>('injuries');
const [categories, setCategories] = useState<FighterEffectCategory[]>([]);
const [effects, setEffects] = useState<FighterEffectType[]>([]);
const [selectedEffectId, setSelectedEffectId] = useState('');
const [effectName, setEffectName] = useState('');
const [isCreateMode, setIsCreateMode] = useState(false);
const [isLoading, setIsLoading] = useState(false);
const [fighterEffects, setFighterEffects] = useState<FighterEffectType[]>([]);
```

#### Data Fetching
1. On mount: Fetch all categories
2. Filter to get only "injuries" and "rig-glitches" category IDs
3. Fetch effects filtered by selected category ID
4. When effect is selected: Load its modifiers

#### API Calls
```typescript
// Fetch categories
GET /api/admin/fighter-effects?categories=true

// Fetch effects by category
GET /api/admin/fighter-effects?categoryId={categoryId}
// Note: May need to add this filter to the API

// Create effect
POST /api/admin/fighter-effects
{
  effect_name: string,
  fighter_effect_category_id: string,
  type_specific_data: null // injuries/glitches don't need type_specific_data
}

// Update effect
PATCH /api/admin/fighter-effects?id={effectId}
{
  effect_name: string,
  fighter_effect_category_id: string
}

// Delete effect
DELETE /api/admin/fighter-effects?id={effectId}
```

#### Reusing AdminFighterEffects
The `AdminFighterEffects` component expects an `equipmentId` prop, but we can adapt it:
- For injuries/glitches, we don't have an equipment_id
- We need to modify the component or create a wrapper that doesn't require equipment_id
- Alternative: Pass a dummy ID and handle the effect filtering ourselves

**Recommended Approach:** Create a simplified version or modify `AdminFighterEffects` to accept effects directly without requiring an equipmentId.

### Step 5: API Enhancement for Category Filtering

**File:** `app/api/admin/fighter-effects/route.ts`

Add support for filtering by category:
```typescript
const categoryId = searchParams.get('categoryId');

if (categoryId) {
  const { data, error } = await supabase
    .from('fighter_effect_types')
    .select(`
      id,
      effect_name,
      fighter_effect_category_id,
      type_specific_data,
      fighter_effect_categories(id, category_name)
    `)
    .eq('fighter_effect_category_id', categoryId);
  // ... rest of handler
}
```

## Files to Create/Modify

### New Files
1. `components/admin/admin-injuries-glitches.tsx` - Main modal component

### Modified Files
1. `app/admin/page.tsx` - Add new section and modal
2. `app/api/admin/fighter-effects/route.ts` - Add PATCH method and category filtering

## Testing Checklist

- [ ] Can select between Injury and Rig Glitch categories
- [ ] Can view existing injuries/rig glitches in the selected category
- [ ] Can create a new injury with modifiers
- [ ] Can create a new rig glitch with modifiers
- [ ] Can edit an existing injury name
- [ ] Can add/remove modifiers from an injury
- [ ] Can delete an injury (with confirmation)
- [ ] Toast notifications work for all operations
- [ ] Loading states display correctly
- [ ] Modal closes properly on cancel/submit/backdrop click

## UI/UX Considerations

1. **Default Category:** Injury (as specified in requirements)
2. **Category Change:** When changing category, clear selected effect
3. **Create Mode:** Disable effect selector, enable name input
4. **Edit Mode:** Pre-populate name, show existing modifiers
5. **Delete Confirmation:** Show confirmation before deleting (optional, can add later)
6. **Validation:** Effect name is required

## Dependencies

- Existing `AdminFighterEffects` component for modifier management
- Existing API infrastructure for fighter effects
- Existing `Modal` and form UI components

## Future Enhancements

1. Add skill granting capability (some injuries grant skills)
2. Add `type_specific_data` configuration for special injuries
3. Add search/filter for large injury lists
4. Add bulk import/export functionality
