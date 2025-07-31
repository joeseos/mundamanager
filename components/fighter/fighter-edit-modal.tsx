import { useState, useMemo, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterEffect, FighterProps as Fighter } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { fighterClassRank } from '@/utils/fighterClassRank';

// Define constants outside the component to prevent recreation on each render
const DEFAULT_SUB_TYPE_OPTION = { value: '', label: 'Select a sub-type' };

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

  // Single function to calculate effects for any category
  const calculateEffectsForCategory = useMemo(() => {
    return (categoryName: keyof typeof fighter.effects) => {
      const effects: Record<string, number> = {};
      fighter.effects?.[categoryName]?.forEach(effect => {
        effect.fighter_effect_modifiers?.forEach(modifier => {
          const statName = modifier.stat_name.toLowerCase();
          const numValue = parseInt(modifier.numeric_value.toString());
          effects[statName] = (effects[statName] || 0) + numValue;
        });
      });
      return effects;
    };
  }, [fighter.effects]);

  // Calculate all effect categories using the single function
  const injuryEffects = useMemo(() => calculateEffectsForCategory('injuries'), [calculateEffectsForCategory]);
  const advancementEffects = useMemo(() => calculateEffectsForCategory('advancements'), [calculateEffectsForCategory]);
  const userEffects = useMemo(() => calculateEffectsForCategory('user'), [calculateEffectsForCategory]);
  const bionicsEffects = useMemo(() => calculateEffectsForCategory('bionics'), [calculateEffectsForCategory]);
  const geneSmithingEffects = useMemo(() => calculateEffectsForCategory('gene-smithing'), [calculateEffectsForCategory]);
  const rigGlitchesEffects = useMemo(() => calculateEffectsForCategory('rig-glitches'), [calculateEffectsForCategory]);
  const augmentationsEffects = useMemo(() => calculateEffectsForCategory('augmentations'), [calculateEffectsForCategory]);
  const equipmentEffects = useMemo(() => calculateEffectsForCategory('equipment'), [calculateEffectsForCategory]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-1 py-1 text-xs text-left">Type</th>
            {stats.map(stat => (
              <th key={stat.key} className="min-w-[20px] max-w-[20px] border-l border-gray-300 text-center text-xs">{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Base row - always shown */}
          <tr className="bg-gray-100">
            <td className="px-1 py-1 font-medium text-xs">Base</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              
              return (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {stat.key === 'movement' ? `${baseValue}"` :
                   stat.key === 'wounds' || stat.key === 'attacks' || 
                   stat.key === 'strength' || stat.key === 'toughness' ? 
                   baseValue : 
                   `${baseValue}+`}
                </td>
              );
            })}
          </tr>
          
          {/* Injury row - only show if fighter has injuries */}
          {fighter.effects?.injuries && fighter.effects.injuries.length > 0 && (
            <tr className="bg-red-50">
              <td className="px-1 py-1 font-medium text-xs">Injuries</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {injuryEffects[stat.key] ? injuryEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Advancements row - only show if fighter has advancements */}
          {fighter.effects?.advancements && fighter.effects.advancements.length > 0 && (
            <tr className="bg-blue-50">
              <td className="px-1 py-1 font-medium text-xs">Adv.</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {advancementEffects[stat.key] ? advancementEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Bionics row - only show if fighter has bionics */}
          {fighter.effects?.bionics && fighter.effects.bionics.length > 0 && (
            <tr className="bg-yellow-50">
              <td className="px-1 py-1 font-medium text-xs">Bionics</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {bionicsEffects[stat.key] ? bionicsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* User row - only show if fighter has user effects */}
          {fighter.effects?.user && fighter.effects.user.length > 0 && (
            <tr className="bg-green-50">
              <td className="px-1 py-1 font-medium text-xs">User</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {userEffects[stat.key] ? userEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Gene-Smithing row - only show if fighter has gene-smithing effects */}
          {fighter.effects?.['gene-smithing'] && fighter.effects['gene-smithing'].length > 0 && (
            <tr className="bg-purple-50">
              <td className="px-1 py-1 font-medium text-xs">Gene-Smithing</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {geneSmithingEffects[stat.key] ? geneSmithingEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Rig-Glitches row - only show if fighter has rig-glitches effects */}
          {fighter.effects?.['rig-glitches'] && fighter.effects['rig-glitches'].length > 0 && (
            <tr className="bg-pink-50">
              <td className="px-1 py-1 font-medium text-xs">Rig-Glitches</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {rigGlitchesEffects[stat.key] ? rigGlitchesEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Augmentations row - only show if fighter has augmentations effects */}
          {fighter.effects?.augmentations && fighter.effects.augmentations.length > 0 && (
            <tr className="bg-teal-50">
              <td className="px-1 py-1 font-medium text-xs">Augmentations</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {augmentationsEffects[stat.key] ? augmentationsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Equipment row - only show if fighter has equipment effects */}
          {fighter.effects?.equipment && fighter.effects.equipment.length > 0 && (
            <tr className="bg-amber-50">
              <td className="px-1 py-1 font-medium text-xs">Equipment</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                  {equipmentEffects[stat.key] ? equipmentEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Total row - always shown */}
          <tr className="bg-gray-100 font-bold">
            <td className="px-1 py-1 text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              const injuryValue = injuryEffects[stat.key] || 0;
              const advancementValue = advancementEffects[stat.key] || 0;
              const bionicsValue = bionicsEffects[stat.key] || 0;
              const userValue = userEffects[stat.key] || 0;
              const geneSmithingValue = geneSmithingEffects[stat.key] || 0;
              const rigGlitchesValue = rigGlitchesEffects[stat.key] || 0;
              const augmentationsValue = augmentationsEffects[stat.key] || 0;
              const equipmentValue = equipmentEffects[stat.key] || 0;
              const total = baseValue + injuryValue + advancementValue + bionicsValue + userValue + geneSmithingValue + rigGlitchesValue + augmentationsValue + equipmentValue;
              
              return (
                <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
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
      { key: "Cl", name: "Cool", value: `${fighter.cool}+` },
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
    setAdjustments(prev => ({
      ...prev,
      [propName]: prev[propName] - 1
    }));
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
    processEffects(fighter.effects?.cyberteknika);
    processEffects(fighter.effects?.['gene-smithing']);
    processEffects(fighter.effects?.['rig-glitches']);
    processEffects(fighter.effects?.augmentations);
    processEffects(fighter.effects?.equipment);
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
          <h2 className="text-xl md:text-2xl font-bold">Adjust Characteristics</h2>
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
                      disabled={isSaving}
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



interface FighterTypesData {
  displayTypes: Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    gang_type_id: string;
    total_cost: number;
    typeClassKey?: string;
    is_gang_variant?: boolean;
    gang_variant_name?: string;
  }>;
  subTypesByTypeClass: Map<string, Array<{
    id: string;
    fighter_sub_type: string;
    cost: number;
    fighter_type_id: string;
    fighter_type_name: string;
    fighter_class_name: string;
  }>>;
}

interface EditFighterModalProps {
  fighter: Fighter;
  isOpen: boolean;
  initialValues: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
  };
  fighterTypesData: FighterTypesData;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    label: string;
    kills: number;
    costAdjustment: string;
    fighter_class?: string;
    fighter_class_id?: string;
    fighter_type?: string;
    fighter_type_id?: string;
    special_rules?: string[];
    stats?: Record<string, number>;
    fighter_sub_type?: string | null;
    fighter_sub_type_id?: string | null;
  }) => Promise<boolean>;
  onStatsUpdate?: (updatedFighter: Fighter) => void;
}

export function EditFighterModal({
  fighter,
  isOpen,
  initialValues,
  fighterTypesData,
  onClose,
  onSubmit,
  onStatsUpdate
}: EditFighterModalProps) {
  // Update form state to include fighter type fields
  const [formValues, setFormValues] = useState({
    name: initialValues.name,
    label: initialValues.label,
    kills: initialValues.kills,
    costAdjustment: initialValues.costAdjustment,
    fighter_class: fighter.fighter_class || '',
    fighter_class_id: (fighter as any).fighter_class_id || '',
    fighter_type: fighter.fighter_type || '',
    fighter_type_id: fighter.fighter_type_id || '',
    special_rules: Array.isArray(fighter.special_rules) ? fighter.special_rules : [], 
    stats: {} as Record<string, number>
  });
  
  // Fighter types are now provided via props
  const fighterTypes = fighterTypesData.displayTypes;
  const subTypesByFighterType = fighterTypesData.subTypesByTypeClass;
  
  // Add state for new special rule input
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Local state for tracking current fighter state (including all modifications)
  const [currentFighter, setCurrentFighter] = useState<Fighter>(fighter);
  
  // State for showing the stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // State for tracking if stats are being saved
  const [isSavingStats, setIsSavingStats] = useState(false);

  // Add state for temporary selected fighter type - pre-select current type
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState<string>(fighter.fighter_type_id || '');
  
  // Add state for selected sub-type
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string>((fighter as any).fighter_sub_type_id || '');
  
  // Add state for available sub-types
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{ value: string; label: string; cost?: number }>>([]);
  
  
  // Track if fighter type has been explicitly selected in this session
  const [hasExplicitlySelectedType, setHasExplicitlySelectedType] = useState(false);

  // Initialize fighter state and sub-types when fighter or fighter types data changes
  useEffect(() => {
    setCurrentFighter(fighter);
    setSelectedFighterTypeId(fighter.fighter_type_id || ''); // Pre-select current fighter type
    setSelectedSubTypeId((fighter as any).fighter_sub_type_id || '');
    // Reset the explicit selection flag when loading a new fighter
    setHasExplicitlySelectedType(false);
    
    // Initialize available sub-types if fighter has a current type
    if (fighter.fighter_type_id && fighter.fighter_type && fighter.fighter_class) {
      const key = `${fighter.fighter_type}-${fighter.fighter_class}`;
      if (subTypesByFighterType.has(key)) {
        const subTypes = subTypesByFighterType.get(key) || [];
        
        // Filter for valid sub-types
        const realSubTypes = subTypes.filter((subType: any) => 
          subType.fighter_sub_type && 
          subType.id && subType.id.trim() !== ''
        );
        
        if (realSubTypes.length > 0) {
          // Remove duplicates and sort by name
          const uniqueSubTypes = realSubTypes
            .filter((subType: any, index: number, self: any[]) => 
              index === self.findIndex((s: any) => s.id === subType.id)
            )
            .sort((a: any, b: any) => a.fighter_sub_type.localeCompare(b.fighter_sub_type));

          setAvailableSubTypes([
            DEFAULT_SUB_TYPE_OPTION,
            ...uniqueSubTypes.map((subType: any) => ({
              value: subType.id,
              label: subType.fighter_sub_type,
              cost: subType.cost
            }))
          ]);
        } else {
          setAvailableSubTypes([]);
        }
      } else {
        setAvailableSubTypes([]);
      }
    }
  }, [fighter.id, subTypesByFighterType]); // Update when fighter or sub-types data changes

  const handleChange = (field: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Update the handleFighterTypeChange function
  const handleFighterTypeChange = (fighterTypeId: string) => {
    setSelectedFighterTypeId(fighterTypeId);
    setSelectedSubTypeId(''); // Reset sub-type when fighter type changes
    
    // Set flag to indicate user has explicitly selected a fighter type
    setHasExplicitlySelectedType(true);
    
    // Find the selected fighter type
    const selectedType = fighterTypes.find(ft => ft.id === fighterTypeId);
    
    if (selectedType) {
      // Use the fighter_class_id directly from the API data
      // No need for a fallback mapping anymore
      
      // Update form values with selected type
      setFormValues(prev => ({
        ...prev,
        fighter_type: selectedType.fighter_type,
        fighter_class: selectedType.fighter_class,
        fighter_class_id: selectedType.fighter_class_id
      }));
      
      // Get available sub-types for this fighter type+class combination
      const key = selectedType.typeClassKey;
      if (key && subTypesByFighterType.has(key)) {
        const subTypes = subTypesByFighterType.get(key) || [];
        
        // Filter to get valid sub-types
        const realSubTypes = subTypes.filter((subType: any) => 
          subType.fighter_sub_type && 
          subType.id && subType.id.trim() !== ''
        );
        
        if (realSubTypes.length > 0) {
          // Remove duplicates based on sub-type ID and sort by name
          const uniqueSubTypes = realSubTypes
            .filter((subType: any, index: number, self: any[]) => 
              index === self.findIndex((s: any) => s.id === subType.id)
            )
            .sort((a: any, b: any) => a.fighter_sub_type.localeCompare(b.fighter_sub_type));

          setAvailableSubTypes([
            DEFAULT_SUB_TYPE_OPTION,
            ...uniqueSubTypes.map((subType: any) => ({
              value: subType.id,
              label: subType.fighter_sub_type,
              cost: subType.cost
            }))
          ]);
        } else {
          // If no meaningful sub-types, don't show the dropdown
          setAvailableSubTypes([]);
        }
      } else {
        setAvailableSubTypes([]);
      }
    }
  };
  
  // Add handler for sub-type change
  const handleSubTypeChange = (subTypeId: string) => {
    setSelectedSubTypeId(subTypeId);
  };

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

  const handleUpdateStats = async (stats: Record<string, number>) => {
    if (Object.keys(stats).length === 0) {
      setShowStatsModal(false);
      return;
    }
    
    try {
      setIsSavingStats(true);
      
      // Make a clean copy of the fighter BEFORE any adjustments
      const cleanFighter = { ...currentFighter };
      
      // Send the update to the server with the correct sign (positive or negative)
      const response = await fetch('/api/fighters/effects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fighter_id: fighter.id,
          stats // This should already include negative values when decreasing
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
          cyberteknika: cleanFighter.effects?.cyberteknika || [],
          user: result.effects || []
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
    } finally {
      setIsSavingStats(false);
    }
  };

  // Update the handleConfirm function
  const handleConfirm = async () => {
    try {
      // Get the selected fighter type details - use existing if not explicitly changed
      let selectedFighterType = selectedFighterTypeId ? 
        fighterTypes.find(ft => ft.id === selectedFighterTypeId) : 
        null;
      
      // Get the selected sub-type details (without affecting fighter type)
      type SubType = { id: string; fighter_sub_type: string; cost: number; };
      let selectedSubType: SubType | null = null;
      if (selectedSubTypeId) {
        // Find the sub-type in the currently available sub-types only
        const foundSubType = availableSubTypes.find(st => st.value === selectedSubTypeId);
        if (foundSubType && foundSubType.value) {
          selectedSubType = {
            id: foundSubType.value,
            fighter_sub_type: foundSubType.label,
            cost: foundSubType.cost || 0
          };
        }
      }
      
      // Only update fighter type if explicitly selected, not when selecting sub-types
      // Sub-type changes should NEVER automatically change the fighter type
      const shouldUpdateFighterType = selectedFighterType && hasExplicitlySelectedType;
      
      
      // Call onSubmit with all values, including sub-type fields
      await onSubmit({
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        costAdjustment: formValues.costAdjustment,
        fighter_class: shouldUpdateFighterType && selectedFighterType ? selectedFighterType.fighter_class : undefined,
        fighter_class_id: shouldUpdateFighterType && selectedFighterType ? selectedFighterType.fighter_class_id : undefined,
        fighter_type: shouldUpdateFighterType && selectedFighterType ? selectedFighterType.fighter_type : undefined,
        fighter_type_id: shouldUpdateFighterType && selectedFighterType ? selectedFighterType.id : undefined,
        special_rules: formValues.special_rules,
        fighter_sub_type: selectedSubType ? selectedSubType.fighter_sub_type : (selectedSubTypeId === '' ? null : undefined),
        fighter_sub_type_id: selectedSubType ? selectedSubType.id : (selectedSubTypeId === '' ? null : undefined)
      });
      toast({
        description: 'Fighter updated successfully',
        variant: "default"
      });
      onClose();
      return true;
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
                Fighter Name
              </label>
              <Input
                id="name"
                type="text"
                value={formValues.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full"
              />
            </div>
            
            {/* Label, Cost Adjustment and Kills */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="label" className="block text-sm font-medium mb-1">
                  Label
                </label>
                <Input
                  id="label"
                  type="text"
                  placeholder="Max 5 Char."
                  maxLength={5}
                  value={formValues.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="costAdjustment" className="block text-sm font-medium mb-1">
                  <span className="hidden sm:inline">Cost Adjustment</span>
                  <span className="inline sm:hidden">Cost Adj.</span>
                </label>
                <Input
                  id="costAdjustment"
                  type="number"
                  value={formValues.costAdjustment}
                  onChange={(e) => handleChange('costAdjustment', e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="kills" className="block text-sm font-medium mb-1">
                  OOA
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
            
            {/* Fighter Type Dropdown */}
            <div>
              <label htmlFor="fighter_type_id" className="block text-sm font-medium mb-1">
                Change Fighter Type
              </label>
              <select
                id="fighter_type_id"
                value={selectedFighterTypeId}
                onChange={(e) => handleFighterTypeChange(e.target.value)}
                className="w-full p-2 border rounded-md"
                disabled={false}
              >
                <option value="">
                  Select a fighter type
                </option>
                {fighterTypes
                  .sort((a, b) => {
                    const rankA = fighterClassRank[a.fighter_class?.toLowerCase() || ""] ?? Infinity;
                    const rankB = fighterClassRank[b.fighter_class?.toLowerCase() || ""] ?? Infinity;
                    if (rankA !== rankB) return rankA - rankB;
                    return (a.fighter_type || "").localeCompare(b.fighter_type || "");
                  })
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {`${type.fighter_type} (${type.fighter_class || "Unknown Class"})`}
                      {(type as any).is_gang_variant ? ` - ${(type as any).gang_variant_name}` : ''}
                    </option>
                  ))}
              </select>
              {fighter.fighter_type && (
                <div className="mt-1 text-sm text-gray-500">
                  Current: {typeof (fighter as any).fighter_type === 'object' 
                    ? (fighter as any).fighter_type.fighter_type 
                    : fighter.fighter_type}
                  {` `}
                  {typeof fighter.fighter_class === 'object'
                    ? `(${(fighter.fighter_class as any).class_name || 'Unknown Class'})`
                    : `(${fighter.fighter_class || 'Unknown Class'})`}
                </div>
              )}
            </div>
            
            {/* Sub-type Dropdown - only show when we have sub-types */}
            {selectedFighterTypeId && availableSubTypes.length > 1 && availableSubTypes.some(subType => subType.label !== 'Default' && subType.label !== 'Select a sub-type') && (
              <div>
                <label htmlFor="fighter_sub_type_id" className="block text-sm font-medium mb-1">
                  Fighter Sub-type
                </label>
                <select
                  id="fighter_sub_type_id"
                  value={selectedSubTypeId}
                  onChange={(e) => handleSubTypeChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={false}
                >
                  {availableSubTypes.map((subType) => (
                    <option key={subType.value} value={subType.value}>
                      {subType.label}
                    </option>
                  ))}
                </select>
                {(fighter as any).fighter_sub_type && (
                  <div className="mt-1 text-sm text-gray-500">
                    Current: {typeof (fighter as any).fighter_sub_type === 'object' 
                      ? (fighter as any).fighter_sub_type.sub_type_name || (fighter as any).fighter_sub_type.fighter_sub_type
                      : (fighter as any).fighter_sub_type}
                  </div>
                )}
              </div>
            )}
            
            {/* Special Rules Section */}
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