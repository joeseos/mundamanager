# Equipment Effects Implementation for Move From Stash

## Overview

This document describes the implementation of equipment effects when moving equipment from stash to fighters or vehicles. Previously, equipment effects were not being applied when equipment was moved from stash, causing fighter stats to not update until a page refresh.

## Problem Statement

When equipment with effects was moved from stash to a fighter or vehicle:
1. ✅ Equipment was properly assigned to the fighter/vehicle
2. ✅ Equipment appeared in the fighter card's equipment list
3. ❌ **Equipment effects were not applied** - no stat bonuses, modifiers, etc.
4. ❌ **Fighter stats didn't update** until page refresh
5. ❌ **Fighter cards showed outdated stats** despite having new equipment

## Solution Architecture

The solution involves both backend and frontend changes to ensure equipment effects are properly applied and displayed:

### Backend Changes (Server Action)

**File: `app/actions/move-from-stash.ts`**

#### 1. Return Interface Update
```typescript
interface MoveFromStashResult {
  success: boolean;
  data?: {
    equipment_id: string;
    weapon_profiles?: any[];
    updated_gang_rating?: number;
    affected_beast_ids?: string[];
    updated_fighters?: any[];
    applied_effects?: any[];  // ← NEW: Applied effects data
  };
  error?: string;
}
```

#### 2. Effects Application Logic
Added after equipment is moved from stash (line ~145):

```typescript
// Apply equipment effects if this equipment has any
let appliedEffects: any[] = [];
if ((params.fighter_id || params.vehicle_id) && !isCustomEquipment && stashData.equipment_id) {
  try {
    // Get equipment effects from fighter_effect_types
    const { data: equipmentEffects, error: effectsError } = await supabase
      .from('fighter_effect_types')
      .select(`
        id,
        effect_name,
        fighter_effect_category_id,
        type_specific_data
      `)
      .eq('type_specific_data->>equipment_id', stashData.equipment_id.toString());

    if (!effectsError && equipmentEffects && equipmentEffects.length > 0) {
      // Apply each effect to the fighter or vehicle
      for (const effectType of equipmentEffects) {
        try {
          if (params.fighter_id) {
            // Call add_fighter_effect RPC
            const { data: effectResult } = await supabase.rpc('add_fighter_effect', {
              in_fighter_id: params.fighter_id,
              in_fighter_effect_category_id: effectType.fighter_effect_category_id,
              in_fighter_effect_type_id: effectType.id,
              in_user_id: user.id
            });

            if (effectResult?.id) {
              // Link effect to equipment
              await supabase
                .from('fighter_effects')
                .update({ fighter_equipment_id: equipmentData.id })
                .eq('id', effectResult.id);

              // Get effect modifiers for complete effect data
              const { data: modifiers } = await supabase
                .from('fighter_effect_modifiers')
                .select('id, fighter_effect_id, stat_name, numeric_value')
                .eq('fighter_effect_id', effectResult.id);

              // Collect complete effect data for frontend
              appliedEffects.push({
                id: effectResult.id,
                effect_name: effectType.effect_name,
                fighter_effect_category_id: effectType.fighter_effect_category_id,
                fighter_effect_modifiers: modifiers || []
              });
            }
          } else if (params.vehicle_id) {
            // Call add_vehicle_effect RPC
            const { data: effectResult } = await supabase.rpc('add_vehicle_effect', {
              in_vehicle_id: params.vehicle_id,
              in_fighter_effect_category_id: effectType.fighter_effect_category_id,
              in_fighter_effect_type_id: effectType.id,
              in_user_id: user.id
            });

            if (effectResult?.id) {
              // Link effect to equipment
              await supabase
                .from('vehicle_effects')
                .update({ fighter_equipment_id: equipmentData.id })
                .eq('id', effectResult.id);

              // Get effect modifiers for vehicles to prevent NaN errors
              const { data: modifiers } = await supabase
                .from('fighter_effect_modifiers')
                .select('id, fighter_effect_id, stat_name, numeric_value')
                .eq('fighter_effect_id', effectResult.id);

              // Collect effect data for frontend
              appliedEffects.push({
                id: effectResult.id,
                effect_name: effectType.effect_name,
                fighter_effect_category_id: effectType.fighter_effect_category_id,
                fighter_effect_modifiers: modifiers || []
              });
            }
          }
        } catch (effectError) {
          console.error(`Error applying effect ${effectType.effect_name}:`, effectError);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching equipment effects:', error);
  }
}
```

#### 3. Return Applied Effects
Updated return statements to include applied effects:

```typescript
return {
  success: true,
  data: {
    equipment_id: equipmentData.id,
    weapon_profiles: weaponProfiles,
    updated_gang_rating: updatedGangRating,
    ...(affectedBeastIds.length > 0 && { affected_beast_ids: affectedBeastIds }),
    ...(appliedEffects.length > 0 && { applied_effects: appliedEffects })  // ← NEW
  }
};
```

### Frontend Changes (Stash Tab)

**File: `components/gang/stash-tab.tsx`**

#### 1. Fighter Effects Update
When equipment is moved to a fighter, the `updatedFighter` object now includes applied effects:

```typescript
// Update the fighter with the new equipment
updatedFighter = {
  ...currentFighter,
  credits: currentFighter.credits + (stashItem.cost || 0),
  weapons: stashItem.equipment_type === 'weapon' 
    ? [
        ...(currentFighter.weapons || []),
        {
          weapon_name: stashItem.equipment_name || '',
          weapon_id: stashItem.equipment_id || stashItem.id,
          cost: stashItem.cost || 0,
          fighter_weapon_id: responseData?.equipment_id || stashItem.id,
          weapon_profiles: responseData?.weapon_profiles || [],
          is_master_crafted: hasMasterCrafted
        }
      ]
    : currentFighter.weapons || [],
  wargear: stashItem.equipment_type === 'wargear'
    ? [
        ...(currentFighter.wargear || []),
        {
          wargear_name: stashItem.equipment_name || '',
          wargear_id: stashItem.equipment_id || stashItem.id,
          cost: stashItem.cost || 0,
          fighter_weapon_id: responseData?.equipment_id || stashItem.id,
          is_master_crafted: hasMasterCrafted
        }
      ]
    : currentFighter.wargear || [],
  // ← NEW: Add applied effects to fighter's effects object
  effects: responseData?.equipment_effects && responseData.equipment_effects.length > 0 
    ? {
        ...currentFighter.effects,
        equipment: [
          ...(currentFighter.effects?.equipment || []),
          ...responseData.equipment_effects
        ]
      }
    : currentFighter.effects
};
```

#### 2. Vehicle Effects Update
When equipment is moved to a vehicle, the vehicle's effects are updated in the crew fighter's vehicle reference:

```typescript
// Apply equipment effects to vehicle effects structure
let vehicleEffectsUpdates: any = {};
if (responseData?.applied_effects && responseData.applied_effects.length > 0) {
  // Add effects to the vehicle's effects structure (for fighter-card calculations)
  vehicleEffectsUpdates = responseData.applied_effects;
}

// Update the target vehicle's equipment
const updatedVehicle: VehicleProps = {
  ...targetVehicle,
  equipment: [...(targetVehicle.equipment || []), newEquipment]
};

// Find if this vehicle belongs to a crew member and update that fighter
const crewFighter = fighters.find(f => 
  f.vehicles?.some(v => v.id === targetId)
);

if (crewFighter) {
  // Update the crew fighter's vehicle with equipment and effects
  const updatedCrewFighter: FighterProps = {
    ...crewFighter,
    vehicles: crewFighter.vehicles?.map(v => {
      if (v.id === targetId) {
        // Get existing vehicle upgrades effects
        const existingVehicleUpgrades = v.effects?.["vehicle upgrades"] || [];
        
        return {
          ...v, 
          equipment: updatedVehicle.equipment,
          // Update effects with new vehicle upgrades
          effects: vehicleEffectsUpdates.length > 0 
            ? {
                ...v.effects,
                "vehicle upgrades": [
                  ...existingVehicleUpgrades,
                  ...vehicleEffectsUpdates
                ]
              }
            : v.effects
        } as Vehicle;
      }
      return v;
    })
  };
  
  // Update the crew fighter in the fighters list
  setFighters(prev => 
    prev.map(f => f.id === crewFighter.id ? updatedCrewFighter : f)
  );
  
  // Call parent update function
  if (onFighterUpdate) {
    onFighterUpdate(updatedCrewFighter, true);
  }
}
```

## Data Flow

### Before Implementation
```
User moves equipment → Server updates equipment record → Frontend updates equipment arrays → Fighter cards show old stats
```

### After Implementation
```
User moves equipment → Server applies effects to database → Server returns applied effects → Frontend updates fighter/vehicle objects with effects → Fighter cards recalculate and show updated stats
```

## Key Components

### 1. Database Tables Involved
- `fighter_effect_types` - Defines equipment effects
- `fighter_effects` - Applied fighter effects (linked to equipment)
- `vehicle_effects` - Applied vehicle effects (linked to equipment)
- `fighter_effect_modifiers` - Effect stat modifiers

### 2. RPC Functions Used
- `add_fighter_effect` - Applies effects to fighters
- `add_vehicle_effect` - Applies effects to vehicles

### 3. Frontend Components Affected
- `stash-tab.tsx` - Handles equipment moves and updates fighter/vehicle objects
- `fighter-card.tsx` - Displays stats calculated from effects
- `gang-page-content.tsx` - Manages fighter state updates

## Benefits

1. **Immediate UI Updates** - Fighter stats update instantly when equipment is moved
2. **No Page Refresh Required** - Effects are applied and displayed without reload
3. **Consistent Behavior** - Equipment effects work the same whether bought or moved from stash
4. **Proper Data Flow** - Server applies effects, frontend receives and displays them
5. **Error Handling** - Graceful handling of effect application failures

## Testing

To test the implementation:
1. Move equipment with effects from stash to a fighter
2. Verify fighter stats update immediately (no refresh needed)
3. Move equipment with effects from stash to a vehicle
4. Verify vehicle effects are applied to crew fighters
5. Check that effects persist after page refresh

## Future Considerations

- Consider adding effect removal when equipment is moved back to stash
- Add visual indicators for active equipment effects
- Implement effect stacking rules if needed
- Add effect validation to prevent invalid combinations

## Fix for NaN Errors in Vehicle Effects

### Problem
When equipment with effects was moved to vehicles, the frontend was receiving NaN (Not a Number) values for stats. This was because:

1. **Missing Effect Modifiers**: The original implementation for vehicle effects didn't fetch the `vehicle_effect_modifiers` data
2. **Frontend Calculations**: The fighter card stat calculations (`calculateAdjustedStats`) expect effect objects to have `modifiers` arrays with `numeric_value` properties
3. **Without Modifiers**: When effects lacked modifiers, the stat calculations tried to add `undefined` values, resulting in NaN

### Solution
The implementation now includes effect modifiers for both fighter and vehicle effects:

**For Fighter Effects:**
```typescript
// Get effect modifiers for complete effect data
const { data: modifiers } = await supabase
  .from('fighter_effect_modifiers')
  .select('id, fighter_effect_id, stat_name, numeric_value')
  .eq('fighter_effect_id', effectResult.id);
```

**For Vehicle Effects:**
```typescript
// Get effect modifiers for vehicles to prevent NaN errors
const { data: modifiers } = await supabase
  .from('fighter_effect_modifiers')
  .select('id, fighter_effect_id, stat_name, numeric_value')
  .eq('fighter_effect_id', effectResult.id);
```

**Important**: Vehicle effects use the same `fighter_effect_modifiers` table as fighter effects, not a separate `vehicle_effect_modifiers` table. The `add_vehicle_effect` RPC creates modifiers in `fighter_effect_modifiers` with the effect ID.

Both fighter and vehicle effects now include:
```typescript
appliedEffects.push({
  id: effectResult.id,
  effect_name: effectType.effect_name,
  fighter_effect_category_id: effectType.fighter_effect_category_id,
  fighter_effect_modifiers: modifiers || []  // ← KEY: Always include modifiers array with correct property name
});
```

This ensures that the frontend receives complete effect data with proper numeric values for stat calculations, preventing NaN errors.

**Important**: The frontend expects the property to be named `fighter_effect_modifiers`, not `modifiers`. This matches the structure that the `calculateVehicleStats()` function in fighter-card.tsx expects.

## Key Insight: Vehicle Effects Structure

Vehicle effects work differently than fighter effects:

1. **Vehicle effects are stored in the crew fighter's `vehicles` array**
2. **Each vehicle has an `effects` object with categories like `"vehicle upgrades"` and `"lasting damages"`**
3. **Fighter cards read vehicle effects from `vehicle.effects["vehicle upgrades"]`**
4. **The `calculateVehicleStats()` function processes these effects for display**

This is why vehicle effects must be added to the crew fighter's vehicle reference, not the vehicle record itself. The fighter card component expects this structure to properly calculate and display vehicle stats with applied effects. 