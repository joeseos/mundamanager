'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X } from "lucide-react";
import Modal from "@/components/modal";

// Mapping of stat_name (database value) to display_name (UI label)
const STAT_MAPPINGS = [
  { stat_name: 'attacks', display_name: 'Attacks' },
  { stat_name: 'ballistic_skill', display_name: 'Ballistic Skill' },
  { stat_name: 'cool', display_name: 'Cool' },
  { stat_name: 'front', display_name: 'Front' },
  { stat_name: 'handling', display_name: 'Handling' },
  { stat_name: 'hull_points', display_name: 'Hull Points' },
  { stat_name: 'initiative', display_name: 'Initiative' },
  { stat_name: 'intelligence', display_name: 'Intelligence' },
  { stat_name: 'leadership', display_name: 'Leadership' },
  { stat_name: 'movement', display_name: 'Movement' },
  { stat_name: 'rear', display_name: 'Rear' },
  { stat_name: 'save', display_name: 'Save' },
  { stat_name: 'side', display_name: 'Side' },
  { stat_name: 'strength', display_name: 'Strength' },
  { stat_name: 'toughness', display_name: 'Toughness' },
  { stat_name: 'weapon_skill', display_name: 'Weapon Skill' },
  { stat_name: 'willpower', display_name: 'Willpower' },
  { stat_name: 'wounds', display_name: 'Wounds' }
];

// Helper function to get display name from stat name
const getDisplayName = (stat_name: string): string => {
  const mapping = STAT_MAPPINGS.find(m => m.stat_name === stat_name);
  return mapping ? mapping.display_name : stat_name;
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
  } | null;
  modifiers: FighterEffectTypeModifier[];
}

interface FighterEffectCategory {
  id: string;
  category_name: string;
}

interface AdminFighterEffectsProps {
  equipmentId: string;
  onUpdate?: () => void;
  onChange?: (effects: FighterEffectType[]) => void;
}

export function AdminFighterEffects({ equipmentId, onUpdate, onChange }: AdminFighterEffectsProps) {
  const [fighterEffectTypes, setFighterEffectTypes] = useState<FighterEffectType[]>([]);
  const [categories, setCategories] = useState<FighterEffectCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddEffectDialog, setShowAddEffectDialog] = useState(false);
  const [showAddModifierDialog, setShowAddModifierDialog] = useState(false);
  const [selectedEffectTypeId, setSelectedEffectTypeId] = useState<string | null>(null);
  
  // New effect form state
  const [newEffectName, setNewEffectName] = useState('');
  const [newEffectCategoryId, setNewEffectCategoryId] = useState('');
  
  // New modifier form state
  const [newModifierStatName, setNewModifierStatName] = useState('');
  const [newModifierValue, setNewModifierValue] = useState<string>('');
  
  const { toast } = useToast();

  // Update parent component when effects change
  useEffect(() => {
    if (onChange) {
      onChange(fighterEffectTypes);
    }
  }, [fighterEffectTypes, onChange]);

  // Fetch fighter effect types associated with this equipment
  useEffect(() => {
    const fetchFighterEffects = async () => {
      if (!equipmentId) {
        console.log('No equipment ID provided');
        return;
      }
      
      // Validate equipment ID format
      if (!isValidUUID(equipmentId)) {
        console.error('Invalid equipment ID format:', equipmentId);
        toast({
          description: `Invalid equipment ID format: ${equipmentId}`,
          variant: "destructive"
        });
        return;
      }
      
      console.log('Equipment ID:', equipmentId);
      console.log('Equipment ID type:', typeof equipmentId);
      console.log('Equipment ID length:', equipmentId.length);
      
      setIsLoading(true);
      try {
        console.log('Fetching fighter effects for equipment ID:', equipmentId);
        const response = await fetch(`/api/admin/fighter-effects?equipment_id=${encodeURIComponent(equipmentId)}`);
        
        console.log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          // Try to get the detailed error message
          const errorText = await response.text();
          console.error('Response body text:', errorText);
          
          let errorData: { error?: string } = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            console.error('Failed to parse error response as JSON');
          }
          
          // If there's a specific error about the JSON format, inform the user
          if (errorText.includes('invalid input syntax for type json')) {
            toast({
              description: "Database issue with JSON filtering. Initializing empty list.",
              variant: "default"
            });
            setFighterEffectTypes([]);
            setIsLoading(false);
            return;
          }
          
          console.error('Error data:', errorData);
          throw new Error(
            errorData.error || 
            `Failed to fetch fighter effects: ${response.status} ${response.statusText}`
          );
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        setFighterEffectTypes(data);
      } catch (error) {
        console.error('Error fetching fighter effects:', error);
        toast({
          description: error instanceof Error ? error.message : 'Failed to load fighter effects',
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchFighterEffects();
  }, [equipmentId, toast]);

  // Fetch fighter effect categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/admin/fighter-effects?categories=true');
        if (!response.ok) {
          const errorData = await response.json() as any;
          throw new Error(errorData.error || 'Failed to fetch categories');
        }
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast({
          description: error instanceof Error ? error.message : 'Failed to load effect categories',
          variant: "destructive"
        });
      }
    };

    fetchCategories();
  }, [toast]);

  const handleAddEffect = async () => {
    if (!newEffectName) {
      toast({
        description: "Effect name is required",
        variant: "destructive"
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
      const newEffect: FighterEffectType = {
        id: tempId,
        effect_name: newEffectName,
        fighter_effect_category_id: newEffectCategoryId || null,
        type_specific_data: {
          equipment_id: equipmentId
        },
        modifiers: []
      };
      
      setFighterEffectTypes([...fighterEffectTypes, newEffect]);
      
      setShowAddEffectDialog(false);
      setNewEffectName('');
      setNewEffectCategoryId('');
      
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
    if (!confirm('Are you sure you want to delete this effect?')) return;
    
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
    if (!confirm('Are you sure you want to delete this modifier?')) return;
    
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

  return (
    <div className="space-y-4 mt-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Fighter Effects</h3>
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
        <div className="text-sm text-gray-500 italic">Loading...</div>
      ) : fighterEffectTypes.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-4">
          <p>No fighter effects associated with this equipment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fighterEffectTypes.map((effect) => (
            <div key={effect.id} className="border rounded-md p-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h4 className="font-medium">{effect.effect_name}</h4>
                  <p className="text-sm text-gray-500">
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
                      <div key={modifier.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                        <div>
                          <span className="font-medium">{getDisplayName(modifier.stat_name)}: </span>
                          <span>{modifier.default_numeric_value !== null ? modifier.default_numeric_value : 'N/A'}</span>
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
                <p className="text-sm text-gray-500 italic">No modifiers for this effect.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Effect Dialog */}
      {showAddEffectDialog && (
        <Modal
          title="Add Fighter Effect"
          onClose={() => {
            setShowAddEffectDialog(false);
            setNewEffectName('');
            setNewEffectCategoryId('');
          }}
          onConfirm={handleAddEffect}
          confirmText="Add Effect"
          confirmDisabled={isLoading || !newEffectName}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Effect Name *</label>
              <Input
                type="text"
                value={newEffectName}
                onChange={(e) => setNewEffectName(e.target.value)}
                placeholder="E.g. Increases Movement"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={newEffectCategoryId}
                onChange={(e) => setNewEffectCategoryId(e.target.value)}
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
          </div>
        </Modal>
      )}

      {/* Add Modifier Dialog */}
      {showAddModifierDialog && (
        <Modal
          title="Add Modifier"
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
              <label className="block text-sm font-medium mb-1">Stat *</label>
              <select
                value={newModifierStatName}
                onChange={(e) => setNewModifierStatName(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a stat</option>
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
                placeholder="Examples: 1, 2, 3"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
} 