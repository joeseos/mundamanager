# Unified Purchase Modal Refactor

You are refactoring a weapon accessories feature in a Necromunda gang manager app (Next.js, TypeScript, Supabase, React) to consolidate 3 separate purchase modals into one unified component.

## Problem

The current implementation has **3 separate modals** for equipment purchase with complex routing logic:

1. **PurchaseModal** - Basic purchase (cost + master-crafted)
2. **Target Selection Modal** - Select which weapon to upgrade
3. **Effect Selection Modal** - Select equipment effects

**Issues:**
- ~350 lines across 3 modal definitions
- Complex pre-check routing logic (~70 lines)
- Duplicated state management
- Confusing multi-step user flow
- Equipment data fetched multiple times

## Goal

Create **ONE unified purchase modal** that handles all scenarios:
- ✅ Basic equipment purchase (cost + master-crafted)
- ✅ Equipment upgrades (+ target weapon selection)
- ✅ Effect equipment (+ effect selection)
- ✅ All data pre-loaded from RPC (no extra queries)

**Expected savings:** ~230 lines of code

---

## PHASE 1: Update RPC to Include Effect Types

### File: `supabase/functions/get_equipment_with_discounts.sql`

**Add to RETURNS TABLE** (after line 32):
```sql
fighter_effect_types jsonb
```

**Add effect types aggregation** (after line 213, before `vehicle_upgrade_slot`):
```sql
-- Aggregate fighter effect types for this equipment
COALESCE(
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', fet.id,
                'effect_name', fet.effect_name,
                'type_specific_data', fet.type_specific_data,
                'fighter_effect_type_modifiers', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'stat_name', fetm.stat_name,
                            'default_numeric_value', fetm.default_numeric_value,
                            'operation', fetm.operation
                        )
                    )
                    FROM fighter_effect_type_modifiers fetm
                    WHERE fetm.fighter_effect_type_id = fet.id
                )
            )
        )
        FROM fighter_effect_types fet
        WHERE fet.type_specific_data->>'equipment_id' = e.id::text
    ),
    '[]'::jsonb
) as fighter_effect_types,
```

**For custom equipment** (line 332, add before `vehicle_upgrade_slot`):
```sql
'[]'::jsonb as fighter_effect_types,  -- Custom equipment has no effect types
```

**Why:**
- Pre-loads all effect data with equipment
- Zero extra queries when opening purchase modal
- Can show "Has Effects" or "Upgrade" badges on equipment items
- Single source of truth

---

## PHASE 2: Create Unified Purchase Modal

### File: `components/purchase-equipment-modal.tsx` (NEW)

**Copy from:** `components/fighter-effect-selection.tsx`

### 2.1 Update Interface

```typescript
interface PurchaseEquipmentModalProps {
  // Modal control
  isOpen: boolean;
  onClose: () => void;

  // Item being purchased
  item: {
    equipment_id: string;
    equipment_name: string;
    cost: number;
    adjusted_cost?: number;
    is_custom: boolean;
    equipment_category?: string;
  };

  // Purchase context
  context: {
    gangId: string;
    gangCredits: number;
    fighterId?: string;
    vehicleId?: string;
    isStashPurchase?: boolean;
  };

  // Pre-loaded capabilities (from RPC)
  capabilities: {
    effectTypes?: FighterEffectType[];
    isEquipmentUpgrade?: boolean;  // Computed from effectTypes
    fighterWeapons?: { id: string; name: string }[];
  };

  // Callback on success
  onPurchaseComplete: (result: { message: string }) => void;
}
```

### 2.2 Add Purchase State

```typescript
// Purchase options
const [manualCost, setManualCost] = useState(item.adjusted_cost ?? item.cost);
const [isMasterCrafted, setIsMasterCrafted] = useState(false);
const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);

// Selection state (existing)
const [selectedEffects, setSelectedEffects] = useState<string[]>([]);
const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

// Error state
const [error, setError] = useState<string | null>(null);
```

### 2.3 Add Purchase Options Section

```typescript
// NEW: Add before existing target/effect sections
<div className="space-y-4">
  <div>
    <label className="text-sm font-medium">Cost</label>
    <input
      type="number"
      value={manualCost}
      onChange={(e) => setManualCost(Number(e.target.value))}
      className="w-full px-3 py-2 border rounded"
    />
    {error && <p className="text-sm text-destructive mt-1">{error}</p>}
  </div>

  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      id="master-crafted"
      checked={isMasterCrafted}
      onChange={(e) => setIsMasterCrafted(e.target.checked)}
    />
    <label htmlFor="master-crafted">Master-crafted (+25% cost)</label>
  </div>

  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      id="use-base-cost"
      checked={useBaseCostForRating}
      onChange={(e) => setUseBaseCostForRating(e.target.checked)}
    />
    <label htmlFor="use-base-cost">Use base cost for rating</label>
  </div>

  <div className="text-sm">
    <span className="font-medium">Gang Credits:</span> {context.gangCredits}
  </div>
</div>
```

### 2.4 Update Validation

```typescript
const isValid = () => {
  // Check credits
  if (manualCost > context.gangCredits) {
    setError('Insufficient credits');
    return false;
  }

  // If equipment upgrade, must select target
  if (capabilities.isEquipmentUpgrade && !selectedTargetId) {
    return false;
  }

  // If has selectable effects, validate selections
  if (capabilities.effectTypes && capabilities.effectTypes.length > 0) {
    return validateEffectSelections(); // existing logic
  }

  setError(null);
  return true;
};
```

### 2.5 Update Confirm Handler

```typescript
const handleConfirm = async () => {
  if (!isValid()) return false;

  const params: BuyEquipmentParams = {
    equipment_id: item.is_custom ? undefined : item.equipment_id,
    custom_equipment_id: item.is_custom ? item.equipment_id : undefined,
    gang_id: context.gangId,
    manual_cost: manualCost,
    master_crafted: isMasterCrafted,
    use_base_cost_for_rating: useBaseCostForRating,
    buy_for_gang_stash: context.isStashPurchase || false,
    selected_effect_ids: selectedEffects,
    fighter_id: context.fighterId,
    vehicle_id: context.vehicleId,
    equipment_target: selectedTargetId && capabilities.effectTypes ? {
      target_equipment_id: selectedTargetId,
      effect_type_id: capabilities.effectTypes[0].id
    } : undefined
  };

  try {
    const result = await buyEquipmentForFighter(params);

    if (result.success) {
      onPurchaseComplete({
        message: `Successfully purchased ${item.equipment_name}`
      });
      return true; // Close modal
    } else {
      setError(result.error || 'Purchase failed');
      return false; // Keep modal open
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};
```

### 2.6 Conditional Rendering

```typescript
return (
  <div className="p-4 max-h-96 overflow-y-auto">
    {/* SECTION 1: Purchase Options (always visible) */}
    <PurchaseOptionsSection />

    {/* SECTION 2: Target Weapon Selection (conditional) */}
    {capabilities.isEquipmentUpgrade && (
      <>
        <Separator className="my-4" />
        <div>
          <h3 className="font-medium mb-2">Select Target Weapon</h3>
          <TargetWeaponSection
            weapons={capabilities.fighterWeapons || []}
            selectedTargetId={selectedTargetId}
            onSelect={setSelectedTargetId}
          />
        </div>
      </>
    )}

    {/* SECTION 3: Effect Selection (conditional) */}
    {capabilities.effectTypes && capabilities.effectTypes.length > 0 && (
      <>
        <Separator className="my-4" />
        <div>
          <h3 className="font-medium mb-2">Select Effects</h3>
          <EffectSelectionSection
            effectTypes={capabilities.effectTypes}
            selectedEffects={selectedEffects}
            onToggle={handleEffectToggle}
          />
        </div>
      </>
    )}
  </div>
);
```

---

## PHASE 3: Update Equipment.tsx

### File: `components/equipment.tsx`

### 3.1 Add Equipment Interface Fields

```typescript
interface Equipment {
  equipment_id: string;
  equipment_name: string;
  cost: number;
  adjusted_cost?: number;
  // ... other fields

  // NEW: Pre-loaded from RPC
  fighter_effect_types?: FighterEffectType[];

  // Computed from effect_types
  is_equipment_upgrade?: boolean;
}
```

### 3.2 Compute Upgrade Flag When Loading Equipment

```typescript
const processEquipmentData = (data: any[]) => {
  return data.map(item => ({
    ...item,
    fighter_effect_types: item.fighter_effect_types || [],
    is_equipment_upgrade: (item.fighter_effect_types || []).some(
      (et: any) => et.type_specific_data?.applies_to === 'equipment'
    )
  }));
};
```

### 3.3 Remove Old Components & State

**DELETE:**
- PurchaseModal component (~100 lines)
- Pre-check routing logic (lines 136-204) (~70 lines)
- Target selection modal JSX (~40 lines)
- Effect selection modal JSX (~40 lines)
- Separate state variables (~20 lines)

**State to remove:**
```typescript
// DELETE THESE
const [showTargetSelection, setShowTargetSelection] = useState(false);
const [showEffectSelection, setShowEffectSelection] = useState(false);
const [upgradeEffectTypeId, setUpgradeEffectTypeId] = useState<string | null>(null);
```

### 3.4 Add Unified Modal State

```typescript
// REPLACE WITH SINGLE STATE
const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
const [purchaseItem, setPurchaseItem] = useState<Equipment | null>(null);
```

### 3.5 Simplify Purchase Handler

```typescript
// REPLACE complex pre-check logic with simple open
const openPurchaseModal = (item: Equipment) => {
  setPurchaseItem(item);
  setPurchaseModalOpen(true);
};
```

### 3.6 Replace 3 Modals with 1

**DELETE (~150 lines):**
```typescript
{purchaseItem && <PurchaseModal ... />}
{showTargetSelection && <Modal><FighterEffectSelection targetSelectionOnly /></Modal>}
{showEffectSelection && <Modal><FighterEffectSelection /></Modal>}
```

**REPLACE WITH (~30 lines):**
```typescript
{purchaseModalOpen && purchaseItem && (
  <Modal
    title={`Purchase ${purchaseItem.equipment_name}`}
    content={
      <PurchaseEquipmentModal
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        item={purchaseItem}
        context={{
          gangId,
          gangCredits,
          fighterId,
          vehicleId,
          isStashPurchase: isStashMode
        }}
        capabilities={{
          effectTypes: purchaseItem.fighter_effect_types,
          isEquipmentUpgrade: purchaseItem.is_equipment_upgrade,
          fighterWeapons
        }}
        onPurchaseComplete={(result) => {
          toast({
            title: "Purchase Successful",
            description: result.message
          });

          if (onEquipmentBought) {
            onEquipmentBought();
          }

          setPurchaseModalOpen(false);
        }}
      />
    }
    onClose={() => setPurchaseModalOpen(false)}
  />
)}
```

---

## PHASE 4: Remove Purchase Logic from fighter-equipment-list.tsx

### File: `components/fighter/fighter-equipment-list.tsx`

### 4.1 Remove Purchase Mutation

**DELETE lines 112-187:**
- Entire optimistic update mutation
- `onRegisterPurchase` callback (lines 189-194)

**Why:** Purchase logic now lives entirely in `PurchaseEquipmentModal`

### 4.2 Remove onRegisterPurchase Prop

**DELETE from interface:**
```typescript
// DELETE THIS LINE
onRegisterPurchase?: (params: any) => Promise<void>;
```

**DELETE from component props:**
```typescript
// DELETE THIS LINE
onRegisterPurchase
```

### 4.3 Keep Display-Only Logic

**KEEP:**
- Equipment tree display
- Delete, Sell, Stash actions
- Weapon profile rendering

---

## PHASE 5: Update stash-tab.tsx

### File: `components/gang/stash-tab.tsx`

### 5.1 Update Import

```typescript
// REPLACE
import FighterEffectSelection from '@/components/fighter-effect-selection';

// WITH
import PurchaseEquipmentModal from '@/components/purchase-equipment-modal';
```

### 5.2 Update Modal Usage

Replace FighterEffectSelection usage with PurchaseEquipmentModal for post-purchase effect selection (if still needed in stash context).

---

## Summary of Changes

| Phase | File | Lines Removed | Lines Added | Net |
|-------|------|---------------|-------------|-----|
| 1 | `get_equipment_with_discounts.sql` | 0 | +30 | +30 |
| 2 | `purchase-equipment-modal.tsx` (new) | 0 | +470 | +470 |
| 3 | `equipment.tsx` | -220 | +30 | -190 |
| 4 | `fighter-equipment-list.tsx` | -75 | 0 | -75 |
| 5 | `stash-tab.tsx` | -10 | +5 | -5 |
| - | `fighter-effect-selection.tsx` (delete) | -455 | 0 | -455 |
| **TOTAL** | | **-760** | **+535** | **-225** |

## Benefits

✅ **Single purchase modal** instead of 3
✅ **Zero extra queries** - RPC returns everything
✅ **Better UX** - see all options at once
✅ **Clean separation** - Equipment displays, Modal purchases
✅ **Easier to test** - single responsibility per component
✅ **~225 lines removed** from codebase

## What Remains (DO NOT CHANGE)

✅ Equipment-to-equipment upgrades (core feature)
✅ Effect selection for multi-option equipment
✅ Post-purchase weapon attachment
✅ Weapon stat modification display
✅ Equipment tree hierarchy view
✅ All database queries and effects logic
