import { useState, useMemo, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import Modal from "@/components/modal";
import { FighterEffect, FighterProps as Fighter, FIGHTER_CLASSES, FighterClass } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { fighterClassRank } from '@/utils/fighterClassRank';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

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

  // Calculate bionics effects
  const bionicsEffects = useMemo(() => {
    const effects: Record<string, number> = {};
    fighter.effects?.bionics?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach(modifier => {
        const statName = modifier.stat_name.toLowerCase();
        const numValue = parseInt(modifier.numeric_value.toString());
        effects[statName] = (effects[statName] || 0) + numValue;
      });
    });
    return effects;
  }, [fighter.effects?.bionics]);

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
          {/* Base row - IMPORTANT FIX: Display only original base values */}
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
          
          {/* Injury row */}
          <tr className="bg-red-50">
            <td className="px-1 py-1 font-medium text-xs">Injuries</td>
            {stats.map(stat => (
              <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                {injuryEffects[stat.key] ? injuryEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* Advancements row */}
          <tr className="bg-blue-50">
            <td className="px-1 py-1 font-medium text-xs">Adv.</td>
            {stats.map(stat => (
              <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                {advancementEffects[stat.key] ? advancementEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* Bionics row */}
          <tr className="bg-yellow-50">
            <td className="px-1 py-1 font-medium text-xs">Bionics</td>
            {stats.map(stat => (
              <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                {bionicsEffects[stat.key] ? bionicsEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* User row */}
          <tr className="bg-green-50">
            <td className="px-1 py-1 font-medium text-xs">User</td>
            {stats.map(stat => (
              <td key={stat.key} className="border-l border-gray-300 text-center text-xs">
                {userEffects[stat.key] ? userEffects[stat.key] : '-'}
              </td>
            ))}
          </tr>
          
          {/* Total row */}
          <tr className="bg-gray-100 font-bold">
            <td className="px-1 py-1 text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              const injuryValue = injuryEffects[stat.key] || 0;
              const advancementValue = advancementEffects[stat.key] || 0;
              const bionicsValue = bionicsEffects[stat.key] || 0;
              const userValue = userEffects[stat.key] || 0;
              const total = baseValue + injuryValue + advancementValue + bionicsValue + userValue;
              
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
    processEffects(fighter.effects?.cyberteknika);
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
  processEffects(fighter.effects?.cyberteknika);
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
  
  // Add state for fighter types
  const [fighterTypes, setFighterTypes] = useState<Array<{
    id: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id?: string;
    special_rules?: string[];
    gang_type_id: string;
    total_cost?: number;
    typeClassKey?: string;
  }>>([]);
  
  const [isLoadingFighterTypes, setIsLoadingFighterTypes] = useState(false);
  
  // Add state for sub-types by fighter type
  const [subTypesByFighterType, setSubTypesByFighterType] = useState<Map<string, Array<{
    id: string;
    fighter_sub_type: string;
    cost: number;
  }>>>(new Map());
  
  // Add state for new special rule input
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Local state for tracking current fighter state (including all modifications)
  const [currentFighter, setCurrentFighter] = useState<Fighter>(fighter);
  
  // State for showing the stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // State for tracking if stats are being saved
  const [isSavingStats, setIsSavingStats] = useState(false);

  // Add state for temporary selected fighter type
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState<string>(fighter.fighter_type_id || '');
  
  // Add state for selected sub-type
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string>((fighter as any).fighter_sub_type_id || '');
  
  // Add state for available sub-types
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{ value: string; label: string; cost?: number }>>([]);
  
  // Add state for loading sub-types
  const [isLoadingSubTypes, setIsLoadingSubTypes] = useState(false);
  
  // Track if fighter type has been explicitly selected in this session
  const [hasExplicitlySelectedType, setHasExplicitlySelectedType] = useState(false);
  
  // Use ref to track the last loaded gang type ID to avoid unnecessary reloads
  const lastGangTypeId = useRef<string>('');

  // Update the useEffect for fighter types loading
  useEffect(() => {
    const loadFighterTypes = async () => {
      if (!fighter.gang_id) {
        console.error('No gang ID available to load fighter types');
        return;
      }
      
      try {
        setIsLoadingFighterTypes(true);
        
        // Get the session for authentication
        const { data: { session } } = await supabase.auth.getSession();
        
        // Get the gang type ID to use in the request
        const gangTypeId = (fighter as any).gang_type_id;
        
        if (!gangTypeId) {
          console.error('No gang type ID available to load fighter types');
          setIsLoadingFighterTypes(false);
          return;
        }
        
        // Use the RPC endpoint to get all fighter data including sub-types
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_add_fighter_details`,
          {
            method: 'POST',
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              p_gang_type_id: gangTypeId
            })
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load fighter types');
        }
        
        const data = await response.json();
        
        // Create a map to group fighters by type+class and find default/cheapest for each
        const typeClassMap = new Map();
        
        // Create a map to store sub-types by fighter type+class key
        const subTypesByTypeClass = new Map();
        
        // Process all fighter types
        data.forEach((fighter: any) => {
          const key = `${fighter.fighter_type}-${fighter.fighter_class}`;
          
          // Store this fighter as a potential sub-type
          if (!subTypesByTypeClass.has(key)) {
            subTypesByTypeClass.set(key, []);
          }
          
          // Add this fighter variant as a sub-type option
          const subType = {
            id: fighter.sub_type?.id || '',
            fighter_sub_type: fighter.sub_type?.sub_type_name || 'Default',
            cost: fighter.total_cost
          };
          
          // Only add if not already in the array
          const existing = subTypesByTypeClass.get(key);
          if (!existing.some((st: any) => st.id === subType.id)) {
            subTypesByTypeClass.get(key).push(subType);
          }
          
          // Process for the main fighter type dropdown
          if (!typeClassMap.has(key)) {
            typeClassMap.set(key, {
              fighter,
              cost: fighter.total_cost
            });
          } else {
            const current = typeClassMap.get(key);
            
            // If this fighter has no sub-type, prefer it as default
            const hasSubType = fighter.sub_type && Object.keys(fighter.sub_type).length > 0;
            const currentHasSubType = current.fighter.sub_type && Object.keys(current.fighter.sub_type).length > 0;
            
            if (!hasSubType && currentHasSubType) {
              typeClassMap.set(key, {
                fighter,
                cost: fighter.total_cost
              });
            }
            // Otherwise, take the cheaper option
            else if (fighter.total_cost < current.cost) {
              typeClassMap.set(key, {
                fighter,
                cost: fighter.total_cost
              });
            }
          }
        });
        
        // Store the sub-types map for later use
        setSubTypesByFighterType(subTypesByTypeClass);
        
        // Process and create the final fighter types array for the dropdown
        const processedTypes = Array.from(typeClassMap.values())
          .map(({ fighter }) => ({
            id: fighter.id,
            fighter_type: fighter.fighter_type,
            fighter_class: fighter.fighter_class,
            fighter_class_id: fighter.fighter_class_id || '',
            special_rules: fighter.special_rules || [],
            gang_type_id: fighter.gang_type_id,
            total_cost: fighter.total_cost,
            typeClassKey: `${fighter.fighter_type}-${fighter.fighter_class}`
          }))
          .sort((a, b) => {
            const rankA = fighterClassRank[a.fighter_class?.toLowerCase() || ""] ?? Infinity;
            const rankB = fighterClassRank[b.fighter_class?.toLowerCase() || ""] ?? Infinity;
            if (rankA !== rankB) return rankA - rankB;
            return (a.fighter_type || "").localeCompare(b.fighter_type || "");
          });

        setFighterTypes(processedTypes);
        
        // If we have a selected fighter type, load its sub-types
        if (fighter.fighter_type_id) {
          // Find the selected fighter type in our new data
          const selectedFighter = data.find((ft: any) => ft.id === fighter.fighter_type_id);
          if (selectedFighter) {
            const key = `${selectedFighter.fighter_type}-${selectedFighter.fighter_class}`;
            if (subTypesByTypeClass.has(key)) {
              const subTypes = subTypesByTypeClass.get(key);
              setAvailableSubTypes([
                DEFAULT_SUB_TYPE_OPTION,
                ...subTypes.map((subType: any) => ({
                  value: subType.id,
                  label: subType.fighter_sub_type || 'Default',
                  cost: subType.cost
                }))
              ]);
            }
          }
        }
      } catch (error) {
        console.error('Error loading fighter types:', error);
        toast({
          description: 'Failed to load fighter types',
          variant: "destructive"
        });
      } finally {
        setIsLoadingFighterTypes(false);
      }
    };
    
    // Only load data if the modal is open and we don't already have data for this gang type
    if (isOpen && 
        (!fighterTypes.length || 
         (fighter as any).gang_type_id !== lastGangTypeId.current)) {
      lastGangTypeId.current = (fighter as any).gang_type_id;
      loadFighterTypes();
    }
  }, [isOpen, fighter.gang_id, (fighter as any).gang_type_id, fighterTypes.length]);

  // Update the currentFighter useEffect
  useEffect(() => {
    setCurrentFighter(fighter);
    setSelectedFighterTypeId(''); // Always start with no selection
    setSelectedSubTypeId((fighter as any).fighter_sub_type_id || '');
    // Reset the explicit selection flag when loading a new fighter
    setHasExplicitlySelectedType(false);
  }, [fighter.id]); // Only update when fighter ID changes

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
      
      // Get available sub-types for this type+class
      const key = selectedType.typeClassKey;
      if (key && subTypesByFighterType.has(key)) {
        const subTypes = subTypesByFighterType.get(key) || [];
        
        // Filter out subTypes that are just "Default"
        const realSubTypes = subTypes.filter(subType => 
          subType.fighter_sub_type && 
          subType.fighter_sub_type !== 'Default'
        );
        
        if (realSubTypes.length > 0) {
          // If we have meaningful sub-types, show them in the dropdown
          setAvailableSubTypes([
            DEFAULT_SUB_TYPE_OPTION,
            ...subTypes.map(subType => ({
              value: subType.id,
              label: subType.fighter_sub_type || 'Default',
              cost: subType.cost
            }))
          ]);
        } else {
          // If we only have default sub-types, don't show the dropdown
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
      const selectedFighterType = selectedFighterTypeId ? 
        fighterTypes.find(ft => ft.id === selectedFighterTypeId) : 
        null;
      
      // Get the selected sub-type details
      let selectedSubType = null;
      if (selectedSubTypeId && selectedFighterType?.typeClassKey) {
        const key = selectedFighterType.typeClassKey;
        const subTypes = subTypesByFighterType.get(key) || [];
        selectedSubType = subTypes.find(st => st.id === selectedSubTypeId);
      }
      
      // First, get the session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      // Call onSubmit with all values, including sub-type fields
      await onSubmit({
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        costAdjustment: formValues.costAdjustment,
        fighter_class: selectedFighterType ? selectedFighterType.fighter_class : formValues.fighter_class,
        fighter_class_id: selectedFighterType ? selectedFighterType.fighter_class_id : formValues.fighter_class_id,
        fighter_type: selectedFighterType ? selectedFighterType.fighter_type : formValues.fighter_type,
        fighter_type_id: selectedFighterType ? selectedFighterType.id : formValues.fighter_type_id,
        special_rules: formValues.special_rules,
        // Only send fighter_sub_type fields if explicitly changed OR if they already existed
        fighter_sub_type: selectedSubType ? selectedSubType.fighter_sub_type : 
                          hasExplicitlySelectedType ? null : 
                          (fighter as any).fighter_sub_type,
        fighter_sub_type_id: selectedSubType ? selectedSubType.id : 
                             hasExplicitlySelectedType ? null : 
                             (fighter as any).fighter_sub_type_id
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
            
            {/* Cost Adjustment and Kills - Move this section before Fighter Type */}
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
                disabled={isLoadingFighterTypes}
              >
                <option value="">
                  {isLoadingFighterTypes ? "Loading fighter types..." : "Select a fighter type"}
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
            {hasExplicitlySelectedType && selectedFighterTypeId && availableSubTypes.length > 1 && availableSubTypes.some(subType => subType.label !== 'Default' && subType.label !== 'Select a sub-type') && (
              <div>
                <label htmlFor="fighter_sub_type_id" className="block text-sm font-medium mb-1">
                  Fighter Sub-type
                </label>
                <select
                  id="fighter_sub_type_id"
                  value={selectedSubTypeId}
                  onChange={(e) => handleSubTypeChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoadingSubTypes}
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