'use client';

import React, { useState, useEffect } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";


interface FighterEffectModifier {
  id: string;
  stat_name: string;
  default_numeric_value: number;
}

interface FighterEffectType {
  id: string;
  effect_name: string;
  fighter_effect_category_id: string | null;
  type_specific_data: {
    equipment_id: string;
    effect_selection?: "fixed" | "single_select" | "multiple_select";
    max_selections?: number;
    selection_group?: string;
  } | null;
  modifiers: FighterEffectModifier[];
  fighter_effect_categories?: {
    id: string;
    category_name: string;
  };
}

interface FighterEffectSelectionProps {
  equipmentId: string;
  effectTypes: FighterEffectType[];
  onSelectionComplete: (selectedEffectIds: string[]) => void;
  onCancel: () => void;
  onValidityChange?: (isValid: boolean) => void;
}

const FighterEffectSelection = React.forwardRef<
  { handleConfirm: () => boolean; isValid: () => boolean },
  FighterEffectSelectionProps
>(({ equipmentId, effectTypes, onSelectionComplete, onCancel, onValidityChange }, ref) => {
  const [selectedEffects, setSelectedEffects] = useState<string[]>([]);

  // Auto-select fixed effects when component mounts
  useEffect(() => {
    const fixedEffects = effectTypes
      .filter(effect => 
        effect.type_specific_data?.effect_selection === 'fixed' || 
        !effect.type_specific_data?.effect_selection
      )
      .map(effect => effect.id);
    
    setSelectedEffects(fixedEffects);
  }, [effectTypes]);

  const handleEffectToggle = (effectId: string, effectType: FighterEffectType) => {
    const selectionType = effectType.type_specific_data?.effect_selection;
    
    if (selectionType === 'fixed') {
      // Fixed effects cannot be toggled
      return;
    }

    if (selectionType === 'single_select') {
      // For single select, find other effects in the same selection group and deselect them
      const selectionGroup = effectType.type_specific_data?.selection_group;
      const otherEffectsInSameGroup = effectTypes
        .filter(et => 
          et.id !== effectId && 
          et.type_specific_data?.effect_selection === 'single_select' &&
          et.fighter_effect_category_id === effectType.fighter_effect_category_id &&
          et.type_specific_data?.selection_group === selectionGroup
        )
        .map(et => et.id);

      setSelectedEffects(prev => {
        const newSelection = prev.filter(id => !otherEffectsInSameGroup.includes(id));
        
        if (prev.includes(effectId)) {
          return newSelection.filter(id => id !== effectId);
        } else {
          return [...newSelection, effectId];
        }
      });
    } else if (selectionType === 'multiple_select') {
      const maxSelections = effectType.type_specific_data?.max_selections || 1;
      
      setSelectedEffects(prev => {
        if (prev.includes(effectId)) {
          return prev.filter(id => id !== effectId);
        } else {
          // Count current selections of this type
          const currentSelectionsOfType = effectTypes
            .filter(et => 
              et.type_specific_data?.effect_selection === 'multiple_select' &&
              et.fighter_effect_category_id === effectType.fighter_effect_category_id
            )
            .map(et => et.id)
            .filter(id => prev.includes(id));

          if (currentSelectionsOfType.length >= maxSelections) {
            return prev;
          }

          return [...prev, effectId];
        }
      });
    }
  };

  const isEffectDisabled = (effectId: string, effectType: FighterEffectType) => {
    const selectionType = effectType.type_specific_data?.effect_selection;
    
    // Fixed effects are always disabled (auto-selected)
    if (selectionType === 'fixed' || !selectionType) {
      return true;
    }
    
    // If already selected, it's not disabled (user can deselect)
    if (selectedEffects.includes(effectId)) {
      return false;
    }
    
    // For multiple_select, check if we've reached the limit
    if (selectionType === 'multiple_select') {
      const maxSelections = effectType.type_specific_data?.max_selections || 1;
      
      // Count current selections of this type
      const currentSelectionsOfType = effectTypes
        .filter(et => 
          et.type_specific_data?.effect_selection === 'multiple_select' &&
          et.fighter_effect_category_id === effectType.fighter_effect_category_id
        )
        .map(et => et.id)
        .filter(id => selectedEffects.includes(id));

      return currentSelectionsOfType.length >= maxSelections;
    }
    
    // Single select effects are never disabled (they replace each other)
    return false;
  };

  const isValid = () => {
    // Group effects by category and selection group for validation
    const effectsByCategory = effectTypes.reduce((acc, effect) => {
      const categoryName = effect.fighter_effect_categories?.category_name || 'Uncategorized';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(effect);
      return acc;
    }, {} as Record<string, typeof effectTypes>);

    // Validate that each selection group has required selections
    for (const [categoryName, effects] of Object.entries(effectsByCategory)) {
      const effectsByGroup = effects.reduce((acc, effect) => {
        const selectionGroup = effect.type_specific_data?.selection_group || 'default';
        if (!acc[selectionGroup]) {
          acc[selectionGroup] = [];
        }
        acc[selectionGroup].push(effect);
        return acc;
      }, {} as Record<string, typeof effects>);

      for (const [groupKey, groupEffects] of Object.entries(effectsByGroup)) {
        const firstEffect = groupEffects[0];
        const selectionType = firstEffect.type_specific_data?.effect_selection || 'fixed';
        
        // Skip validation for fixed effects
        if (selectionType === 'fixed' || !firstEffect.type_specific_data?.effect_selection) {
          continue;
        }

        // Check if at least one effect is selected from this group
        const selectedFromGroup = groupEffects.filter(effect => selectedEffects.includes(effect.id));
        
        if (selectedFromGroup.length === 0) {
          return false;
        }

        // Validate max selections for multiple_select
        if (selectionType === 'multiple_select') {
          const maxSelections = firstEffect.type_specific_data?.max_selections || 1;
          if (selectedFromGroup.length > maxSelections) {
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleConfirm = () => {
    // Validation is already done by isValid(), so just proceed
    onSelectionComplete(selectedEffects);
    return true;
  };

  // Expose handleConfirm and isValid to parent component via ref
  React.useImperativeHandle(ref, () => ({
    handleConfirm,
    isValid
  }));

  // Notify parent when validity changes
  useEffect(() => {
    if (onValidityChange) {
      onValidityChange(isValid());
    }
  }, [selectedEffects, effectTypes, onValidityChange]);

  const renderEffectModifiers = (modifiers: FighterEffectModifier[]) => {
    return modifiers.map(modifier => {
      const formattedStatName = modifier.stat_name.replace(/_/g, ' ');
      const capitalizedStatName = formattedStatName.charAt(0).toUpperCase() + formattedStatName.slice(1);
      
      return (
        <div key={modifier.id}>
          {capitalizedStatName}: {modifier.default_numeric_value > 0 ? '+' : ''}{modifier.default_numeric_value}
        </div>
      );
    });
  };

  const getSelectionTypeLabel = (selectionType: string) => {
    switch (selectionType) {
      case 'fixed': return 'Auto-applied';
      case 'single_select': return 'Choose one';
      case 'multiple_select': return 'Choose multiple';
      default: return 'Unknown';
    }
  };

  const getSelectionTypeBadgeVariant = (selectionType: string) => {
    switch (selectionType) {
      case 'fixed': return 'default';
      case 'single_select': return 'secondary';
      case 'multiple_select': return 'outline';
      default: return 'default';
    }
  };



  if (effectTypes.length === 0) {
    // No effects for this equipment, proceed directly
    onSelectionComplete([]);
    return null;
  }

  // Group effects by category
  const effectsByCategory = effectTypes.reduce((acc, effect) => {
    const categoryName = effect.fighter_effect_categories?.category_name || 'Uncategorized';
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(effect);
    return acc;
  }, {} as Record<string, FighterEffectType[]>);

  // Check if there are any selectable effects (non-fixed)
  const hasSelectableEffects = effectTypes.some(et => 
    et.type_specific_data?.effect_selection !== 'fixed'
  );

  return (
    <div className="p-4 max-h-96 overflow-y-auto">
      {!hasSelectableEffects && (
        <p className="text-sm text-muted-foreground mb-4">
          This equipment has automatic effects that will be applied.
        </p>
      )}

      <div className="space-y-4">
        {Object.entries(effectsByCategory).map(([categoryName, effects]) => {
          // Group effects by selection group
          const effectsByGroup = effects.reduce((acc, effect) => {
            const selectionGroup = effect.type_specific_data?.selection_group || 'default';
            if (!acc[selectionGroup]) {
              acc[selectionGroup] = [];
            }
            acc[selectionGroup].push(effect);
            return acc;
          }, {} as Record<string, typeof effects>);

          return (
            <div key={categoryName}>
              {Object.entries(effectsByGroup).map(([groupKey, groupEffects]) => {
                const firstEffect = groupEffects[0];
                const selectionType = firstEffect.type_specific_data?.effect_selection || 'fixed';
                const maxSelections = firstEffect.type_specific_data?.max_selections;
                const hasSelectionGroup = firstEffect.type_specific_data?.selection_group;
                
                // Helper function to convert numbers to words
                const numberToWord = (num: number): string => {
                  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
                  return words[num] || num.toString();
                };

                // Create group instruction text
                let groupInstruction = '';
                if (selectionType === 'single_select' && groupEffects.length > 1) {
                  groupInstruction = 'Select one';
                } else if (selectionType === 'multiple_select' && groupEffects.length > 1) {
                  const selectCount = maxSelections || groupEffects.length;
                  groupInstruction = `Select ${numberToWord(selectCount)}`;
                }

                return (
                  <div key={`${categoryName}-${groupKey}`} className="space-y-2 mb-4">
                    {groupInstruction && (
                      <p className="text-sm font-medium text-muted-foreground mb-2">{groupInstruction}</p>
                    )}
                    
                    {groupEffects.map(effect => {
                      const isSelected = selectedEffects.includes(effect.id);
                      const isFixed = selectionType === 'fixed' || !effect.type_specific_data?.effect_selection;
                      const isDisabled = isEffectDisabled(effect.id, effect);

                      return (
                        <div 
                          key={effect.id}
                          className={`flex items-center gap-2 ${isDisabled ? 'opacity-50' : ''}`}
                        >
                          {!isFixed && (
                            selectionType === 'single_select' ? (
                              <input
                                type="radio"
                                name={`effect-group-${categoryName}-${groupKey}`}
                                checked={isSelected}
                                onChange={() => handleEffectToggle(effect.id, effect)}
                                disabled={isDisabled}
                              />
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleEffectToggle(effect.id, effect)}
                                disabled={isDisabled}
                              />
                            )
                          )}
                          
                          <div className="flex-1">
                            {effect.modifiers.length > 0 ? (
                              <div className="text-muted-foreground">
                                {renderEffectModifiers(effect.modifiers)}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span>{effect.effect_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

    </div>
  );
});

FighterEffectSelection.displayName = 'FighterEffectSelection';

export default FighterEffectSelection;