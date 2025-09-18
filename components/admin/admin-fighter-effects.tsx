'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";

// Mapping of stat_name (database value) to display_name (UI label)
const STAT_MAPPINGS = [
  { stat_name: 'attacks', display_name: 'Attacks', short_name: 'A', value_suffix: '' },
  { stat_name: 'ballistic_skill', display_name: 'Ballistic Skill', short_name: 'BS', value_suffix: '+' },
  { stat_name: 'body_slots', display_name: 'Body Slots', short_name: 'Body Slots', value_suffix: '' },
  { stat_name: 'cool', display_name: 'Cool', short_name: 'Cl', value_suffix: '+' },
  { stat_name: 'drive_slots', display_name: 'Drive Slots', short_name: 'Drive Slots', value_suffix: '' },
  { stat_name: 'engine_slots', display_name: 'Engine Slots', short_name: 'Engine Slots', value_suffix: '' },
  { stat_name: 'front', display_name: 'Front', short_name: 'Fr', value_suffix: '' },
  { stat_name: 'handling', display_name: 'Handling', short_name: 'Hnd', value_suffix: '+' },
  { stat_name: 'hull_points', display_name: 'Hull Points', short_name: 'HP', value_suffix: '' },
  { stat_name: 'initiative', display_name: 'Initiative', short_name: 'I', value_suffix: '+' },
  { stat_name: 'intelligence', display_name: 'Intelligence', short_name: 'Int', value_suffix: '+' },
  { stat_name: 'leadership', display_name: 'Leadership', short_name: 'Ld', value_suffix: '+' },
  { stat_name: 'movement', display_name: 'Movement', short_name: 'M', value_suffix: '"' },
  { stat_name: 'rear', display_name: 'Rear', short_name: 'Rr', value_suffix: '' },
  { stat_name: 'save', display_name: 'Save', short_name: 'Sv', value_suffix: '+' },
  { stat_name: 'side', display_name: 'Side', short_name: 'Sd', value_suffix: '' },
  { stat_name: 'strength', display_name: 'Strength', short_name: 'S', value_suffix: '' },
  { stat_name: 'toughness', display_name: 'Toughness', short_name: 'T', value_suffix: '' },
  { stat_name: 'weapon_skill', display_name: 'Weapon Skill', short_name: 'WS', value_suffix: '+' },
  { stat_name: 'willpower', display_name: 'Willpower', short_name: 'Wil', value_suffix: '+' },
  { stat_name: 'wounds', display_name: 'Wounds', short_name: 'W', value_suffix: '' }
];

// Helper function to get display name from stat name
const getDisplayName = (stat_name: string): string => {
  const mapping = STAT_MAPPINGS.find(m => m.stat_name === stat_name);
  return mapping ? mapping.display_name : stat_name;
};

// Helper function to get short name from stat name
const getShortName = (stat_name: string): string => {
  const mapping = STAT_MAPPINGS.find(m => m.stat_name === stat_name);
  return mapping ? mapping.short_name : stat_name;
};

// Helper function to get value suffix from stat name
const getValueSuffix = (stat_name: string): string => {
  const mapping = STAT_MAPPINGS.find(m => m.stat_name === stat_name);
  return mapping ? mapping.value_suffix : '';
};

interface FighterEffectTypeModifier {
  id?: string;
  fighter_effect_type_id?: string;
  stat_name: string;
  default_numeric_value: number | null;
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
  modifiers: FighterEffectTypeModifier[];
}

interface FighterEffectCategory {
  id: string;
  category_name: string;
}

interface AdminFighterEffectsProps {
  equipmentId: string;
  fighterEffects?: FighterEffectType[];
  fighterEffectCategories?: FighterEffectCategory[];
  onUpdate?: () => void;
  onChange?: (effects: FighterEffectType[]) => void;
}

export function AdminFighterEffects({ 
  equipmentId, 
  fighterEffects = [], 
  fighterEffectCategories = [],
  onUpdate, 
  onChange
}: AdminFighterEffectsProps) {
  const [fighterEffectTypes, setFighterEffectTypes] = useState<FighterEffectType[]>(fighterEffects);
  const [categories, setCategories] = useState<FighterEffectCategory[]>(fighterEffectCategories);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddEffectDialog, setShowAddEffectDialog] = useState(false);
  const [showAddModifierDialog, setShowAddModifierDialog] = useState(false);
  const [selectedEffectTypeId, setSelectedEffectTypeId] = useState<string | null>(null);
  
  // New effect form state
  const [newEffect, setNewEffect] = useState({
    effect_name: '',
    fighter_effect_category_id: '',
    effect_selection: 'fixed' as 'fixed' | 'single_select' | 'multiple_select',
    max_selections: 1,
    selection_group: ''
  });

  // New modifier form state
  const [newModifierStatName, setNewModifierStatName] = useState('');
  const [newModifierValue, setNewModifierValue] = useState<string>('');
  
  const { toast } = useToast();

  // Update local state when props change
  useEffect(() => {
    setFighterEffectTypes(fighterEffects);
  }, [fighterEffects]);

  useEffect(() => {
    setCategories(fighterEffectCategories);
  }, [fighterEffectCategories]);

  // Update parent component when effects change
  useEffect(() => {
    if (onChange) {
      onChange(fighterEffectTypes);
    }
  }, [fighterEffectTypes, onChange]);

  const handleAddEffect = async () => {
    if (!newEffect.effect_name) {
      toast({
        description: "Effect name is required",
        variant: "destructive"
      });
      return false;
    }

    if (newEffect.effect_selection === 'multiple_select' && (!newEffect.max_selections || newEffect.max_selections < 1)) {
      toast({
        description: "Max selections must be at least 1 for multiple select",
        variant: "destructive",
      });
      return false;
    }

    // Ensure we have a valid UUID for equipment_id
    if (!equipmentId || !isValidUUID(equipmentId)) {
      toast({
        description: "Invalid equipment ID",
        variant: "destructive"
      });
      return false;
    }

    try {
      // Create a new fighter effect locally
      const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const typeSpecificData = {
        equipment_id: equipmentId,
        effect_selection: newEffect.effect_selection,
        ...(newEffect.effect_selection === 'multiple_select' && { max_selections: newEffect.max_selections }),
        ...(newEffect.selection_group && { selection_group: newEffect.selection_group })
      };
      const newEffectType: FighterEffectType = {
        id: tempId,
        effect_name: newEffect.effect_name,
        fighter_effect_category_id: newEffect.fighter_effect_category_id || null,
        type_specific_data: typeSpecificData,
        modifiers: []
      };
      
      setFighterEffectTypes([...fighterEffectTypes, newEffectType]);
      
      setShowAddEffectDialog(false);
      setNewEffect({
        effect_name: '',
        fighter_effect_category_id: '',
        effect_selection: 'fixed',
        max_selections: 1,
        selection_group: ''
      });
      
      if (onUpdate) {
        onUpdate();
      }
      
      return true;
    } catch (error) {
      console.error('Error adding fighter effect:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to add fighter effect',
        variant: "destructive"
      });
      return false;
    }
  };

  // Helper function to validate UUID
  const isValidUUID = (uuid: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  };

  const handleDeleteEffect = async (effectId: string) => {
    try {
      // Simply remove the effect from the array
      setFighterEffectTypes(fighterEffectTypes.filter(effect => effect.id !== effectId));
      
      toast({
        description: "Fighter effect removed",
        variant: "default"
      });
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error deleting fighter effect:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete fighter effect',
        variant: "destructive"
      });
    }
  };

  const handleAddModifier = async () => {
    if (!selectedEffectTypeId) {
      toast({
        description: "No effect type selected",
        variant: "destructive"
      });
      return false;
    }
    
    if (!newModifierStatName) {
      toast({
        description: "Stat name is required",
        variant: "destructive"
      });
      return false;
    }
    
    try {
      // Convert modifier value to number if provided
      const numericValue = newModifierValue ? parseFloat(newModifierValue) : null;
      
      // Create a new modifier
      const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newModifier: FighterEffectTypeModifier = {
        id: tempId,
        fighter_effect_type_id: selectedEffectTypeId,
        stat_name: newModifierStatName,
        default_numeric_value: numericValue
      };
      
      // Find the effect type and add the new modifier to it
      const updatedEffectTypes = fighterEffectTypes.map(type => {
        if (type.id === selectedEffectTypeId) {
          return {
            ...type,
            modifiers: [...type.modifiers, newModifier]
          };
        }
        return type;
      });
      
      setFighterEffectTypes(updatedEffectTypes);
      setShowAddModifierDialog(false);
      setNewModifierStatName('');
      setNewModifierValue('');
      
      if (onUpdate) {
        onUpdate();
      }
      
      return true;
    } catch (error) {
      console.error('Error adding modifier:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to add effect modifier',
        variant: "destructive"
      });
      return false;
    }
  };

  const handleDeleteModifier = async (effectId: string, modifierId: string) => {
    try {
      // Simply remove the modifier from the effect
      setFighterEffectTypes(prevEffects => {
        return prevEffects.map(effect => {
          if (effect.id === effectId) {
            return {
              ...effect,
              modifiers: effect.modifiers.filter(mod => mod.id !== modifierId)
            };
          }
          return effect;
        });
      });
      
      toast({
        description: "Modifier removed",
        variant: "default"
      });
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error deleting modifier:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete modifier',
        variant: "destructive"
      });
    }
  };

  const getSelectionTypeLabel = (selectionType: string) => {
    switch (selectionType) {
      case 'fixed': return 'Fixed Effect';
      case 'single_select': return 'Single Select';
      case 'multiple_select': return 'Multiple Select';
      default: return 'Fixed Effect';
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

  return (
    <div className="space-y-4 mt-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Effects</h3>
        <Button
          onClick={() => setShowAddEffectDialog(true)}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          Add Effect
        </Button>
      </div>

      {/* List of Fighter Effect Types */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground italic">Loading...</div>
      ) : fighterEffectTypes.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-4">
          <p>No fighter effects associated with this equipment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fighterEffectTypes.map((effect) => {
            const selectionType = effect.type_specific_data?.effect_selection || 'fixed';
            
            return (
              <div key={effect.id} className="border rounded-md p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getSelectionTypeBadgeVariant(effect.type_specific_data?.effect_selection || 'fixed')}>
                        {getSelectionTypeLabel(effect.type_specific_data?.effect_selection || 'fixed')}
                        {effect.type_specific_data?.effect_selection === 'multiple_select' && 
                         effect.type_specific_data?.max_selections && 
                         ` (max ${effect.type_specific_data.max_selections})`}
                      </Badge>
                      
                      {effect.type_specific_data?.selection_group && (
                        <Badge variant="outline">
                          Group {effect.type_specific_data.selection_group}
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium">{effect.effect_name}</h4>
                     <p className="text-sm text-muted-foreground">
                      {categories.find(c => c.id === effect.fighter_effect_category_id)?.category_name || 'No category'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setSelectedEffectTypeId(effect.id);
                        setShowAddModifierDialog(true);
                      }}
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                    >
                      Add Modifier
                    </Button>
                    <Button
                      onClick={() => handleDeleteEffect(effect.id)}
                      variant="destructive"
                      size="sm"
                      disabled={isLoading}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {/* List of Modifiers */}
                {effect.modifiers.length > 0 ? (
                  <div className="mt-2">
                    <h5 className="text-sm font-medium mb-1">Modifiers:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {effect.modifiers.map((modifier) => (
                        <div key={modifier.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                          <div>
                            <span className="font-medium">{getDisplayName(modifier.stat_name)}: </span>
                            <span>
                              {modifier.default_numeric_value !== null 
                                ? (modifier.default_numeric_value > 0 ? '+' : '') + modifier.default_numeric_value
                                : 'N/A'}
                             </span>
                             {modifier.default_numeric_value !== null && (
                               <span className="text-sm text-muted-foreground ml-2">
                                 (eg. {getShortName(modifier.stat_name)} 4{getValueSuffix(modifier.stat_name)} → {getShortName(modifier.stat_name)} {4 + modifier.default_numeric_value}{getValueSuffix(modifier.stat_name)})
                               </span>
                             )}
                          </div>
                          <Button
                            onClick={() => handleDeleteModifier(effect.id, modifier.id!)}
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={isLoading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No modifiers for this effect.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Effect Dialog */}
      {showAddEffectDialog && (
        <Modal
          title="Add Fighter Effect"
          onClose={() => {
            setShowAddEffectDialog(false);
            setNewEffect({
              effect_name: '',
              fighter_effect_category_id: '',
              effect_selection: 'fixed',
              max_selections: 1,
              selection_group: ''
            });
          }}
          onConfirm={handleAddEffect}
          confirmText="Add Effect"
          confirmDisabled={isLoading || !newEffect.effect_name}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Effect Name *</label>
              <Input
                type="text"
                value={newEffect.effect_name}
                onChange={(e) => setNewEffect(prev => ({ ...prev, effect_name: e.target.value }))}
                placeholder="E.g. Increases Movement"
              />
            </div>



            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={newEffect.fighter_effect_category_id}
                onChange={(e) => setNewEffect(prev => ({ ...prev, fighter_effect_category_id: e.target.value }))}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Selection Type *</label>
              <select
                value={newEffect.effect_selection}
                onChange={(e) => setNewEffect(prev => ({ ...prev, effect_selection: e.target.value as "fixed" | "single_select" | "multiple_select" }))}
                className="w-full p-2 border rounded-md"
              >
                <option value="fixed">Fixed</option>
                <option value="single_select">Single Select</option>
                <option value="multiple_select">Multiple Select</option>
              </select>
            </div>

            {newEffect.effect_selection === 'multiple_select' && (
              <div>
                <label className="block text-sm font-medium mb-1">Max Selections *</label>
                <Input
                  type="number"
                  min="1"
                  value={newEffect.max_selections.toString()}
                  onChange={(e) => setNewEffect(prev => ({ ...prev, max_selections: parseInt(e.target.value) || 1 }))}
                  placeholder="Maximum number of effects user can select"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This applies to all multiple_select effects on this equipment
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                Selection Group (optional)
              </label>
              <input
                type="text"
                value={newEffect.selection_group}
                onChange={(e) => setNewEffect(prev => ({ ...prev, selection_group: e.target.value }))}
                placeholder="Enter selection group name"
                className="w-full p-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Effects with the same selection group are mutually exclusive within single_select mode
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Modifier Dialog */}
      {showAddModifierDialog && (
        <Modal
          title="Add Modifier"
          helper="Fields marked with * are required."
          onClose={() => {
            setShowAddModifierDialog(false);
            setNewModifierStatName('');
            setNewModifierValue('');
          }}
          onConfirm={handleAddModifier}
          confirmText="Add Modifier"
          confirmDisabled={isLoading || !newModifierStatName}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Characteristic *</label>
              <select
                value={newModifierStatName}
                onChange={(e) => setNewModifierStatName(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a Characteristic</option>
                {STAT_MAPPINGS.map((stat) => (
                  <option key={stat.stat_name} value={stat.stat_name}>
                    {stat.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <Input
                type="number"
                value={newModifierValue}
                onChange={(e) => setNewModifierValue(e.target.value)}
                placeholder="Examples: 1, -1, 2"
              />
              {newModifierStatName && newModifierValue && (
                <p className="text-xs text-muted-foreground mt-1">
                  Example: {getShortName(newModifierStatName)} 4{getValueSuffix(newModifierStatName)} → {getShortName(newModifierStatName)} {4 + parseFloat(newModifierValue)}{getValueSuffix(newModifierStatName)}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
} 