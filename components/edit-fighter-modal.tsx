import { useState, useMemo, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterEffect, FighterProps as Fighter, FIGHTER_CLASSES, FighterClass } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { fighterClassRank } from '@/utils/fighterClassRank';

// FighterCharacteristicTable defined within the same file
function FighterCharacteristicTable({ fighter }: { fighter: Fighter }) {
  // Define the stats to display
  const stats = [
    { key: 'movement', label: 'M' },
    { key: 'weapon_skill', label: 'WS' },
    { key: 'ballistic_skill', label: 'BS' },
    { key: 'strength', label: 'S' },
    { key: 'toughness', label: 'T' },
    { key: 'wounds', label: 'W' },
    { key: 'initiative', label: 'I' },
    { key: 'attacks', label: 'A' },
    { key: 'leadership', label: 'Ld' },
    { key: 'cool', label: 'Cl' },
    { key: 'willpower', label: 'Wil' },
    { key: 'intelligence', label: 'Int' }
  ];

  // IMPORTANT FIX: Get base values from original fighter properties directly
  const getStat = (fighter: Fighter, key: string): number => {
    // Return original base values from fighter object
    return fighter[key as keyof Fighter] as number || 0;
  };

  // Calculate injury effects
  const injuryEffects = useMemo(() => {
    const effects: Record<string, number> = {};
    fighter.effects?.injuries?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        const statName = modifier.stat_name.toLowerCase();
        const numValue = parseInt(modifier.numeric_value.toString());
        effects[statName] = (effects[statName] || 0) + numValue;
      });
    });
    return effects;
  }, [fighter.effects?.injuries]);

  // Calculate advancement effects
  const advancementEffects = useMemo(() => {
    const effects: Record<string, number> = {};
    fighter.effects?.advancements?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        const statName = modifier.stat_name.toLowerCase();
        const numValue = parseInt(modifier.numeric_value.toString());
        effects[statName] = (effects[statName] || 0) + numValue;
      });
    });
    return effects;
  }, [fighter.effects?.advancements]);

  // Calculate user effects
  const userEffects = useMemo(() => {
    const effects: Record<string, number> = {};
    fighter.effects?.user?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        const statName = modifier.stat_name.toLowerCase();
        const numValue = parseInt(modifier.numeric_value.toString());
        effects[statName] = (effects[statName] || 0) + numValue;
      });
    });
    return effects;
  }, [fighter.effects?.user]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-1 py-1 border text-xs bg-gray-100">Type</th>
            {stats.map(stat => (
              <th key={stat.key} className="px-1 py-1 border text-center text-xs bg-gray-100">{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Base row - IMPORTANT FIX: Display only original base values */}
          <tr className="bg-gray-50">
            <td className="px-1 py-1 border font-medium text-xs">Base</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              
              return (
                <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                  {stat.key === 'movement' ? `${baseValue}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' || 
                   stat.key === 'strength' || stat.key === 'toughness' ? 
                   baseValue : 
                   `${baseValue}+`}
                </td>
              );
            })}
          </tr>
          
          {/* Injury row */}
          <tr className="bg-red-50">
            <td className="px-1 py-1 border font-medium text-xs">Injuries</td>
            {stats.map(stat => (
              <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                {injuryEffects[stat.key] ? injuryEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* Advancements row */}
          <tr className="bg-green-50">
            <td className="px-1 py-1 border font-medium text-xs">Adv.</td>
            {stats.map(stat => (
              <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                {advancementEffects[stat.key] ? advancementEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* User row */}
          <tr className="bg-blue-50">
            <td className="px-1 py-1 border font-medium text-xs">User</td>
            {stats.map(stat => (
              <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                {userEffects[stat.key] ? userEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* Total row */}
          <tr className="bg-gray-100 font-bold">
            <td className="px-1 py-1 border text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              const injuryValue = injuryEffects[stat.key] || 0;
              const advancementValue = advancementEffects[stat.key] || 0;
              const userValue = userEffects[stat.key] || 0;
              const total = baseValue + injuryValue + advancementValue + userValue;
              
              return (
                <td key={stat.key} className="px-1 py-1 border text-center text-xs">
                  {stat.key === 'movement' ? `${total}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' || 
                   stat.key === 'strength' || stat.key === 'toughness' ? 
                   total : 
                   `${total}+`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Define StatKey type and Stat interface for the new stats modal
type StatKey = "M" | "WS" | "BS" | "S" | "T" | "W" | "I" | "A" | "Ld" | "Cl" | "Wil" | "Int";

interface Stat {
  key: StatKey;
  name: string;
  value: string;
}

// Character Stats Modal component - update title and close button
function CharacterStatsModal({ 
  onClose, 
  fighter,
  onUpdateStats,
  isSaving = false
}: { 
  onClose: () => void;
  fighter: Fighter;
  onUpdateStats: (stats: Record<string, number>) => void;
  isSaving?: boolean;
}) {
  // Keep track of the user's adjustments separately from the base values
  const [adjustments, setAdjustments] = useState<Record<string, number>>({
    movement: 0,
    weapon_skill: 0,
    ballistic_skill: 0,
    strength: 0,
    toughness: 0,
    wounds: 0,
    initiative: 0,
    attacks: 0,
    leadership: 0,
    cool: 0,
    willpower: 0,
    intelligence: 0
  });
  
  // Map fighter stats to our format for display
  const displayStats = useMemo((): Stat[] => {
    return [
      { key: "M", name: "Movement", value: `${fighter.movement}"` },
      { key: "WS", name: "Weapon Skill", value: `${fighter.weapon_skill}+` },
      { key: "BS", name: "Ballistic Skill", value: `${fighter.ballistic_skill}+` },
      { key: "S", name: "Strength", value: `${fighter.strength}` },
      { key: "T", name: "Toughness", value: `${fighter.toughness}` },
      { key: "W", name: "Wounds", value: `${fighter.wounds}` },
      { key: "I", name: "Initiative", value: `${fighter.initiative}+` },
      { key: "A", name: "Attacks", value: `${fighter.attacks}` },
      { key: "Ld", name: "Leadership", value: `${fighter.leadership}+` },
      { key: "Cl", name: "Coolness", value: `${fighter.cool}+` },
      { key: "Wil", name: "Willpower", value: `${fighter.willpower}+` },
      { key: "Int", name: "Intelligence", value: `${fighter.intelligence}+` },
    ];
  }, [fighter]);

  // Get the property name from the stat key
  const getPropertyName = (key: StatKey): string => {
    switch (key) {
      case "M": return "movement";
      case "WS": return "weapon_skill";
      case "BS": return "ballistic_skill";
      case "S": return "strength";
      case "T": return "toughness";
      case "W": return "wounds";
      case "I": return "initiative";
      case "A": return "attacks";
      case "Ld": return "leadership";
      case "Cl": return "cool";
      case "Wil": return "willpower";
      case "Int": return "intelligence";
      default: return "";
    }
  };
  
  // Handle increasing a stat
  const handleIncrease = (key: StatKey) => {
    const propName = getPropertyName(key);
    setAdjustments(prev => ({
      ...prev,
      [propName]: prev[propName] + 1
    }));
  };
  
  // Handle decreasing a stat
  const handleDecrease = (key: StatKey) => {
    const propName = getPropertyName(key);
    setAdjustments(prev => {
      // Only decrease if the adjusted base value would remain above 1
      const baseValue = fighter[propName as keyof Fighter] as number;
      if (baseValue + prev[propName] > 1) {
        return {
          ...prev,
          [propName]: prev[propName] - 1
        };
      }
      return prev;
    });
  };

  // IMPORTANT: The base values should be the fighter's original stats
  const getBaseValue = (key: StatKey): number => {
    const propName = getPropertyName(key);
    return fighter[propName as keyof Fighter] as number;
  };
  
  // This function now correctly gets the total including ALL modifiers
  // but does NOT include our adjustments (those are handled separately)
  const getCurrentTotal = (key: StatKey): number => {
    const propName = getPropertyName(key);
    
    // Get base value
    const baseValue = fighter[propName as keyof Fighter] as number;
    
    // Get all modifiers from effects (injuries, advancements, user effects)
    let modifiers = 0;
    
    // Process all effect types
    const processEffects = (effects: FighterEffect[] | undefined) => {
      effects?.forEach(effect => {
        effect.fighter_effect_modifiers?.forEach(modifier => {
          if (modifier.stat_name.toLowerCase() === propName.toLowerCase()) {
            modifiers += parseInt(modifier.numeric_value.toString());
          }
        });
      });
    };
    
    processEffects(fighter.effects?.injuries);
    processEffects(fighter.effects?.advancements);
    processEffects(fighter.effects?.bionics);
    processEffects(fighter.effects?.cybernetics);
    processEffects(fighter.effects?.user);
    
    // Return total (base + existing modifiers)
    return baseValue + modifiers;
  };
  
  // This function gets what the new total will be after our adjustments
  const getAdjustedTotal = (key: StatKey): string => {
    const propName = getPropertyName(key);
    
    // Start with the current total (including all existing modifiers)
    const currentTotal = getCurrentTotal(key);
    
    // Add our new adjustment
    const withAdjustment = currentTotal + (adjustments[propName] || 0);
    
    // Format based on stat type
    if (key === "M") return `${withAdjustment}"`;
    if (key === "W" || key === "A" || key === "S" || key === "T") return `${withAdjustment}`;
    return `${withAdjustment}+`;
  };
  
  // Get the base display value (without any adjustments)
  const getBaseDisplay = (key: StatKey): string => {
    const baseValue = getBaseValue(key);
    
    // Format the base value appropriately
    if (key === "M") return `${baseValue}"`;
    if (key === "W" || key === "A" || key === "S" || key === "T") return `${baseValue}`;
    return `${baseValue}+`;
  };
  
  const handleSave = () => {
    // Only include stats that have been adjusted
    const updatedStats: Record<string, number> = {};
    
    Object.entries(adjustments).forEach(([propName, adjustment]) => {
      if (adjustment !== 0) {
        // IMPORTANT: We're sending the adjustment directly, NOT the new base value
        // This ensures we're creating user effects, not modifying base stats
        updatedStats[propName] = adjustment;
      }
    });
    
    // Only call if there are actual changes
    if (Object.keys(updatedStats).length > 0) {
      onUpdateStats(updatedStats);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={isSaving ? undefined : onClose}></div>
      <div className="bg-white rounded-lg max-w-[700px] w-full shadow-xl relative z-[101]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-2xl font-bold">Adjust Characteristics</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {displayStats.map((stat) => {
              const propName = getPropertyName(stat.key);
              const adjustment = adjustments[propName] || 0;
              return (
                <div key={stat.key} className="border rounded-lg p-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm md:text-xl font-bold">{stat.key}</h3>
                    <span className="text-xs text-gray-500">{stat.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-md"
                      onClick={() => handleDecrease(stat.key)}
                      disabled={isSaving || (fighter[propName as keyof Fighter] as number) + adjustment <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex flex-col items-center">
                      {/* Display TOTAL value as the large, primary value */}
                      <span className="text-sm md:text-xl font-bold">
                        {getAdjustedTotal(stat.key)}
                      </span>
                      {/* Display BASE value without the adjustment */}
                      <span className="text-xs text-gray-500">
                        Base: {getBaseDisplay(stat.key)}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-md"
                      onClick={() => handleIncrease(stat.key)}
                      disabled={isSaving}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end p-4 border-t gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Add helper functions to calculate stat modifiers and get base values
function calculateStatModifiers(fighter: Fighter, statKey: string): number {
  let totalModifier = 0;
  
  // Process all effect types
  const processEffects = (effects: FighterEffect[] | undefined) => {
    effects?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        if (modifier.stat_name.toLowerCase() === statKey.toLowerCase()) {
          totalModifier += parseInt(modifier.numeric_value.toString());
        }
      });
    });
  };
  
  // Process each type of effect
  processEffects(fighter.effects?.injuries);
  processEffects(fighter.effects?.advancements);
  processEffects(fighter.effects?.bionics);
  processEffects(fighter.effects?.cybernetics);
  processEffects(fighter.effects?.user);
  
  return totalModifier;
}

function getBaseValue(fighter: Fighter, key: StatKey): number {
  switch (key) {
    case "M": return fighter.movement;
    case "WS": return fighter.weapon_skill;
    case "BS": return fighter.ballistic_skill;
    case "S": return fighter.strength;
    case "T": return fighter.toughness;
    case "W": return fighter.wounds;
    case "I": return fighter.initiative;
    case "A": return fighter.attacks;
    case "Ld": return fighter.leadership;
    case "Cl": return fighter.cool;
    case "Wil": return fighter.willpower;
    case "Int": return fighter.intelligence;
    default: return 0;
  }
}

// Add this shared helper function above both component definitions
function calculateTotalStat(fighter: Fighter, statKey: string, baseOverride?: number): number {
  // Use provided base value or get from fighter
  const baseValue = baseOverride !== undefined ? 
    baseOverride : 
    getBaseValue(fighter, statKey as StatKey);
  
  // Get sum of all modifiers
  const modifiers = calculateStatModifiers(fighter, statKey);
  
  // Return total
  return baseValue + modifiers;
}

// Safe function to create a temporary effect for optimistic updates
const createTempEffect = (statName: string, adjustment: number): FighterEffect => {
  // Create a temporary effect ID
  const tempEffectId = `temp-${statName}-${Date.now()}`;
  
  // Create a properly structured temporary effect
  return {
    id: tempEffectId,
    effect_name: adjustment > 0 ? 'Increase' : 'Decrease',
    fighter_effect_type_id: 'temp-type-id', // Required by the type
    fighter_effect_modifiers: [{
      id: `temp-mod-${statName}-${Date.now()}`,
      fighter_effect_id: tempEffectId, // Required by the type
      stat_name: statName,
      numeric_value: adjustment // Ensure this is a number
    }]
  } as FighterEffect;
};

interface EditFighterModalProps {
  fighter: Fighter;
  isOpen: boolean;
  initialValues: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
  };
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
    fighter_class?: string;
    special_rules?: string[];
    stats?: Record<string, number>;
  }) => Promise<boolean>;
  onStatsUpdate?: (updatedFighter: Fighter) => void;
}

export function EditFighterModal({
  fighter,
  isOpen,
  initialValues,
  onClose,
  onSubmit,
  onStatsUpdate
}: EditFighterModalProps) {
  // Add console logging to inspect the fighter object structure
  console.log('Fighter object:', JSON.stringify(fighter, null, 2));

  // Update form state to correctly access special_rules based on the Fighter interface
  const [formValues, setFormValues] = useState({
    name: initialValues.name,
    label: initialValues.label,
    kills: initialValues.kills,
    costAdjustment: initialValues.costAdjustment,
    fighter_class: fighter.fighter_class || '',
    // Try different possible locations for special_rules
    special_rules: Array.isArray(fighter.special_rules) ? fighter.special_rules : [], 
    stats: {} as Record<string, number>
  });
  
  // Add state for new special rule input
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Add handler for adding a special rule
  const handleAddSpecialRule = () => {
    if (!newSpecialRule.trim()) return;
    
    // Avoid duplicates
    if (formValues.special_rules.includes(newSpecialRule.trim())) {
      setNewSpecialRule('');
      return;
    }
    
    setFormValues(prev => ({
      ...prev,
      special_rules: [...prev.special_rules, newSpecialRule.trim()]
    }));
    setNewSpecialRule('');
  };

  // Add handler for removing a special rule
  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setFormValues(prev => ({
      ...prev,
      special_rules: prev.special_rules.filter(rule => rule !== ruleToRemove)
    }));
  };

  // Local state for tracking current fighter state (including all modifications)
  const [currentFighter, setCurrentFighter] = useState<Fighter>(fighter);
  
  // State for showing the stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // State for tracking if stats are being saved
  const [isSavingStats, setIsSavingStats] = useState(false);

  // Create a sorted array of fighter classes based on the fighterClassRank
  const sortedFighterClasses = useMemo(() => {
    return [...FIGHTER_CLASSES].sort((a, b) => {
      const rankA = fighterClassRank[a.toLowerCase()] ?? Infinity;
      const rankB = fighterClassRank[b.toLowerCase()] ?? Infinity;
      return rankA - rankB;
    });
  }, []);

  // Update currentFighter when fighter prop changes
  useEffect(() => {
    setCurrentFighter(fighter);
  }, [fighter]);

  const handleChange = (field: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUpdateStats = async (stats: Record<string, number>) => {
    if (Object.keys(stats).length === 0) {
      setShowStatsModal(false);
      return;
    }
    
    try {
      setIsSavingStats(true);
      
      // Make a clean copy of the fighter BEFORE any adjustments
      const cleanFighter = { ...currentFighter };
      
      // Send the update to the server first
      const response = await fetch('/api/fighters/effects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fighter_id: fighter.id,
          stats // Send the adjustment values directly
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save stat changes');
      }
      
      // Process the server response
      const result = await response.json();
      
      // Update with the actual server data including any new effects
      const serverUpdatedFighter = {
        ...cleanFighter, // Use the clean fighter as the base
        effects: {
          ...cleanFighter.effects,
          injuries: cleanFighter.effects?.injuries || [],
          advancements: cleanFighter.effects?.advancements || [],
          bionics: cleanFighter.effects?.bionics || [],
          cybernetics: cleanFighter.effects?.cybernetics || [],
          user: result.effects || [] // Update with the actual user effects from server
        }
      };
      
      // Update local state with server data
      setCurrentFighter(serverUpdatedFighter);
      
      // Notify parent component with the fully updated fighter
      if (onStatsUpdate) {
        onStatsUpdate(serverUpdatedFighter);
      }
      
      // Show success toast message with proper formatting
      toast({
        description: "Fighter characteristics updated successfully",
        variant: "default",
      });
      
      // Close the modal only after successful update
      setShowStatsModal(false);
      
    } catch (error) {
      console.error('Error saving stats:', error);
      
      // Show error toast message with proper formatting
      toast({
        description: error instanceof Error ? error.message : "Failed to update fighter characteristics",
        variant: "destructive",
      });
      
      // Do not close the modal on error
      // No need to revert as we didn't do an optimistic update
    } finally {
      setIsSavingStats(false);
    }
  };

  // Update the handleConfirm function to include special_rules
  const handleConfirm = async () => {
    try {
      const success = await onSubmit({
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        costAdjustment: formValues.costAdjustment,
        fighter_class: formValues.fighter_class,
        special_rules: formValues.special_rules, // Include special_rules in the submission
      });
      
      if (success) {
        onClose();
      }
      
      return success;
    } catch (error) {
      console.error('Error updating fighter:', error);
      toast({
        description: 'Failed to update fighter',
        variant: "destructive"
      });
      return false;
    }
  };

  // Don't render if modal isn't open
  if (!isOpen) return null;

  return (
    <>
      <Modal
        title="Edit Fighter"
        content={
          <div className="space-y-4">
            {/* Fighter Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Fighter name
              </label>
              <Input
                id="name"
                type="text"
                value={formValues.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full"
              />
            </div>
            

            
            {/* Cost Adjustment and Kills */}
            <div className="grid grid-cols-3 gap-4">
              {/* Label */}
              <div>
                <label htmlFor="label" className="block text-sm font-medium mb-1">
                  Label
                </label>
                <Input
                  id="label"
                  type="text"
                  placeholder="Max 5 char."
                  maxLength={5}
                  value={formValues.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-full"
                />
              </div>
              {/* Cost Adjustment */}
              <div>
                <label htmlFor="costAdjustment" className="block text-sm font-medium mb-1">
                  Cost Adjustment
                </label>
                <Input
                  id="costAdjustment"
                  type="number"
                  value={formValues.costAdjustment}
                  onChange={(e) => handleChange('costAdjustment', e.target.value)}
                  className="w-full"
                />
              </div>
              {/* Kills */}
              <div>
                <label htmlFor="kills" className="block text-sm font-medium mb-1">
                  Kills
                </label>
                <Input
                  id="kills"
                  type="number"
                  value={formValues.kills}
                  onChange={(e) => handleChange('kills', e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            
            {/* Fighter Class Dropdown */}
            <div>
              <label htmlFor="fighter_class" className="block text-sm font-medium mb-1">
                Fighter Class
              </label>
              <select
                id="fighter_class"
                value={formValues.fighter_class}
                onChange={(e) => handleChange('fighter_class', e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a class</option>
                {sortedFighterClasses.map((fighterClass) => (
                  <option key={fighterClass} value={fighterClass}>
                    {fighterClass}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Special Rules Section - Add this new section */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Special Rules
              </label>
              <div className="flex space-x-2 mb-2">
                <Input
                  type="text"
                  value={newSpecialRule}
                  onChange={(e) => setNewSpecialRule(e.target.value)}
                  placeholder="Add a Special Rule"
                  className="flex-grow"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSpecialRule();
                    }
                  }}
                />
                <Button
                  onClick={handleAddSpecialRule}
                  type="button"
                >
                  Add
                </Button>
              </div>
              
              {/* Display existing special rules as tags */}
              <div className="flex flex-wrap gap-2 mt-2">
                {formValues.special_rules.map((rule, index) => (
                  <div
                    key={index}
                    className="bg-gray-100 px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Characteristics */}
            <div>
              <h3 className="text-sm font-medium mb-2">Characteristics</h3>
              <FighterCharacteristicTable fighter={currentFighter} />
              <Button 
                onClick={() => setShowStatsModal(true)} 
                className="w-full mt-2"
              >
                Adjust Characteristics
              </Button>
            </div>
          </div>
        }
        onClose={onClose}
        onConfirm={handleConfirm}
      />
      
      {/* Stats modal */}
      {showStatsModal && (
        <CharacterStatsModal 
          onClose={() => setShowStatsModal(false)} 
          fighter={currentFighter}
          onUpdateStats={handleUpdateStats}
          isSaving={isSavingStats}
        />
      )}
    </>
  );
} 