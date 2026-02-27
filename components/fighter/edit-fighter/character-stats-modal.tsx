import { useState, useMemo } from 'react';
import { FighterEffect, FighterProps as Fighter } from '@/types/fighter';
import { Button } from "@/components/ui/button";
import { LuPlus } from "react-icons/lu";
import { LuMinus } from "react-icons/lu";

type StatKey = "M" | "WS" | "BS" | "S" | "T" | "W" | "I" | "A" | "Ld" | "Cl" | "Wil" | "Int";

interface Stat {
  key: StatKey;
  name: string;
  value: string;
}

interface CharacterStatsModalProps {
  onClose: () => void;
  fighter: Fighter;
  onUpdateStats: (stats: Record<string, number>) => void;
  isSaving?: boolean;
}

export function CharacterStatsModal({
  onClose,
  fighter,
  onUpdateStats,
  isSaving = false
}: CharacterStatsModalProps) {
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
      <div className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50" onClick={isSaving ? undefined : onClose}></div>
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
                      <LuMinus className="h-4 w-4" />
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
                      <LuPlus className="h-4 w-4" />
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
