import { NextResponse } from 'next/server';
import { createClient } from "@/utils/supabase/server";
import { createGangLog } from "@/app/actions/logs/gang-logs";

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define types for our data structures
interface StatModification {
  stat_name: string;
  numeric_value: number;
}

interface CreateEffectRequest {
  fighter_id: string;
  stats: Record<string, number>;
}

interface EffectType {
  id: string;
  effect_name: string;
  fighter_effect_type_modifiers: Array<{
    id: string;
    stat_name: string;
    default_numeric_value: number;
  }>;
}

interface ExistingEffect {
  id: string;
  fighter_effect_type_id: string;
  fighter_effect_modifiers: Array<{
    id: string;
    stat_name: string;
    numeric_value: string;
  }>;
}

interface ModifierInfo {
  id: string;
  effect_id: string;
  stat_name: string;
  numeric_value: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { fighter_id, stats } = await request.json() as CreateEffectRequest;

    if (!fighter_id || !stats || Object.keys(stats).length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // First, get all effect types for user modifications
    const { data: effectTypes, error: typesError } = await supabase
      .from('fighter_effect_types')
      .select(`
        id,
        effect_name,
        fighter_effect_type_modifiers (
          id,
          stat_name,
          default_numeric_value
        )
      `)
      .eq('fighter_effect_category_id', '3d582ae1-2c18-4e1a-93a9-0c7c5731a96a');

    if (typesError) {
      console.error('Error fetching effect types:', typesError);
      throw typesError;
    }

    // Fetch existing user effects for this fighter
    const { data: existingEffects, error: fetchError } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        fighter_effect_type_id,
        fighter_effect_modifiers (
          id,
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_id', fighter_id)
      .eq('user_id', user.id)
      .in('fighter_effect_type_id', (effectTypes as EffectType[]).map(et => et.id));

    if (fetchError) {
      console.error('Error fetching existing effects:', fetchError);
      throw fetchError;
    }

    // Group existing modifiers by stat_name for quick lookup
    const existingModifiersByStat: Record<string, ModifierInfo[]> = {};
    (existingEffects as ExistingEffect[])?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        const statName = modifier.stat_name;
        if (!existingModifiersByStat[statName]) {
          existingModifiersByStat[statName] = [];
        }
        existingModifiersByStat[statName].push({
          id: modifier.id,
          effect_id: effect.id,
          stat_name: statName,
          numeric_value: parseInt(modifier.numeric_value)
        });
      });
    });

    // Track modifiers to delete and effects to delete
    const modifiersToDelete: string[] = [];
    const effectsToDelete: string[] = [];

    // Process each stat change
    for (const [statName, changeValue] of Object.entries(stats)) {
      if (changeValue === 0) continue;
      
      // Check if we have existing modifiers for this stat
      if (existingModifiersByStat[statName] && existingModifiersByStat[statName].length > 0) {
        
        // Find modifiers with the same sign as our change (for consolidation)
        const sameSignModifiers = existingModifiersByStat[statName].filter(
          mod => Math.sign(mod.numeric_value) === Math.sign(changeValue)
        );
        
        // Find modifiers with the opposite sign as our change (for cancellation)
        const oppositeSignModifiers = existingModifiersByStat[statName].filter(
          mod => Math.sign(mod.numeric_value) !== Math.sign(changeValue)
        );
        
        // Case 1: We have existing modifiers with the same sign - consolidate them
        if (sameSignModifiers.length > 0) {
          // Get the first modifier to update (we'll consolidate all into this one)
          const primaryMod = sameSignModifiers[0];
          const newValue = primaryMod.numeric_value + changeValue;
          
          // If the new value would be 0, delete this modifier instead of updating it
          if (newValue === 0) {
            modifiersToDelete.push(primaryMod.id);
            
            // Check if this was the only modifier for its effect
            const effect = (existingEffects as ExistingEffect[]).find(ef => ef.id === primaryMod.effect_id);
            if (effect && effect.fighter_effect_modifiers.length === 1) {
              effectsToDelete.push(effect.id);
            }
          } else {
            // Update the primary modifier with the new value
            const { error: updateModifierError } = await supabase
              .from('fighter_effect_modifiers')
              .update({
                numeric_value: newValue.toString()
              })
              .eq('id', primaryMod.id);

            if (updateModifierError) {
              console.error('Error updating modifier:', updateModifierError);
              throw updateModifierError;
            }
          }
          
          // Delete any other modifiers of the same sign (consolidate them)
          const otherSameSignModifiers = sameSignModifiers.slice(1);
          if (otherSameSignModifiers.length > 0) {
            modifiersToDelete.push(...otherSameSignModifiers.map(mod => mod.id));
            
            // Check if any of these were the only modifier for their effects
            otherSameSignModifiers.forEach(mod => {
              const effect = (existingEffects as ExistingEffect[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
            });
          }
          
          // We've handled this stat fully, continue to the next one
          continue;
        }
        
        // Case 2: We have modifiers with opposite signs - handle cancellation
        if (oppositeSignModifiers.length > 0) {
          let remainingChange = changeValue;
          
          // Process each opposite sign modifier until our change is fully applied
          for (const mod of oppositeSignModifiers) {
            // If these would cancel out completely
            if (Math.abs(mod.numeric_value) === Math.abs(remainingChange)) {
              modifiersToDelete.push(mod.id);
              
              // Check if this was the only modifier for its effect
              const effect = (existingEffects as ExistingEffect[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
              
              remainingChange = 0;
              break;
            }
            // If our change is smaller (partial cancellation)
            else if (Math.abs(remainingChange) < Math.abs(mod.numeric_value)) {
              // Calculate the new value properly preserving signs
              // mod.numeric_value and remainingChange have opposite signs
              const newValue = mod.numeric_value + remainingChange;
              
              // Update the modifier with the new value
              const { error: updateModifierError } = await supabase
                .from('fighter_effect_modifiers')
                .update({
                  numeric_value: newValue.toString()
                })
                .eq('id', mod.id);

              if (updateModifierError) {
                console.error('Error updating modifier:', updateModifierError);
                throw updateModifierError;
              }
              
              remainingChange = 0;
              break;
            }
            // If our change is larger (complete this cancellation and continue)
            else {
              modifiersToDelete.push(mod.id);
              
              // Check if this was the only modifier for its effect
              const effect = (existingEffects as ExistingEffect[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
              
              remainingChange += mod.numeric_value; // This will reduce the magnitude of remainingChange
            }
          }
          
          // If we still have remaining change value, create a new effect for it
          if (remainingChange !== 0 && !sameSignModifiers.length) {
            await createNewEffect(
              supabase,
              fighter_id,
              user.id,
              statName,
              remainingChange,
              effectTypes as EffectType[]
            );
          }
          
          // We've handled this stat fully, continue to the next one
          continue;
        }
      } else {
        // Case 3: No existing modifiers, create a new effect
        await createNewEffect(
          supabase,
          fighter_id,
          user.id,
          statName,
          changeValue,
          effectTypes as EffectType[]
        );
      }
    }
    
    console.log("Modifiers to delete:", modifiersToDelete);
    console.log("Effects to delete:", effectsToDelete);
    
    // Delete any modifiers we marked for deletion
    if (modifiersToDelete.length > 0) {
      const { error: deleteModifiersError } = await supabase
        .from('fighter_effect_modifiers')
        .delete()
        .in('id', modifiersToDelete);
        
      if (deleteModifiersError) {
        console.error('Error deleting modifiers:', deleteModifiersError);
        throw deleteModifiersError;
      }
    }
    
    // Delete any effects we marked for deletion
    if (effectsToDelete.length > 0) {
      const { error: deleteEffectsError } = await supabase
        .from('fighter_effects')
        .delete()
        .in('id', effectsToDelete);
        
      if (deleteEffectsError) {
        console.error('Error deleting effects:', deleteEffectsError);
        throw deleteEffectsError;
      }
    }

    // Fetch the complete updated fighter effects
    const { data: updatedEffects, error: fetchUpdatedError } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        effect_name,
        fighter_effect_type_id,
        fighter_effect_modifiers (
          id,
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_id', fighter_id)
      .eq('user_id', user.id)
      .in('fighter_effect_type_id', (effectTypes as EffectType[]).map(et => et.id));

    if (fetchUpdatedError) {
      console.error('Error fetching updated effects:', fetchUpdatedError);
      throw fetchUpdatedError;
    }

    // Log characteristic changes
    try {
      // Get fighter name and gang_id for logging
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('fighter_name, gang_id')
        .eq('id', fighter_id)
        .single();

      if (fighterData) {
        // Create a formatted list of stat changes
        const statChanges = Object.entries(stats)
          .filter(([_, value]) => value !== 0)
          .map(([statName, value]) => {
            const formattedStatName = statName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const sign = value > 0 ? '+' : '';
            return `${formattedStatName} ${sign}${value}`;
          })
          .join(', ');

        if (statChanges) {
          await createGangLog({
            gang_id: fighterData.gang_id,
            fighter_id: fighter_id,
            action_type: 'fighter_characteristic_changed',
            description: `Fighter "${fighterData.fighter_name}" characteristics manually adjusted: ${statChanges}`
          });
        }
      }
    } catch (logError) {
      console.error('Error logging characteristic changes:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      effects: updatedEffects
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ 
      error: "Failed to create fighter effect" 
    }, { status: 500 });
  }
}

// Helper function to create a new effect and modifier
async function createNewEffect(
  supabase: any,
  fighter_id: string,
  user_id: string,
  statName: string,
  changeValue: number,
  effectTypes: EffectType[]
) {
  // Find the appropriate effect type for this stat and change direction
  const effectType = effectTypes.find(et => 
    et.fighter_effect_type_modifiers.some(m => 
      m.stat_name === statName && 
      Math.sign(m.default_numeric_value) === Math.sign(changeValue)
    )
  );

  if (!effectType) {
    return;
  }

  // Create the effect
  const { data: newEffect, error: effectError } = await supabase
    .from('fighter_effects')
    .insert({
      fighter_id,
      fighter_effect_type_id: effectType.id,
      effect_name: effectType.effect_name,
      user_id
    })
    .select()
    .single();

  if (effectError) {
    console.error('Error creating effect:', effectError);
    throw effectError;
  }

  // Create the modifier - IMPORTANT: Use the actual changeValue, not its absolute value
  // This preserves the negative sign when needed
  const modifierData = {
    fighter_effect_id: newEffect.id,
    stat_name: statName,
    numeric_value: changeValue.toString()  // Remove Math.abs() to keep negative values
  };
  
  const { error: modifierError } = await supabase
    .from('fighter_effect_modifiers')
    .insert(modifierData);

  if (modifierError) {
    console.error('Error creating modifier:', modifierError);
    throw modifierError;
  }
  
  return newEffect;
} 