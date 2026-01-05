'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ImInfo } from "react-icons/im";
import { HiX } from "react-icons/hi";
import Modal from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from 'react-tooltip';
import { 
  FighterEffectType, 
  FighterEffectTypeModifier, 
  FighterEffectCategory 
} from "@/types/fighter-effect";

// Mapping of stat_name (database value) to display_name (UI label)
const STAT_MAPPINGS = [
  { stat_name: 'acc_long', display_name: 'Accuracy (Long)', short_name: 'Acc L', value_suffix: '+' },
  { stat_name: 'acc_short', display_name: 'Accuracy (Short)', short_name: 'Acc S', value_suffix: '+' },
  { stat_name: 'ammo', display_name: 'Ammo', short_name: 'Am', value_suffix: '' },
  { stat_name: 'ap', display_name: 'Armour Piercing', short_name: 'AP', value_suffix: '' },
  { stat_name: 'attacks', display_name: 'Attacks', short_name: 'A', value_suffix: '' },
  { stat_name: 'ballistic_skill', display_name: 'Ballistic Skill', short_name: 'BS', value_suffix: '+' },
  { stat_name: 'body_slots', display_name: 'Body Slots', short_name: 'Body Slots', value_suffix: '' },
  { stat_name: 'cool', display_name: 'Cool', short_name: 'Cl', value_suffix: '+' },
  { stat_name: 'damage', display_name: 'Damage', short_name: 'D', value_suffix: '' },
  { stat_name: 'drive_slots', display_name: 'Drive Slots', short_name: 'Drive Slots', value_suffix: '' },
  { stat_name: 'engine_slots', display_name: 'Engine Slots', short_name: 'Engine Slots', value_suffix: '' },
  { stat_name: 'front', display_name: 'Front', short_name: 'Fr', value_suffix: '' },
  { stat_name: 'handling', display_name: 'Handling', short_name: 'Hnd', value_suffix: '+' },
  { stat_name: 'hull_points', display_name: 'Hull Points', short_name: 'HP', value_suffix: '' },
  { stat_name: 'initiative', display_name: 'Initiative', short_name: 'I', value_suffix: '+' },
  { stat_name: 'intelligence', display_name: 'Intelligence', short_name: 'Int', value_suffix: '+' },
  { stat_name: 'leadership', display_name: 'Leadership', short_name: 'Ld', value_suffix: '+' },
  { stat_name: 'movement', display_name: 'Movement', short_name: 'M', value_suffix: '"' },
  { stat_name: 'range_long', display_name: 'Range (Long)', short_name: 'Rng L', value_suffix: '"' },
  { stat_name: 'range_short', display_name: 'Range (Short)', short_name: 'Rng S', value_suffix: '"' },
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

interface AdminFighterEffectsProps {
  equipmentId: string;
  isSkill?: boolean;
  fighterEffects?: FighterEffectType[];
  fighterEffectCategories?: FighterEffectCategory[];
  onUpdate?: () => void;
  onChange?: (effects: FighterEffectType[]) => void;
  hideEquipmentOption?: boolean; // Hide "Applies to Equipment" option (for injuries/glitches)
}

export function AdminFighterEffects({
  equipmentId,
  isSkill = false,
  fighterEffects = [],
  fighterEffectCategories = [],
  onUpdate,
  onChange,
  hideEquipmentOption = false
}: AdminFighterEffectsProps) {
  const [fighterEffectTypes, setFighterEffectTypes] = useState<FighterEffectType[]>(fighterEffects);
  const [categories, setCategories] = useState<FighterEffectCategory[]>(fighterEffectCategories);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddEffectDialog, setShowAddEffectDialog] = useState(false);
  const [showEditEffectDialog, setShowEditEffectDialog] = useState(false);
  const [editingEffect, setEditingEffect] = useState<FighterEffectType | null>(null);
  const [showAddModifierDialog, setShowAddModifierDialog] = useState(false);
  const [selectedEffectTypeId, setSelectedEffectTypeId] = useState<string | null>(null);
  
  // New effect form state
  const [newEffect, setNewEffect] = useState({
    effect_name: '',
    fighter_effect_category_id: '',
    applies_to: '' as '' | 'equipment',
    effect_selection: 'fixed' as 'fixed' | 'single_select' | 'multiple_select',
    max_selections: 1,
    selection_group: '',
    traits_to_add: '',
    traits_to_remove: '',
    credits_increase: '',
    is_editable: false
  });

  // New modifier form state
  const [newModifierStatName, setNewModifierStatName] = useState('');
  const [newModifierValue, setNewModifierValue] = useState<string>('');
  const [newModifierOperation, setNewModifierOperation] = useState<'add' | 'set'>('add');
  
  const { toast } = useToast();

  // Update local state when props change
  useEffect(() => {
    setFighterEffectTypes(fighterEffects);
  }, [fighterEffects]);

  useEffect(() => {
    setCategories(fighterEffectCategories);
  }, [fighterEffectCategories]);

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

    // Ensure we have a valid UUID
    if (!equipmentId || !isValidUUID(equipmentId)) {
      toast({
        description: "Invalid ID",
        variant: "destructive"
      });
      return false;
    }

    try {
      // Parse traits from comma-separated strings to arrays
      const traitsToAdd = newEffect.traits_to_add
        ? newEffect.traits_to_add.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      const traitsToRemove = newEffect.traits_to_remove
        ? newEffect.traits_to_remove.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const typeSpecificData: any = {
        ...(isSkill ? { skill_id: equipmentId } : { equipment_id: equipmentId }),
        ...(newEffect.applies_to && { applies_to: newEffect.applies_to }),
        effect_selection: newEffect.effect_selection,
        ...(newEffect.effect_selection === 'multiple_select' && { max_selections: newEffect.max_selections }),
        ...(newEffect.selection_group && { selection_group: newEffect.selection_group }),
        ...(traitsToAdd.length > 0 && { traits_to_add: traitsToAdd }),
        ...(traitsToRemove.length > 0 && { traits_to_remove: traitsToRemove }),
        ...(newEffect.credits_increase && { credits_increase: parseInt(newEffect.credits_increase) }),
        ...(newEffect.is_editable && { is_editable: true })
      };

      // Create effect with temp ID - will be saved when parent saves
      const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newEffectType: FighterEffectType = {
        id: tempId,
        effect_name: newEffect.effect_name,
        fighter_effect_category_id: newEffect.fighter_effect_category_id || null,
        type_specific_data: typeSpecificData,
        modifiers: []
      };

      const updatedEffects = [...fighterEffectTypes, newEffectType];
      setFighterEffectTypes(updatedEffects);

      // Notify parent of changes
      if (onChange) {
        onChange(updatedEffects);
      }

      setShowAddEffectDialog(false);
      setNewEffect({
        effect_name: '',
        fighter_effect_category_id: '',
        applies_to: '',
        effect_selection: 'fixed',
        max_selections: 1,
        selection_group: '',
        traits_to_add: '',
        traits_to_remove: '',
        credits_increase: '',
        is_editable: false
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

  const resetForm = () => {
    setNewEffect({
      effect_name: '',
      fighter_effect_category_id: '',
      applies_to: '',
      effect_selection: 'fixed',
      max_selections: 1,
      selection_group: '',
      traits_to_add: '',
      traits_to_remove: '',
      credits_increase: '',
      is_editable: false
    });
  };

  const handleEditEffect = (effect: FighterEffectType) => {
    setEditingEffect(effect);
    // Pre-populate form with current values
    setNewEffect({
      effect_name: effect.effect_name,
      fighter_effect_category_id: effect.fighter_effect_category_id || '',
      applies_to: effect.type_specific_data?.applies_to || '',
      effect_selection: effect.type_specific_data?.effect_selection || 'fixed',
      max_selections: effect.type_specific_data?.max_selections || 1,
      selection_group: effect.type_specific_data?.selection_group || '',
      traits_to_add: effect.type_specific_data?.traits_to_add?.join(', ') || '',
      traits_to_remove: effect.type_specific_data?.traits_to_remove?.join(', ') || '',
      credits_increase: effect.type_specific_data?.credits_increase?.toString() || '',
      is_editable: effect.type_specific_data?.is_editable === true
    });
    setShowEditEffectDialog(true);
  };

  const handleUpdateEffect = () => {
    if (!editingEffect) return false;

    if (!newEffect.effect_name) {
      toast({
        description: "Effect name is required",
        variant: "destructive"
      });
      return false;
    }

    // Parse traits from comma-separated strings to arrays
    const traitsToAdd = newEffect.traits_to_add
      ? newEffect.traits_to_add.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const traitsToRemove = newEffect.traits_to_remove
      ? newEffect.traits_to_remove.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // Build type_specific_data - explicitly set all fields to handle cleared values
    const typeSpecificData: any = {
      ...editingEffect.type_specific_data,
      effect_selection: newEffect.effect_selection,
      // Set applies_to to the value or remove it if empty
      ...(newEffect.applies_to ? { applies_to: newEffect.applies_to } : { applies_to: undefined }),
      // Set max_selections only for multiple_select
      ...(newEffect.effect_selection === 'multiple_select'
        ? { max_selections: newEffect.max_selections }
        : { max_selections: undefined }),
      // Set selection_group or remove it if empty
      ...(newEffect.selection_group ? { selection_group: newEffect.selection_group } : { selection_group: undefined }),
      // Set traits arrays - use empty arrays when cleared
      traits_to_add: traitsToAdd.length > 0 ? traitsToAdd : undefined,
      traits_to_remove: traitsToRemove.length > 0 ? traitsToRemove : undefined,
      // Set credits_increase or remove it if empty
      ...(newEffect.credits_increase ? { credits_increase: parseInt(newEffect.credits_increase) } : { credits_increase: undefined }),
      // Set is_editable or remove it if false
      ...(newEffect.is_editable ? { is_editable: true } : { is_editable: undefined })
    };

    // Clean undefined values from typeSpecificData
    Object.keys(typeSpecificData).forEach(key => {
      if (typeSpecificData[key] === undefined) {
        delete typeSpecificData[key];
      }
    });

    // Build the updated effect - just update local state, parent will save
    const updatedEffect: FighterEffectType = {
      ...editingEffect,
      effect_name: newEffect.effect_name,
      fighter_effect_category_id: newEffect.fighter_effect_category_id || null,
      type_specific_data: typeSpecificData
    };

    // Update local state
    const updatedEffects = fighterEffectTypes.map(e =>
      e.id === editingEffect.id ? updatedEffect : e
    );
    setFighterEffectTypes(updatedEffects);

    // Notify parent of changes
    if (onChange) {
      onChange(updatedEffects);
    }

    setShowEditEffectDialog(false);
    setEditingEffect(null);
    resetForm();

    if (onUpdate) {
      onUpdate();
    }

    return true;
  };

  const handleDeleteEffect = async (effectId: string) => {
    try {
      // Remove the effect from local state (will be saved when parent saves)
      const updatedEffects = fighterEffectTypes.filter(effect => effect.id !== effectId);
      setFighterEffectTypes(updatedEffects);

      // Notify parent of changes
      if (onChange) {
        onChange(updatedEffects);
      }

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
      const numericValue = newModifierValue ? parseFloat(newModifierValue) : 0;

      // Create modifier with temp ID - will be saved when parent saves
      const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newModifier: FighterEffectTypeModifier = {
        id: tempId,
        fighter_effect_type_id: selectedEffectTypeId,
        stat_name: newModifierStatName,
        default_numeric_value: numericValue,
        operation: newModifierOperation
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

      // Notify parent of changes
      if (onChange) {
        onChange(updatedEffectTypes);
      }

      setShowAddModifierDialog(false);
      setNewModifierStatName('');
      setNewModifierValue('');
      setNewModifierOperation('add');

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
      // Remove the modifier from local state (will be saved when parent saves)
      const updatedEffects = fighterEffectTypes.map(effect => {
        if (effect.id === effectId) {
          return {
            ...effect,
            modifiers: effect.modifiers.filter(mod => mod.id !== modifierId)
          };
        }
        return effect;
      });

      setFighterEffectTypes(updatedEffects);

      // Notify parent of changes
      if (onChange) {
        onChange(updatedEffects);
      }

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
    <>
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
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
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

                        {effect.type_specific_data?.applies_to === 'equipment' && (
                          <Badge variant="outline" className="border-blue-500 text-blue-600">
                            Equipment Modifier
                          </Badge>
                        )}

                        {effect.type_specific_data?.is_editable === true && (
                          <Badge variant="outline" className="border-orange-500 text-orange-600">
                            Editable After Purchase
                          </Badge>
                        )}

                        {effect.type_specific_data?.traits_to_add && effect.type_specific_data.traits_to_add.length > 0 && (
                          <Badge variant="default" className="bg-green-600">
                            Adds: {effect.type_specific_data.traits_to_add.join(', ')}
                          </Badge>
                        )}

                        {effect.type_specific_data?.traits_to_remove && effect.type_specific_data.traits_to_remove.length > 0 && (
                          <Badge variant="destructive">
                            Removes: {effect.type_specific_data.traits_to_remove.join(', ')}
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
                        onClick={() => handleEditEffect(effect)}
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                      >
                        Edit
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
                        {effect.modifiers.map((modifier) => {
                          const operation = modifier.operation || 'add';
                          return (
                            <div key={modifier.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                              <div>
                                <span className="font-medium">{getDisplayName(modifier.stat_name)}: </span>
                                <span>
                                  {modifier.default_numeric_value !== null
                                    ? (operation === 'add'
                                        ? (modifier.default_numeric_value > 0 ? '+' : '') + modifier.default_numeric_value
                                        : `Set to ${modifier.default_numeric_value}`)
                                    : 'N/A'}
                                 </span>
                                 {modifier.default_numeric_value !== null && (
                                   <span className="text-sm text-muted-foreground ml-2">
                                     {operation === 'add' ? (
                                       `(eg. ${getShortName(modifier.stat_name)} 4${getValueSuffix(modifier.stat_name)} → ${getShortName(modifier.stat_name)} ${4 + modifier.default_numeric_value}${getValueSuffix(modifier.stat_name)})`
                                     ) : (
                                       `(eg. ${getShortName(modifier.stat_name)} 4${getValueSuffix(modifier.stat_name)} → ${getShortName(modifier.stat_name)} ${modifier.default_numeric_value}${getValueSuffix(modifier.stat_name)})`
                                     )}
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
                                <HiX className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
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
      </div>

      {/* Add Effect Dialog */}
      {(showAddEffectDialog || showEditEffectDialog) && (
        <Modal
          title={editingEffect ? "Edit Fighter Effect" : "Add Fighter Effect"}
          onClose={() => {
            setShowAddEffectDialog(false);
            setShowEditEffectDialog(false);
            setEditingEffect(null);
            resetForm();
          }}
          onConfirm={editingEffect ? handleUpdateEffect : handleAddEffect}
          confirmText={editingEffect ? "Update Effect" : "Add Effect"}
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

            {!hideEquipmentOption && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={newEffect.applies_to === 'equipment'}
                    onCheckedChange={(checked) => setNewEffect(prev => ({
                      ...prev,
                      applies_to: checked === true ? 'equipment' : ''
                    }))}
                  />
                  <span className="text-sm font-medium">
                    Applies to Equipment
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Check this if this effect modifies weapon profiles of another piece of equipment (e.g., Hot-shot Las Pack removes "Plentiful" trait from lasguns)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={newEffect.is_editable}
                  onCheckedChange={(checked) => setNewEffect(prev => ({
                    ...prev,
                    is_editable: checked === true
                  }))}
                />
                <span className="text-sm font-medium">
                  Editable After Purchase
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Check this to hide this effect during purchase but show it in the edit equipment modal after purchase
              </p>
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

            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                Credits Increase (optional)
              </label>
              <Input
                type="number"
                min="0"
                value={newEffect.credits_increase}
                onChange={(e) => setNewEffect(prev => ({ ...prev, credits_increase: e.target.value }))}
                placeholder="e.g., 30"
              />
              <p className="text-xs text-muted-foreground">
                Credits added to fighter value when this effect is applied
              </p>
            </div>

            {newEffect.applies_to === 'equipment' && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Traits to Add (optional)
                  </label>
                  <Input
                    type="text"
                    value={newEffect.traits_to_add}
                    onChange={(e) => setNewEffect(prev => ({ ...prev, traits_to_add: e.target.value }))}
                    placeholder="e.g., Rapid Fire (1), Scarce"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter trait names separated by commas
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Traits to Remove (optional)
                  </label>
                  <Input
                    type="text"
                    value={newEffect.traits_to_remove}
                    onChange={(e) => setNewEffect(prev => ({ ...prev, traits_to_remove: e.target.value }))}
                    placeholder="e.g., Plentiful, Unwieldy"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter trait names separated by commas
                  </p>
                </div>
              </>
            )}
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
            setNewModifierOperation('add');
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
              <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                Operation *
                <ImInfo
                  className="h-4 w-4 text-muted-foreground cursor-help"
                  data-tooltip-id="operation-tooltip"
                />
              </label>
              <select
                value={newModifierOperation}
                onChange={(e) => setNewModifierOperation(e.target.value as 'add' | 'set')}
                className="w-full p-2 border rounded-md"
              >
                <option value="add">Add</option>
                <option value="set">Set</option>
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
                  {newModifierOperation === 'add' ? (
                    <>Example: {getShortName(newModifierStatName)} 4{getValueSuffix(newModifierStatName)} → {getShortName(newModifierStatName)} {4 + parseFloat(newModifierValue)}{getValueSuffix(newModifierStatName)}</>
                  ) : (
                    <>Example: {getShortName(newModifierStatName)} 4{getValueSuffix(newModifierStatName)} → {getShortName(newModifierStatName)} {parseFloat(newModifierValue)}{getValueSuffix(newModifierStatName)}</>
                  )}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      <Tooltip
        id="operation-tooltip"
        place="top"
        style={{ maxWidth: '300px', zIndex: 9999 }}
      >
        <div className="text-sm">
          <div className="mb-2">
            <strong>Add:</strong> Adds to the base value<br />
            <span className="text-xs">(e.g., +1 to strength)</span>
          </div>
          <div>
            <strong>Set:</strong> Overrides the base value completely<br />
            <span className="text-xs">(e.g., set strength to 5)</span>
          </div>
        </div>
      </Tooltip>
    </>
  );
} 