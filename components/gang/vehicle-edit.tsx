'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LuPlus } from "react-icons/lu";
import { LuMinus } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import { VehicleProps, VehicleEffect } from '@/types/vehicle';

type CombinedVehicleProps = VehicleProps & {
  assigned_to?: string;
};

interface VehicleEditProps {
  vehicle: CombinedVehicleProps | null;
  onClose: () => void;
  onSave: (vehicleId: string, vehicleName: string, specialRules: string[], statAdjustments?: Record<string, number>) => Promise<boolean>;
  isLoading?: boolean;
}

// Vehicle Characteristic Table component
function VehicleCharacteristicTable({ vehicle }: { vehicle: CombinedVehicleProps }) {
  const stats = [
    { key: 'movement', label: 'M' },
    { key: 'front', label: 'Front' },
    { key: 'side', label: 'Side' },
    { key: 'rear', label: 'Rear' },
    { key: 'hull_points', label: 'HP' },
    { key: 'handling', label: 'Hnd' },
    { key: 'save', label: 'Sv' }
  ];

  const getStat = (vehicle: CombinedVehicleProps, key: string): number => {
    return vehicle[key as keyof CombinedVehicleProps] as number || 0;
  };

  const calculateEffectsForCategory = useMemo(() => {
    return (categoryName: string) => {
      const effects: Record<string, number> = {};
      const categoryEffects = vehicle.effects?.[categoryName];
      if (categoryEffects && Array.isArray(categoryEffects)) {
        categoryEffects.forEach((effect: VehicleEffect) => {
          effect.fighter_effect_modifiers?.forEach(modifier => {
            const statName = modifier.stat_name.toLowerCase();
            const numValue = parseInt(modifier.numeric_value.toString());
            effects[statName] = (effects[statName] || 0) + numValue;
          });
        });
      }
      return effects;
    };
  }, [vehicle.effects]);

  const lastingDamagesEffects = useMemo(() => calculateEffectsForCategory('lasting damages'), [calculateEffectsForCategory]);
  const vehicleUpgradesEffects = useMemo(() => calculateEffectsForCategory('vehicle upgrades'), [calculateEffectsForCategory]);
  const userEffects = useMemo(() => calculateEffectsForCategory('user'), [calculateEffectsForCategory]);
  const userHasNonZero = useMemo(() => Object.values(userEffects).some(v => (v || 0) !== 0), [userEffects]);

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
              const baseValue = getStat(vehicle, stat.key);
              return (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {stat.key === 'movement' ? `${baseValue}"` :
                   stat.key === 'handling' || stat.key === 'save' ? `${baseValue}+` :
                   baseValue}
                </td>
              );
            })}
          </tr>

          {/* Lasting Damages row */}
          {vehicle.effects?.['lasting damages'] && vehicle.effects['lasting damages'].length > 0 && (
            <tr className="bg-red-50 dark:bg-red-950">
              <td className="px-1 py-1 font-medium text-xs">Damage</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {lastingDamagesEffects[stat.key] ? lastingDamagesEffects[stat.key] : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Vehicle Upgrades row */}
          {vehicle.effects?.['vehicle upgrades'] && vehicle.effects['vehicle upgrades'].length > 0 && (
            <tr className="bg-blue-50 dark:bg-blue-950">
              <td className="px-1 py-1 font-medium text-xs">Upgrades</td>
              {stats.map(stat => (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {vehicleUpgradesEffects[stat.key] ? vehicleUpgradesEffects[stat.key] : '-'}
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

          {/* Total row - always shown */}
          <tr className="bg-muted font-bold">
            <td className="px-1 py-1 text-xs">Total</td>
            {stats.map(stat => {
              const baseValue = getStat(vehicle, stat.key);
              const damageValue = lastingDamagesEffects[stat.key] || 0;
              const upgradeValue = vehicleUpgradesEffects[stat.key] || 0;
              const userValue = userEffects[stat.key] || 0;
              const total = baseValue + damageValue + upgradeValue + userValue;

              return (
                <td key={stat.key} className="border-l border-border text-center text-xs">
                  {stat.key === 'movement' ? `${total}"` :
                   stat.key === 'handling' || stat.key === 'save' ? `${total}+` :
                   total}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Define StatKey type for vehicle stats
type VehicleStatKey = "M" | "Front" | "Side" | "Rear" | "HP" | "Hnd" | "Sv";

interface VehicleStat {
  key: VehicleStatKey;
  name: string;
  value: string;
}

// Vehicle Characteristic Modal component
function VehicleCharacteristicModal({
  onClose,
  vehicle,
  onUpdateStats,
  isSaving = false
}: {
  onClose: () => void;
  vehicle: CombinedVehicleProps;
  onUpdateStats: (stats: Record<string, number>) => void;
  isSaving?: boolean;
}) {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({
    movement: 0,
    front: 0,
    side: 0,
    rear: 0,
    hull_points: 0,
    handling: 0,
    save: 0
  });

  const displayStats = useMemo((): VehicleStat[] => {
    return [
      { key: "M", name: "Movement", value: `${vehicle.movement || 0}"` },
      { key: "Front", name: "Front Armour", value: `${vehicle.front || 0}` },
      { key: "Side", name: "Side Armour", value: `${vehicle.side || 0}` },
      { key: "Rear", name: "Rear Armour", value: `${vehicle.rear || 0}` },
      { key: "HP", name: "Hull Points", value: `${vehicle.hull_points || 0}` },
      { key: "Hnd", name: "Handling", value: `${vehicle.handling || 0}+` },
      { key: "Sv", name: "Save", value: `${vehicle.save || 0}+` }
    ];
  }, [vehicle]);

  const getPropertyName = (key: VehicleStatKey): string => {
    switch (key) {
      case "M": return "movement";
      case "Front": return "front";
      case "Side": return "side";
      case "Rear": return "rear";
      case "HP": return "hull_points";
      case "Hnd": return "handling";
      case "Sv": return "save";
      default: return "";
    }
  };

  const handleIncrease = (key: VehicleStatKey) => {
    const propName = getPropertyName(key);
    setAdjustments(prev => ({
      ...prev,
      [propName]: prev[propName] + 1
    }));
  };

  const handleDecrease = (key: VehicleStatKey) => {
    const propName = getPropertyName(key);
    setAdjustments(prev => ({
      ...prev,
      [propName]: prev[propName] - 1
    }));
  };

  const getBaseValue = (key: VehicleStatKey): number => {
    const propName = getPropertyName(key);
    return vehicle[propName as keyof CombinedVehicleProps] as number || 0;
  };

  const getCurrentTotal = (key: VehicleStatKey): number => {
    const propName = getPropertyName(key);
    const baseValue = vehicle[propName as keyof CombinedVehicleProps] as number || 0;

    let modifiers = 0;

    const processEffects = (effects: VehicleEffect[] | undefined) => {
      effects?.forEach(effect => {
        effect.fighter_effect_modifiers?.forEach(modifier => {
          if (modifier.stat_name.toLowerCase() === propName.toLowerCase()) {
            modifiers += parseInt(modifier.numeric_value.toString());
          }
        });
      });
    };

    processEffects(vehicle.effects?.['lasting damages']);
    processEffects(vehicle.effects?.['vehicle upgrades']);
    processEffects(vehicle.effects?.user);

    return baseValue + modifiers;
  };

  const getAdjustedTotal = (key: VehicleStatKey): string => {
    const propName = getPropertyName(key);
    const currentTotal = getCurrentTotal(key);
    const withAdjustment = currentTotal + (adjustments[propName] || 0);

    if (key === "M") return `${withAdjustment}"`;
    if (key === "Hnd" || key === "Sv") return `${withAdjustment}+`;
    return `${withAdjustment}`;
  };

  const getBaseDisplay = (key: VehicleStatKey): string => {
    const baseValue = getBaseValue(key);

    if (key === "M") return `${baseValue}"`;
    if (key === "Hnd" || key === "Sv") return `${baseValue}+`;
    return `${baseValue}`;
  };

  const handleSave = () => {
    const updatedStats: Record<string, number> = {};
    for (const [propName, adjustment] of Object.entries(adjustments)) {
      if (adjustment !== 0) updatedStats[propName] = adjustment;
    }
    onUpdateStats(updatedStats);
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
            {displayStats.map((stat) => (
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
                    <span className="text-sm md:text-xl font-bold">
                      {getAdjustedTotal(stat.key)}
                    </span>
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
            ))}
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

export default function VehicleEdit({
  vehicle,
  onClose,
  onSave,
  isLoading = false
}: VehicleEditProps) {
  const [editedVehicleName, setEditedVehicleName] = useState('');
  const [vehicleSpecialRules, setVehicleSpecialRules] = useState<string[]>([]);
  const [newSpecialRule, setNewSpecialRule] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [pendingStatAdjustments, setPendingStatAdjustments] = useState<Record<string, number>>({});

  // Initialize state when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setEditedVehicleName(vehicle.vehicle_name);
      setVehicleSpecialRules(vehicle.special_rules || []);
      setNewSpecialRule('');
      setPendingStatAdjustments({});
    }
  }, [vehicle]);

  const handleAddSpecialRule = () => {
    if (!newSpecialRule.trim()) return;

    if (vehicleSpecialRules.includes(newSpecialRule.trim())) {
      setNewSpecialRule('');
      return;
    }

    setVehicleSpecialRules(prev => [...prev, newSpecialRule.trim()]);
    setNewSpecialRule('');
  };

  const handleRemoveSpecialRule = (ruleToRemove: string) => {
    setVehicleSpecialRules(prev => prev.filter(rule => rule !== ruleToRemove));
  };

  const handleUpdateStats = (stats: Record<string, number>) => {
    setPendingStatAdjustments(stats);
    setShowStatsModal(false);
  };

  // Compose preview vehicle by overlaying a synthetic user effect from pendingStatAdjustments
  const previewVehicle: CombinedVehicleProps = useMemo(() => {
    if (!vehicle || !pendingStatAdjustments || Object.keys(pendingStatAdjustments).length === 0) {
      return vehicle || {} as CombinedVehicleProps;
    }
    const modifiers = Object.entries(pendingStatAdjustments).map(([prop, delta]) => ({
      id: `preview-${prop}`,
      fighter_effect_id: 'preview',
      stat_name: prop,
      numeric_value: delta,
    }));
    const previewEffect = { id: 'preview-user', effect_name: 'Preview', fighter_effect_modifiers: modifiers };
    return {
      ...vehicle,
      effects: {
        ...vehicle.effects,
        user: [...(vehicle.effects?.user || []), previewEffect]
      }
    };
  }, [vehicle, pendingStatAdjustments]);

  const handleConfirm = async () => {
    if (!vehicle) return false;

    const statAdjustments = Object.keys(pendingStatAdjustments).length > 0 ? pendingStatAdjustments : undefined;
    const success = await onSave(vehicle.id, editedVehicleName, vehicleSpecialRules, statAdjustments);

    if (success) {
      onClose();
    }

    return success;
  };

  if (!vehicle) return null;

  // Check if vehicle has characteristic data
  const hasCharacteristics = vehicle.movement !== undefined || vehicle.front !== undefined;

  return (
    <>
      <Modal
        title="Edit Vehicle"
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmText="Save"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="vehicleName" className="block text-sm font-medium text-muted-foreground">
              Vehicle Name
            </label>
            <Input
              type="text"
              id="vehicleName"
              value={editedVehicleName}
              onChange={(e) => setEditedVehicleName(e.target.value)}
              className="mt-1 w-full"
              placeholder="Enter vehicle name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Special Rules
            </label>
            <div className="flex space-x-2 mb-2">
              <Input
                type="text"
                value={newSpecialRule}
                onChange={(e) => setNewSpecialRule(e.target.value)}
                placeholder="Add a special rule"
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

            <div className="flex flex-wrap gap-2 mt-2">
              {vehicleSpecialRules.map((rule, index) => (
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
                    <HiX size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Characteristics Section - only show if vehicle has characteristic data */}
          {hasCharacteristics && (
            <div>
              <h3 className="text-sm font-medium mb-2">Characteristics</h3>
              <VehicleCharacteristicTable vehicle={previewVehicle} />
              <Button
                onClick={() => setShowStatsModal(true)}
                className="w-full mt-2"
              >
                Adjust Characteristics
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Stats modal */}
      {showStatsModal && vehicle && (
        <VehicleCharacteristicModal
          onClose={() => setShowStatsModal(false)}
          vehicle={vehicle}
          onUpdateStats={handleUpdateStats}
          isSaving={false}
        />
      )}
    </>
  );
}
