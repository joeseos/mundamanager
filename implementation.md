# Equipment Purchase Performance Refactor Prompt

You are an expert TypeScript/Next.js developer tasked with optimizing the `buyEquipmentForFighter` function in `app/actions/equipment.ts`. The current implementation has performance issues due to sequential database operations. 

## Current Performance Problems
1. **Sequential operations** - Everything runs with `await` one after another
2. **RPC overhead** - Using `add_fighter_effect` and `add_vehicle_effect` RPCs for simple equipment effects
3. **Multiple database roundtrips** - Could be batched or parallelized

## Refactoring Requirements

### 1. Use Promise.all for Parallel Operations
Identify independent operations that can run in parallel and group them with `Promise.all()`. Examples:
- Gang credit checks and fighter type queries
- Equipment details fetching and discount calculations
- Effect type queries and beast configuration checks

### 2. Replace RPC Calls with Direct Database Operations
Replace the current effect handling section (lines ~120-180 in the current code) that uses:
```typescript
const { data: effectResult } = await supabase.rpc('add_fighter_effect', {...});
const { data: effectResult } = await supabase.rpc('add_vehicle_effect', {...});
```

With direct database operations using the simplified approach:
```typescript
// Batch insert fighter_effects
const effectsToInsert = selectedEffectIds.map(effectId => ({
  fighter_id: fighterId || null,
  vehicle_id: vehicleId || null,
  fighter_effect_type_id: effectId,
  effect_name: effectType.effect_name,
  type_specific_data: effectType.type_specific_data,
  fighter_equipment_id: newEquipmentId,
  user_id: userId
}));

const { data: insertedEffects } = await supabase
  .from('fighter_effects')
  .insert(effectsToInsert)
  .select('id, fighter_effect_type_id');

// Batch insert modifiers
const modifiersToInsert = [];
// ... build modifiers array
const { data: insertedModifiers } = await supabase
  .from('fighter_effect_modifiers')
  .insert(modifiersToInsert);
```

### 3. Specific Areas to Optimize

**Gang and Fighter Data Fetching (lines ~40-80):**
- Parallelize gang info, fighter type, and vehicle data queries
- Use Promise.all to fetch discount information simultaneously

**Equipment Details and Pricing (lines ~80-120):**
- Parallel fetch of equipment details and weapon profiles
- Combine discount queries where possible

**Effect Processing (lines ~120-180):**
- Replace sequential RPC calls with batch database operations
- Fetch all effect types in one query
- Batch insert effects and modifiers

**Rating Updates (lines ~180-200):**
- Can be done in parallel with cache invalidation
- Group related rating calculations

### 4. Code Structure Guidelines

**Before (Sequential):**
```typescript
const gangData = await supabase.from('gangs').select(...);
const fighterData = await supabase.from('fighters').select(...);
const equipmentData = await supabase.from('equipment').select(...);
// Each await blocks the next operation
```

**After (Parallel):**
```typescript
const [gangData, fighterData, equipmentData] = await Promise.all([
  supabase.from('gangs').select(...),
  supabase.from('fighters').select(...),
  supabase.from('equipment').select(...)
]);
```

### 5. Effect Handling Simplification

**Current (using RPCs):**
```typescript
for (const effectId of params.selected_effect_ids) {
  const { data: effectResult } = await supabase.rpc('add_fighter_effect', {
    in_fighter_id: params.fighter_id,
    in_fighter_effect_category_id: effectType.fighter_effect_category_id,
    in_fighter_effect_type_id: effectType.id,
    in_user_id: user.id
  });
  
  await supabase.from('fighter_effects').update({
    fighter_equipment_id: newEquipmentId
  }).eq('id', effectResult.id);
}
```

**Target (direct batch operations):**
```typescript
// Get all effect type data in one query
const { data: effectTypes } = await supabase
  .from('fighter_effect_types')
  .select(`
    id, effect_name, type_specific_data,
    fighter_effect_type_modifiers(stat_name, default_numeric_value)
  `)
  .in('id', params.selected_effect_ids);

// Batch insert all effects
const effectsToInsert = effectTypes.map(effectType => ({
  fighter_id: params.fighter_id || null,
  vehicle_id: params.vehicle_id || null,
  fighter_effect_type_id: effectType.id,
  effect_name: effectType.effect_name,
  type_specific_data: effectType.type_specific_data,
  fighter_equipment_id: newEquipmentId,
  user_id: user.id
}));

const { data: insertedEffects } = await supabase
  .from('fighter_effects')
  .insert(effectsToInsert)
  .select('id, fighter_effect_type_id');

// Batch insert all modifiers
const allModifiers = [];
effectTypes.forEach((effectType, index) => {
  const effectId = insertedEffects[index].id;
  effectType.fighter_effect_type_modifiers.forEach(modifier => {
    allModifiers.push({
      fighter_effect_id: effectId,
      stat_name: modifier.stat_name,
      numeric_value: modifier.default_numeric_value
    });
  });
});

if (allModifiers.length > 0) {
  await supabase.from('fighter_effect_modifiers').insert(allModifiers);
}
```

### 6. Constraints to Maintain

- **Keep all existing functionality** - Don't break any features
- **Maintain error handling** - Preserve try/catch blocks and error messages
- **Keep response format** - The function should return the same data structure
- **Preserve security** - Don't remove any permission checks
- **Keep cache invalidation** - Maintain all existing cache invalidation calls

### 7. Performance Goals

- **Target improvement**: Reduce equipment purchase time from ~2-3 seconds to ~500ms
- **Primary bottleneck**: Effect creation (currently ~70% of execution time)
- **Secondary bottleneck**: Sequential database queries

### 8. Testing Checklist

After refactoring, verify:
- [ ] Equipment purchase still works for fighters
- [ ] Equipment purchase still works for vehicles  
- [ ] Equipment purchase still works for gang stash
- [ ] Effects are properly applied and linked to equipment
- [ ] Effect modifiers are created correctly
- [ ] Gang credits are updated properly
- [ ] Fighter/gang rating is calculated correctly
- [ ] Error handling still works for invalid purchases
- [ ] Cache invalidation triggers properly

## Output Requirements

Provide the refactored `buyEquipmentForFighter` function with:
1. Clear comments showing where Promise.all is used
2. Simplified effect creation without RPC calls
3. Maintained functionality and error handling
4. Improved performance through parallelization
5. Clean, readable code structure

Focus on achieving maximum performance improvement while keeping the code maintainable and preserving all existing functionality.