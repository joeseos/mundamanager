import { useState, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { updateFighterDetails } from '@/app/actions/edit-fighter';
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { FighterEffect, FighterProps as Fighter } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { fighterClassRank } from '@/utils/fighterClassRank';

// Define constants outside the component to prevent recreation on each render

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
  const userHasNonZero = useMemo(() => Object.values(userEffects).some(v => (v || 0) !== 0), [userEffects]);
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
              <th key={stat.key} className="min-w-[20px] max-w-[20px] border-l border-border text-center text-xs">{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Base row - always shown */}
          <tr className="bg-muted">
            <td className="px-1 py-1 font-medium text-xs">Base</td>
            {stats.map(stat => {
              const baseValue = getStat(fighter, stat.key);
              
              return (
                <td key={stat.key} className="border-l border-border text-center text-xs">
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
            <tr className="bg-red-50 dark:bg-red-950">
              <td className="px-1 py-1 font-medium text-xs">Injuries</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {injuryEffects[stat.key] ? injuryEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Advancements row - only show if fighter has advancements */}
          {fighter.effects?.advancements && fighter.effects.advancements.length > 0 && (
            <tr className="bg-blue-50 dark:bg-blue-950">
              <td className="px-1 py-1 font-medium text-xs">Adv.</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {advancementEffects[stat.key] ? advancementEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Bionics row - only show if fighter has bionics */}
          {fighter.effects?.bionics && fighter.effects.bionics.length > 0 && (
            <tr className="bg-yellow-50 dark:bg-yellow-950">
              <td className="px-1 py-1 font-medium text-xs">Bionics</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {bionicsEffects[stat.key] ? bionicsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* User row - only show if user effects result in any non-zero modifier */}
          {userHasNonZero && (
            <tr className="bg-green-50 dark:bg-green-950">
              <td className="px-1 py-1 font-medium text-xs">User</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {userEffects[stat.key] ? userEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Gene-Smithing row - only show if fighter has gene-smithing effects */}
          {fighter.effects?.['gene-smithing'] && fighter.effects['gene-smithing'].length > 0 && (
            <tr className="bg-purple-50 dark:bg-purple-950">
              <td className="px-1 py-1 font-medium text-xs">Gene-Smithing</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {geneSmithingEffects[stat.key] ? geneSmithingEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Rig-Glitches row - only show if fighter has rig-glitches effects */}
          {fighter.effects?.['rig-glitches'] && fighter.effects['rig-glitches'].length > 0 && (
            <tr className="bg-pink-50 dark:bg-pink-950">
              <td className="px-1 py-1 font-medium text-xs">Rig-Glitches</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {rigGlitchesEffects[stat.key] ? rigGlitchesEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Augmentations row - only show if fighter has augmentations effects */}
          {fighter.effects?.augmentations && fighter.effects.augmentations.length > 0 && (
            <tr className="bg-teal-50 dark:bg-teal-950">
              <td className="px-1 py-1 font-medium text-xs">Augmentations</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {augmentationsEffects[stat.key] ? augmentationsEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Equipment row - only show if fighter has equipment effects */}
          {fighter.effects?.equipment && fighter.effects.equipment.length > 0 && (
            <tr className="bg-amber-50 dark:bg-amber-950">
              <td className="px-1 py-1 font-medium text-xs">Equipment</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {equipmentEffects[stat.key] ? equipmentEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}
          
          {/* Total row - always shown */}
          <tr className="bg-muted font-bold">
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
                <td key={stat.key} className="border-l border-border text-center text-xs">
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
    const updatedStats: Record<string, number> = {};
    for (const [propName, adjustment] of Object.entries(adjustments)) {
      if (adjustment !== 0) updatedStats[propName] = adjustment;
    }
    onUpdateStats(updatedStats); // emit draft only (no server call)
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={isSaving ? undefined : onClose}></div>
      <div className="bg-card rounded-lg max-w-[700px] w-full shadow-xl relative z-[101]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl md:text-2xl font-bold">Adjust Characteristics</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
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
                    <span className="text-xs text-muted-foreground">{stat.name}</span>
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
                      <span className="text-xs text-muted-foreground">
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
  gangId: string;
  gangTypeId: string;
  preFetchedFighterTypes?: Array<{
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
    fighter_sub_type?: string;
    fighter_sub_type_id?: string;
    available_legacies?: Array<{id: string; name: string}>;
  }>;
  onClose: () => void;
  onSubmit?: (values: {
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
    fighter_gang_legacy_id?: string | null;
  }) => Promise<boolean>;
  onStatsUpdate?: (updatedFighter: Fighter) => void;
  // New optional lifecycle callbacks for optimistic editing
  onEditMutate?: (optimistic: Partial<Fighter>) => any;
  onEditError?: (snapshot: any) => void;
  onEditSuccess?: (serverFighter: any, optimistic: Partial<Fighter>, snapshot: any) => void;
}

export function EditFighterModal({
  fighter,
  isOpen,
  initialValues,
  gangId,
  gangTypeId,
  preFetchedFighterTypes,
  onClose,
  onSubmit,
  onStatsUpdate,
  onEditMutate,
  onEditError,
  onEditSuccess
}: EditFighterModalProps) {
  // Update form state to include fighter type fields
  const [formValues, setFormValues] = useState({
    name: initialValues.name,
    label: initialValues.label,
    kills: initialValues.kills,
    costAdjustment: initialValues.costAdjustment,
    fighter_class: fighter.fighter_class || '',
    fighter_class_id: (fighter as any).fighter_class_id || '',
    fighter_type: (fighter.fighter_type as any)?.fighter_type || fighter.fighter_type || '',
    fighter_type_id: (fighter.fighter_type as any)?.fighter_type_id || '',
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
    total_cost: number;
    typeClassKey?: string;
    is_gang_variant?: boolean;
    gang_variant_name?: string;
    fighter_sub_type?: string;
    fighter_sub_type_id?: string;
    available_legacies?: Array<{id: string; name: string}>;
  }>>([]);
  const [isLoadingFighterTypes, setIsLoadingFighterTypes] = useState(false);
  const [fighterTypesError, setFighterTypesError] = useState<string | null>(null);

  
  // Add state for new special rule input
  const [newSpecialRule, setNewSpecialRule] = useState('');

  // Local state for tracking current fighter state (including all modifications)
  const [currentFighter, setCurrentFighter] = useState<Fighter>(fighter);
  
  // State for showing the stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // State for tracking if stats are being saved
  const [isSavingStats, setIsSavingStats] = useState(false);

  // Add state for temporary selected fighter type - pre-select current type
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState<string>((fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || '');
  
  // Add state for selected sub-type
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string>((fighter.fighter_sub_type as any)?.fighter_sub_type_id || '');
  
  // Add state for available sub-types
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{ value: string; label: string; cost?: number; fighterTypeId?: string }>>([]);
  
  // Add state for gang legacy
  const [selectedGangLegacyId, setSelectedGangLegacyId] = useState<string>((fighter as any).fighter_gang_legacy_id || '');
  const [availableLegacies, setAvailableLegacies] = useState<Array<{ id: string; name: string }>>([]);
  
  // Track if fighter type has been explicitly selected in this session
  const [hasExplicitlySelectedType, setHasExplicitlySelectedType] = useState(false);

  // Pending stat adjustments (draft only, persisted on main confirm)
  const [pendingStatAdjustments, setPendingStatAdjustments] = useState<Record<string, number>>({});

  // TanStack mutation for editing fighter details
  const mutation = useMutation({
    mutationFn: async (submit: {
      name: string;
      label: string;
      kills: number;
      costAdjustment: string;
      fighter_class?: string;
      fighter_class_id?: string;
      fighter_type?: string;
      fighter_type_id?: string;
      special_rules?: string[];
      fighter_sub_type?: string | null;
      fighter_sub_type_id?: string | null;
      fighter_gang_legacy_id?: string | null;
    }) => {
      const result = await updateFighterDetails({
        fighter_id: fighter.id,
        fighter_name: submit.name,
        label: submit.label,
        kills: submit.kills,
        cost_adjustment: parseInt(submit.costAdjustment) || 0,
        special_rules: submit.special_rules,
        fighter_class: submit.fighter_class,
        fighter_class_id: submit.fighter_class_id,
        fighter_type: submit.fighter_type,
        fighter_type_id: submit.fighter_type_id,
        fighter_sub_type: submit.fighter_sub_type,
        fighter_sub_type_id: submit.fighter_sub_type_id,
        fighter_gang_legacy_id: submit.fighter_gang_legacy_id,
        stat_adjustments: Object.keys(pendingStatAdjustments).length > 0 ? pendingStatAdjustments : undefined
      });
      if (!result.success) throw new Error(result.error || 'Failed to update fighter');
      return result.data?.fighter;
    },
    onMutate: (submit) => {
      const optimistic: any = {
        fighter_name: submit.name,
        label: submit.label,
        kills: submit.kills,
        cost_adjustment: parseInt(submit.costAdjustment) || 0,
        ...(submit.fighter_class ? { fighter_class: submit.fighter_class } : {}),
        ...(submit.fighter_type && submit.fighter_type_id
          ? { fighter_type: { fighter_type: submit.fighter_type, fighter_type_id: submit.fighter_type_id } as any }
          : {}),
        ...(submit.fighter_sub_type && submit.fighter_sub_type_id
          ? { fighter_sub_type: { fighter_sub_type: submit.fighter_sub_type, fighter_sub_type_id: submit.fighter_sub_type_id } as any }
          : {}),
        ...(submit.fighter_gang_legacy_id !== undefined
          ? { fighter_gang_legacy_id: submit.fighter_gang_legacy_id as any }
          : {}),
      };
      const snapshot = onEditMutate?.(optimistic);
      return { snapshot, optimistic } as const;
    },
    onError: (err: unknown, _submit, ctx) => {
      if (ctx && 'snapshot' in (ctx as any)) {
        onEditError?.((ctx as any).snapshot);
      }
      toast({ variant: 'destructive', description: err instanceof Error ? err.message : 'Failed to update fighter' });
    },
    onSuccess: (serverFighter, _submit, ctx) => {
      if (ctx && 'optimistic' in (ctx as any) && 'snapshot' in (ctx as any)) {
        onEditSuccess?.(serverFighter, (ctx as any).optimistic, (ctx as any).snapshot);
      }
      toast({ description: 'Fighter updated successfully' });
    }
  });

  // Use pre-fetched fighter types or fetch them when modal opens
  useEffect(() => {
    if (isOpen) {
      if (preFetchedFighterTypes && preFetchedFighterTypes.length > 0) {
        // Transform pre-fetched data to match the expected format
        const transformedData = preFetchedFighterTypes.map((type: any) => ({
          id: type.id,
          fighter_type: type.fighter_type,
          fighter_class: type.fighter_class,
          fighter_class_id: type.fighter_class_id,
          special_rules: type.special_rules || [],
          gang_type_id: type.gang_type_id,
          total_cost: type.total_cost,
          typeClassKey: type.typeClassKey,
          is_gang_variant: type.is_gang_variant,
          gang_variant_name: type.gang_variant_name,
          // Preserve the sub_type JSONB field from the API response
          sub_type: type.sub_type || {},
          // Also extract sub-type data for compatibility (if needed elsewhere)
          fighter_sub_type: type.sub_type?.sub_type_name || null,
          fighter_sub_type_id: type.sub_type?.id || null,
          // Include available legacies for each fighter type
          available_legacies: type.available_legacies || []
        }));
        setFighterTypes(transformedData);

        // Don't set legacies here - they will be set when the fighter type is selected
      } else {
        if (fighterTypes.length === 0) {
          fetchFighterTypes();
        }
      }
    }
  }, [isOpen, preFetchedFighterTypes]);

  const fetchFighterTypes = async () => {
    try {
      setIsLoadingFighterTypes(true);
      setFighterTypesError(null);
      
      console.log('EditFighterModal: Fetching fighter types for gang ID:', gangId);
      
      // Build query parameters
      const params = new URLSearchParams({
        gang_id: gangId,
        gang_type_id: gangTypeId,
        is_gang_addition: 'false'
      });
      
      const response = await fetch(`/api/fighter-types?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch fighter types');
      }
      
      const data = await response.json();
      
      // Transform the API response to match the expected FighterType interface
      const transformedData = data.map((type: any) => ({
        id: type.id,
        fighter_type: type.fighter_type,
        fighter_class: type.fighter_class,
        fighter_class_id: type.fighter_class_id,
        special_rules: type.special_rules || [],
        gang_type_id: type.gang_type_id,
        total_cost: type.total_cost,
        typeClassKey: type.typeClassKey,
        is_gang_variant: type.is_gang_variant,
        gang_variant_name: type.gang_variant_name,
        // Preserve the sub_type JSONB field from the API response
        sub_type: type.sub_type || {},
        // Also extract sub-type data for compatibility (if needed elsewhere)
        fighter_sub_type: type.sub_type?.sub_type_name || null,
        fighter_sub_type_id: type.sub_type?.id || null,
        // Include available legacies for each fighter type
        available_legacies: type.available_legacies || []
      }));
      
      console.log('EditFighterModal: Fetched fighter types:', transformedData.length);
      setFighterTypes(transformedData);
    } catch (error) {
      console.error('Error fetching fighter types:', error);
      setFighterTypesError(error instanceof Error ? error.message : 'Failed to fetch fighter types');
    } finally {
      setIsLoadingFighterTypes(false);
    }
  };


  // Initialize fighter state and sub-types when fighter or fighter types data changes
  useEffect(() => {
    setCurrentFighter(fighter);
    setSelectedFighterTypeId((fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id || ''); // Pre-select current fighter type
    setSelectedSubTypeId((fighter.fighter_sub_type as any)?.fighter_sub_type_id || '');
    setSelectedGangLegacyId((fighter as any).fighter_gang_legacy_id || ''); // Pre-select current gang legacy
    // Reset the explicit selection flag when loading a new fighter
    setHasExplicitlySelectedType(false);
  }, [fighter.id, fighterTypes]); // Update when fighter or fighter types data changes

  // Pre-populate current fighter type and sub-type when fighter types are loaded
  useEffect(() => {
    if (fighterTypes.length > 0 && !hasExplicitlySelectedType) {
      // Find the current fighter type
      const currentFighterTypeId = (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id;
      if (currentFighterTypeId) {
        const currentType = fighterTypes.find(ft => ft.id === currentFighterTypeId);
        if (currentType) {
          // Find the fighter type that would actually appear in the dropdown
          // The dropdown uses complex logic to select the "preferred" version for each type+class combo
          const allVariantsOfType = fighterTypes.filter(ft => 
            ft.fighter_type === currentType.fighter_type && 
            ft.fighter_class === currentType.fighter_class
          );
          
          // Use the same logic as the dropdown: prefer fighters with empty sub_type (default version)
          let dropdownType = allVariantsOfType.find(ft => 
            !(ft as any).sub_type || Object.keys((ft as any).sub_type).length === 0
          );
          
          // If no default version, take the cheapest one (same as dropdown logic)
          if (!dropdownType && allVariantsOfType.length > 0) {
            dropdownType = allVariantsOfType.reduce((cheapest, current) => 
              current.total_cost < cheapest.total_cost ? current : cheapest
            );
          }
          
          const dropdownId = dropdownType ? dropdownType.id : currentFighterTypeId;
          setSelectedFighterTypeId(dropdownId);
          
          // Update form values with current type
          setFormValues(prev => ({
            ...prev,
            fighter_type: currentType.fighter_type,
            fighter_class: currentType.fighter_class,
            fighter_class_id: currentType.fighter_class_id
          }));

          // Update available legacies for the current fighter type
          setAvailableLegacies(currentType.available_legacies || []);

          // Check for sub-types in the same way as the main logic
          const fighterTypeGroup = fighterTypes.filter(t => 
            t.fighter_type === currentType.fighter_type && 
            t.fighter_class === currentType.fighter_class
          );
          
          // Create sub-type options
          const subTypeOptions: Array<{ value: string; label: string; cost: number; fighterTypeId: string }> = [];
          
          // Find the default fighter type (the one with no sub-type)
          const defaultFighterType = fighterTypeGroup.find(ft => !(ft as any).sub_type || Object.keys((ft as any).sub_type).length === 0);
          
          // Only add "Default" option if there's actually a default fighter type
          if (defaultFighterType) {
            subTypeOptions.push({
              value: '', // Empty string represents "Default"
              label: 'Default',
              cost: 0,
              fighterTypeId: defaultFighterType.id
            });
          }
          
          // Add all other sub-types
          fighterTypeGroup.forEach(ft => {
            const subTypeName = (ft as any).sub_type?.sub_type_name;
            const subTypeId = (ft as any).sub_type?.id;
            if (subTypeName && subTypeId) {
              subTypeOptions.push({
                value: subTypeId,
                label: subTypeName,
                cost: (ft as any).sub_type?.cost || 0,
                fighterTypeId: ft.id
              });
            }
          });
          
          // Sort sub-types alphabetically (Default will always be first if it exists)
          subTypeOptions.sort((a, b) => {
            if (a.label === 'Default') return -1;
            if (b.label === 'Default') return 1;
            return a.label.localeCompare(b.label);
          });
          
          setAvailableSubTypes(subTypeOptions);

          // Set current sub-type if fighter has one
          if (fighter.fighter_sub_type?.fighter_sub_type_id) {
            // Find the fighter type that matches this sub-type ID
            const matchingFighterType = fighterTypes.find(ft => 
              ft.fighter_sub_type_id === fighter.fighter_sub_type?.fighter_sub_type_id
            );
            
            if (matchingFighterType) {
              setSelectedSubTypeId(matchingFighterType.fighter_sub_type_id || '');
            }
          } else {
            // Fighter has no sub-type (Default), select the "Default" option
            setSelectedSubTypeId('');
          }
        }
      }
    }
  }, [fighterTypes, fighter, hasExplicitlySelectedType]);

  const handleChange = (field: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Update the handleFighterTypeChange function
  const handleFighterTypeChange = (fighterTypeId: string) => {
    setSelectedFighterTypeId(fighterTypeId);
    
    // Set flag to indicate user has explicitly selected a fighter type
    setHasExplicitlySelectedType(true);
    
    // Find the selected fighter type
    const selectedType = fighterTypes.find((ft: any) => ft.id === fighterTypeId);
    
    if (selectedType) {
      // Update form values with selected type
      setFormValues(prev => ({
        ...prev,
        fighter_type: selectedType.fighter_type,
        fighter_class: selectedType.fighter_class,
        fighter_class_id: selectedType.fighter_class_id
      }));

      // Update available legacies for the selected fighter type
      setAvailableLegacies(selectedType.available_legacies || []);

      // Get all fighters with the same fighter_type name and fighter_class to check for sub-types
      const fighterTypeGroup = fighterTypes.filter(t => 
        t.fighter_type === selectedType.fighter_type &&
        t.fighter_class === selectedType.fighter_class
      );
      
      // If we have multiple entries with the same fighter_type + class, they represent different sub-types
      if (fighterTypeGroup.length > 1) {
        // Create sub-type options from all variants
        const subTypeOptions: Array<{ value: string; label: string; cost: number; fighterTypeId: string }> = [];
        
        // Find the default fighter type (the one with no sub-type)
        const defaultFighterType = fighterTypeGroup.find(ft => !(ft as any).sub_type || Object.keys((ft as any).sub_type).length === 0);
        
        // Only add "Default" option if there's actually a default fighter type
        if (defaultFighterType) {
          subTypeOptions.push({
            value: '', // Empty string represents "Default"
            label: 'Default',
            cost: 0,
            fighterTypeId: defaultFighterType.id
          });
        }
        
        fighterTypeGroup.forEach(ft => {
          // Use the actual sub_type data from the API response
          const subTypeName = (ft as any).sub_type?.sub_type_name;
          const subTypeId = (ft as any).sub_type?.id;
          
          if (subTypeName && subTypeId) {
            subTypeOptions.push({
              value: subTypeId,
              label: subTypeName,
              cost: (ft as any).sub_type?.cost || 0,
              fighterTypeId: ft.id
            });
          }
        });
        
        // Sort sub-types alphabetically (Default will always be first if it exists)
        subTypeOptions.sort((a, b) => {
          if (a.label === 'Default') return -1;
          if (b.label === 'Default') return 1;
          return a.label.localeCompare(b.label);
        });
        
        setAvailableSubTypes(subTypeOptions);

        // Try to find a matching sub-type from the current fighter
        const currentSubTypeName = fighter.fighter_sub_type?.fighter_sub_type || fighter.fighter_sub_type;
        if (currentSubTypeName) {
          // Find the sub-type option that matches the current sub-type name
          const matchingSubType = subTypeOptions.find(option => 
            option.label === currentSubTypeName
          );
          
          if (matchingSubType) {
            // Set the matching sub-type
            setSelectedSubTypeId(matchingSubType.value);
          } else {
            // No matching sub-type found, select Default
            setSelectedSubTypeId('');
          }
        } else {
          // No current sub-type, select Default
          setSelectedSubTypeId('');
        }
      } else {
        // Only one variant, no sub-types to choose from
        setAvailableSubTypes([]);
        setSelectedSubTypeId('');
      }
    }
  };
  
  // Add handler for sub-type change
  const handleSubTypeChange = (subTypeId: string) => {
    setSelectedSubTypeId(subTypeId);
  };

  // Add handler for gang legacy change
  const handleGangLegacyChange = (legacyId: string) => {
    setSelectedGangLegacyId(legacyId);
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

  // Receive draft adjustments from stats modal; preview only
  const handleUpdateStats = async (stats: Record<string, number>) => {
    setPendingStatAdjustments(stats);
    setShowStatsModal(false);
  };

  // Compose preview fighter by overlaying a synthetic user effect from pendingStatAdjustments
  const previewFighter: Fighter = useMemo(() => {
    if (!pendingStatAdjustments || Object.keys(pendingStatAdjustments).length === 0) return currentFighter;
    const modifiers = Object.entries(pendingStatAdjustments).map(([prop, delta]) => ({
      id: `preview-${prop}`,
      fighter_effect_id: 'preview',
      stat_name: prop,
      numeric_value: delta,
    }));
    const previewEffect = { id: 'preview-user', effect_name: 'Preview', fighter_effect_modifiers: modifiers } as any;
    return {
      ...currentFighter,
      effects: {
        ...currentFighter.effects,
        user: [...(currentFighter.effects?.user || []), previewEffect]
      }
    } as Fighter;
  }, [currentFighter, pendingStatAdjustments]);

  // Update the handleConfirm function
  const handleConfirm = async () => {
    try {
      // Get the selected fighter type details - use existing if not explicitly changed
      let selectedFighterType = selectedFighterTypeId ? 
        fighterTypes.find((ft: any) => ft.id === selectedFighterTypeId) : 
        null;
      
      // Get the selected sub-type details (without affecting fighter type)
      type SubType = { id: string; fighter_sub_type: string; cost: number; fighterTypeId: string; };
      let selectedSubType: SubType | null = null;
      
      if (selectedSubTypeId !== undefined && selectedSubTypeId !== null && selectedSubTypeId !== '') {
        // Find the sub-type in the currently available sub-types only
        const foundSubType = availableSubTypes.find(st => st.value === selectedSubTypeId);
        if (foundSubType) {
          selectedSubType = {
            id: foundSubType.value, // This will now be the correct sub_type_id
            fighter_sub_type: foundSubType.label,
            cost: foundSubType.cost || 0,
            fighterTypeId: foundSubType.fighterTypeId || '' // Store the fighter_type_id
          };
        }
      } else if (selectedSubTypeId === '') {
        // "Default" is selected
        const defaultOption = availableSubTypes.find(st => st.value === '');
        selectedSubType = {
          id: '',
          fighter_sub_type: 'Default',
          cost: 0,
          fighterTypeId: defaultOption ? defaultOption.fighterTypeId || '' : ''
        };
      }
      
      // Determine which fighter type to use for the update
      let fighterTypeToUse = null;
      let shouldUpdateFighterType = false;
      
      if (hasExplicitlySelectedType && selectedFighterType) {
        // User explicitly selected a new fighter type
        if (selectedSubType && selectedSubType.fighter_sub_type !== 'Default' && selectedSubType.fighterTypeId) {
          // User also selected a sub-type - use the fighter type that contains that sub-type
          const fighterTypeWithSubType = fighterTypes.find(ft => ft.id === selectedSubType!.fighterTypeId);
          if (fighterTypeWithSubType) {
            fighterTypeToUse = fighterTypeWithSubType;
            shouldUpdateFighterType = true;
          }
        } else {
          // No sub-type selected or Default selected - use the selected fighter type
          fighterTypeToUse = selectedFighterType;
          shouldUpdateFighterType = true;
        }
      } else if (selectedSubType) {
        // User changed sub-type (either explicitly or implicitly) - always update fighter type ID
        if (selectedSubType.fighter_sub_type !== 'Default' && selectedSubType.id) {
          // User selected a specific sub-type - find the fighter type with that sub-type
          
          // Get the actual fighter type and class values
          const currentFighterType = (fighter.fighter_type as any)?.fighter_type || fighter.fighter_type;
          const currentFighterClass = (fighter.fighter_class as any)?.class_name || fighter.fighter_class;
          
          const availableFighterTypes = fighterTypes.filter(ft => 
            ft.fighter_type === currentFighterType && ft.fighter_class === currentFighterClass
          );
          
          const fighterTypeWithSubType = fighterTypes.find(ft => 
            ft.fighter_sub_type_id === selectedSubType!.id &&
            ft.fighter_type === currentFighterType &&
            ft.fighter_class === currentFighterClass
          );
          if (fighterTypeWithSubType) {
            fighterTypeToUse = fighterTypeWithSubType;
            shouldUpdateFighterType = true;
          }
        } else if (selectedSubType.fighter_sub_type === 'Default' && selectedSubType.fighterTypeId) {
          // User selected Default - use the fighter type ID from the Default option
          const defaultFighterType = fighterTypes.find(ft => ft.id === selectedSubType!.fighterTypeId);
          if (defaultFighterType) {
            fighterTypeToUse = defaultFighterType;
            shouldUpdateFighterType = true;
          }
        }
      }
      
      // Call onSubmit with all values, including sub-type fields
      const submitData = {
        name: formValues.name,
        label: formValues.label,
        kills: formValues.kills,
        costAdjustment: formValues.costAdjustment,
        fighter_class: shouldUpdateFighterType && fighterTypeToUse ? fighterTypeToUse.fighter_class : undefined,
        fighter_class_id: shouldUpdateFighterType && fighterTypeToUse ? fighterTypeToUse.fighter_class_id : undefined,
        fighter_type: shouldUpdateFighterType && fighterTypeToUse ? fighterTypeToUse.fighter_type : undefined,
        fighter_type_id: shouldUpdateFighterType && fighterTypeToUse ? fighterTypeToUse.id : (fighter.fighter_type as any)?.fighter_type_id || (fighter as any).fighter_type_id,
        special_rules: formValues.special_rules,
        fighter_sub_type: selectedSubType && selectedSubType.fighter_sub_type !== 'Default' ? selectedSubType.fighter_sub_type : null,
        fighter_sub_type_id: selectedSubType && selectedSubType.fighter_sub_type !== 'Default' ? selectedSubType.id : null,
        fighter_gang_legacy_id: selectedGangLegacyId || null
      };
      
      // If lifecycle callbacks are provided, use TanStack mutation and close immediately
      if (onEditMutate || onEditError || onEditSuccess) {
        mutation.mutate(submitData);
        return true; // close immediately
      }

      // Fallback to legacy onSubmit path if provided
      if (onSubmit) {
        const ok = await onSubmit(submitData);
        if (ok) {
          toast({ description: 'Fighter updated successfully', variant: 'default' });
          onClose();
        }
        return ok;
      }

      // If no path available, prevent close
      toast({ description: 'No submit handler provided', variant: 'destructive' });
      return false;
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
                {(() => {
                  // Create a map to group fighters by type+class and find default version for each
                  const typeClassMap = new Map();
                  
                  fighterTypes.forEach(fighter => {
                    const key = `${fighter.fighter_type}-${fighter.fighter_class}`;
                    
                    if (!typeClassMap.has(key)) {
                      typeClassMap.set(key, {
                        fighter: fighter,
                        cost: fighter.total_cost
                      });
                    } else {
                      const current = typeClassMap.get(key);
                      
                      // Prefer fighters with empty sub_type (default version) for the main dropdown
                      const currentHasEmptySubType = !(current.fighter as any).sub_type || Object.keys((current.fighter as any).sub_type).length === 0;
                      const fighterHasEmptySubType = !(fighter as any).sub_type || Object.keys((fighter as any).sub_type).length === 0;
                      
                      if (fighterHasEmptySubType && !currentHasEmptySubType) {
                        // This fighter has empty sub_type, current doesn't - prefer this one
                        typeClassMap.set(key, {
                          fighter: fighter,
                          cost: fighter.total_cost
                        });
                      } else if (currentHasEmptySubType && !fighterHasEmptySubType) {
                        // Current has empty sub_type, this one doesn't - keep current
                        // Do nothing
                      } else {
                        // Both have same sub_type status, take the cheaper option
                        if (fighter.total_cost < current.cost) {
                          typeClassMap.set(key, {
                            fighter: fighter,
                            cost: fighter.total_cost
                          });
                        }
                      }
                    }
                  });
                  
                  // Convert the map values to an array and sort
                  return Array.from(typeClassMap.values())
                    .sort((a, b) => {
                      const classRankA = fighterClassRank[a.fighter.fighter_class.toLowerCase()] ?? Infinity;
                      const classRankB = fighterClassRank[b.fighter.fighter_class.toLowerCase()] ?? Infinity;

                      if (classRankA !== classRankB) {
                        return classRankA - classRankB;
                      }

                      return a.cost - b.cost;
                    })
                    .map(({ fighter }) => {
                      const displayName = `${fighter.fighter_type} (${fighter.fighter_class})`;
                      const gangVariantSuffix = (fighter as any).is_gang_variant ? ` - ${(fighter as any).gang_variant_name}` : '';
                      
                      
                      return (
                        <option key={fighter.id} value={fighter.id}>
                          {displayName}{gangVariantSuffix}
                        </option>
                      );
                    });
                })()}
              </select>
              {fighter.fighter_type && (
                <div className="mt-1 text-sm text-muted-foreground">
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
            
            {/* Sub-type Dropdown - show when we have sub-types (including Default) */}
            {selectedFighterTypeId && availableSubTypes.length > 0 && (
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
                {(fighter as any).fighter_sub_type ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: {typeof (fighter as any).fighter_sub_type === 'object' 
                      ? (fighter as any).fighter_sub_type.sub_type_name || (fighter as any).fighter_sub_type.fighter_sub_type
                      : (fighter as any).fighter_sub_type}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: Default
                  </div>
                )}
              </div>
            )}
            
            {/* Gang Legacy Dropdown */}
            {availableLegacies.length > 0 && (
              <div>
                <label htmlFor="fighter_gang_legacy_id" className="block text-sm font-medium mb-1">
                  Gang Legacy
                </label>
                <select
                  id="fighter_gang_legacy_id"
                  value={selectedGangLegacyId}
                  onChange={(e) => handleGangLegacyChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">
                    No Legacy
                  </option>
                  {availableLegacies.map((legacy) => (
                    <option key={legacy.id} value={legacy.id}>
                      {legacy.name}
                    </option>
                  ))}
                </select>
                {(fighter as any).fighter_gang_legacy ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: {typeof (fighter as any).fighter_gang_legacy === 'object' 
                      ? (fighter as any).fighter_gang_legacy.name
                      : (fighter as any).fighter_gang_legacy}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Current: No Legacy
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
                    className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialRule(rule)}
                      className="ml-2 text-muted-foreground hover:text-muted-foreground focus:outline-none"
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
              {/* Preview pending adjustments in the table by overlaying a synthetic user effect */}
              <FighterCharacteristicTable fighter={previewFighter} />
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