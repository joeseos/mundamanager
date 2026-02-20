'use client';

import React, { useEffect, useState, useRef } from 'react';
import Modal from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";
import { Equipment, EquipmentGrants } from '@/types/equipment';
import FighterEffectSelection from '@/components/fighter-effect-selection';

interface PurchaseModalProps {
  item: Equipment;
  gangCredits: number;
  onClose: () => void;
  onConfirm: (
    cost: number,
    isMasterCrafted: boolean,
    useBaseCostForRating: boolean,
    selectedEffectIds?: string[],
    equipmentTarget?: { target_equipment_id: string; effect_type_id: string },
    selectedGrantEquipmentIds?: string[]
  ) => void;
  isStashPurchase?: boolean;
  fighterId?: string;
  gangId?: string;
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
  equipmentListType?: "fighters-list" | "fighters-tradingpost" | "unrestricted";
}

export function PurchaseModal({ item, gangCredits, onClose, onConfirm, isStashPurchase, fighterId, gangId, fighterWeapons, equipmentListType }: PurchaseModalProps) {
  const [manualCost, setManualCost] = useState<string>(String(item.adjusted_cost ?? item.cost));
  const [creditError, setCreditError] = useState<string | null>(null);
  const [isMasterCrafted, setIsMasterCrafted] = useState(false);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);
  const [showEffectSelection, setShowEffectSelection] = useState(false);
  const [showTargetSelection, setShowTargetSelection] = useState(false);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const [effectTypes, setEffectTypes] = useState<any[]>([]);
  const effectSelectionRef = useRef<{ handleConfirm: () => Promise<boolean>; isValid: () => boolean; getSelectedEffects: () => string[] } | null>(null);
  const [upgradeEffect, setUpgradeEffect] = useState<{ id: string; name: string } | null>(null);

  // Grants selection state
  const [showGrantsSelection, setShowGrantsSelection] = useState(false);
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([]);
  const [grantOptions, setGrantOptions] = useState<Array<{ id: string; name: string; cost: number; additional_cost: number }>>([]);
  const [grantsConfig, setGrantsConfig] = useState<EquipmentGrants | null>(null);

  const calculateMasterCraftedCost = (baseCost: number) => {
    // Increase by 25% and round up to nearest 5
    const increased = baseCost * 1.25;
    return Math.ceil(increased / 5) * 5;
  };

  useEffect(() => {
    const baseCost = item.adjusted_cost ?? item.cost;
    const newCost = isMasterCrafted && item.equipment_type === 'weapon' 
      ? calculateMasterCraftedCost(baseCost)
      : baseCost;
    
    setManualCost(String(newCost));
  }, [isMasterCrafted, item]);

  // Helper to check and show grants selection if needed
  const checkAndShowGrantsSelection = async (effectIds: string[], equipmentTarget?: { target_equipment_id: string; effect_type_id: string }) => {
    const parsedCost = Number(manualCost);

    // Check if this equipment has grants with selection
    if (!item.is_custom && item.grants_equipment) {
      const grants = item.grants_equipment as EquipmentGrants;

      if (grants.selection_type === 'single_select' || grants.selection_type === 'multiple_select') {
        // Use equipment names from the RPC data (already enriched)
        const options = grants.options.map((opt: any) => ({
          id: opt.equipment_id,
          name: opt.equipment_name || 'Unknown',
          cost: 0, // Not needed for display
          additional_cost: opt.additional_cost
        }));

        setGrantOptions(options);
        setGrantsConfig(grants);
        setSelectedEffectIds(effectIds);
        setShowGrantsSelection(true);
        return false; // Don't close modal, show grants selection
      } else if (grants.selection_type === 'fixed') {
        // Fixed grants are handled server-side, proceed with purchase
        onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, effectIds, equipmentTarget, []);
        return true;
      }
    }

    // No grants selection needed
    onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, effectIds, equipmentTarget, []);
    return true;
  };

  const handleConfirm = async () => {
    const parsedCost = Number(manualCost);

    if (isNaN(parsedCost)) {
      setCreditError(`Incorrect input, please update the input value`);
      return false; // Explicitly return false to prevent modal closure
    } else if (parsedCost > 0 && parsedCost > gangCredits) {
      setCreditError(`Not enough credits. Gang Credits: ${gangCredits}`);
      return false; // Explicitly return false to prevent modal closure
    }

    setCreditError(null);

    // If buying to stash, skip effect and grants selection entirely
    if (isStashPurchase) {
      onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, [], undefined, []);
      return true;
    }

    // Pre-check: fetch all effects for this equipment (both equipment upgrades and fighter effects)
    if (!item.is_custom && !showTargetSelection && !showEffectSelection && !showGrantsSelection) {
      try {
        // Fetch all effect types for this equipment (single API call)
        const response = await fetch(`/api/fighter-effects?equipmentId=${item.equipment_id}`);

        if (!response.ok) {
          throw new Error('Failed to fetch fighter effects');
        }

        const fetchedEffectTypes = await response.json();

        // Separate equipment upgrades from fighter effects
        const equipmentUpgrade = fetchedEffectTypes?.find((effect: any) =>
          effect.type_specific_data?.applies_to === 'equipment' &&
          !effect.type_specific_data?.is_editable
        );

        const fighterEffects = fetchedEffectTypes?.filter((effect: any) =>
          effect.type_specific_data?.applies_to !== 'equipment' &&
          effect.type_specific_data?.is_editable !== true
        );

        // Priority 1: Check for equipment upgrade (applies_to=equipment)
        if (equipmentUpgrade) {
          setUpgradeEffect({ id: equipmentUpgrade.id, name: equipmentUpgrade.effect_name });
          setShowTargetSelection(true);
          return false;
        }

        // Priority 2: Check for selectable fighter effects
        const hasSelectableEffects = fighterEffects?.some((effect: any) =>
          effect.type_specific_data?.effect_selection === 'single_select' ||
          effect.type_specific_data?.effect_selection === 'multiple_select'
        );

        if (hasSelectableEffects) {
          setEffectTypes(fighterEffects);
          setShowEffectSelection(true);
          setIsEffectSelectionValid(false);
          return false;
        } else {
          // All effects are fixed, collect them and check for grants selection
          const fixedEffects = fighterEffects
            ?.filter((effect: any) =>
              effect.type_specific_data?.effect_selection === 'fixed' ||
              !effect.type_specific_data?.effect_selection
            )
            .map((effect: any) => effect.id) || [];

          return await checkAndShowGrantsSelection(fixedEffects);
        }
      } catch (error) {
        console.error('Error checking effects:', error);
        // On error, proceed with purchase to avoid blocking the user
        onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds, undefined, selectedGrantIds);
        return true;
      }
    }

    // Note: showTargetSelection, showEffectSelection, and showGrantsSelection are handled by separate modal render paths
    // If we reach here, it means no additional selection is needed
    // Just proceed with purchase
    onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds, undefined, selectedGrantIds);
    return true; // Allow modal to close
  };

  const handleEffectSelectionComplete = async (effectIds: string[]) => {
    setSelectedEffectIds(effectIds);
    setShowEffectSelection(false);
    setEffectTypes([]);
    // Check for grants selection before proceeding
    await checkAndShowGrantsSelection(effectIds);
  };

  const handleEffectSelectionCancel = () => {
    setShowEffectSelection(false);
    setSelectedEffectIds([]);
    setIsEffectSelectionValid(false);
    setEffectTypes([]);
  };

  const handleEffectSelectionValidityChange = (isValid: boolean) => {
    setIsEffectSelectionValid(isValid);
  };

  if (showTargetSelection) {
    return (
      <Modal
        title="Select Weapon"
        content={
          <FighterEffectSelection
            equipmentId={item.equipment_id}
            effectTypes={[]}
            targetSelectionOnly
            fighterId={fighterId}
            modifierEquipmentId={''}
            effectTypeId={upgradeEffect?.id || undefined}
            effectName={upgradeEffect?.name}
            fighterWeapons={fighterWeapons}
            onApplyToTarget={async (targetEquipmentId) => {
              // Execute purchase immediately with the chosen target
              const equipmentTargetData = {
                target_equipment_id: targetEquipmentId,
                effect_type_id: upgradeEffect?.id as string
              };
              onConfirm(Number(manualCost), isMasterCrafted, useBaseCostForRating, selectedEffectIds, equipmentTargetData);
            }}
            onSelectionComplete={() => {
              // No-op; parent onConfirm is triggered by onApplyToTarget
            }}
            onCancel={() => {
              setShowTargetSelection(false);
              setUpgradeEffect(null);
            }}
            onValidityChange={(isValid) => setIsEffectSelectionValid(isValid)}
            ref={effectSelectionRef}
          />
        }
        onClose={onClose}
        onConfirm={async () => {
          return await effectSelectionRef.current?.handleConfirm() || false;
        }}
        confirmText="Confirm"
        confirmDisabled={!isEffectSelectionValid}
        width="lg"
      />
    );
  }

  if (showEffectSelection) {
    return (
      <Modal
        title="Equipment Effects"
        content={
          <FighterEffectSelection
            equipmentId={item.equipment_id}
            effectTypes={effectTypes}
            onSelectionComplete={handleEffectSelectionComplete}
            onCancel={handleEffectSelectionCancel}
            onValidityChange={handleEffectSelectionValidityChange}
            ref={effectSelectionRef}
          />
        }
        onClose={onClose}
        onConfirm={async () => {
          return await effectSelectionRef.current?.handleConfirm() || false;
        }}
        confirmText="Confirm Selection"
        confirmDisabled={!isEffectSelectionValid}
        width="lg"
      />
    );
  }

  if (showGrantsSelection && grantsConfig) {
    const isMultiple = grantsConfig.selection_type === 'multiple_select';
    const maxSelections = grantsConfig.max_selections || grantOptions.length;
    const selectionIsValid = isMultiple
      ? selectedGrantIds.length > 0 && selectedGrantIds.length <= maxSelections
      : selectedGrantIds.length === 1;

    // Calculate total additional cost from selected options
    const totalAdditionalCost = grantOptions
      .filter(opt => selectedGrantIds.includes(opt.id))
      .reduce((sum, opt) => sum + opt.additional_cost, 0);

    // Check if user can afford the total cost (base + additional)
    const baseCost = Number(manualCost);
    const totalCost = baseCost + totalAdditionalCost;
    const canAfford = gangCredits >= totalCost;
    const isValid = selectionIsValid && canAfford;

    return (
      <Modal
        title={isMultiple ? "Select Equipment Options" : "Select Equipment"}
        content={
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isMultiple
                ? `Choose up to ${maxSelections} equipment option${maxSelections > 1 ? 's' : ''} to receive with your purchase:`
                : 'Choose one equipment option to receive with your purchase:'}
            </p>

            <div className="space-y-2">
              {grantOptions.map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                    selectedGrantIds.includes(option.id) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  {isMultiple ? (
                    <Checkbox
                      checked={selectedGrantIds.includes(option.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          if (selectedGrantIds.length < maxSelections) {
                            setSelectedGrantIds([...selectedGrantIds, option.id]);
                          }
                        } else {
                          setSelectedGrantIds(selectedGrantIds.filter(id => id !== option.id));
                        }
                      }}
                      disabled={!selectedGrantIds.includes(option.id) && selectedGrantIds.length >= maxSelections}
                      className="mr-3"
                    />
                  ) : (
                    <input
                      type="radio"
                      name="grant-selection"
                      checked={selectedGrantIds.includes(option.id)}
                      onChange={() => setSelectedGrantIds([option.id])}
                      className="mr-3"
                    />
                  )}
                  <div className="flex-1">
                    <span className="font-medium">{option.name}</span>
                    {option.additional_cost > 0 && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        (+{option.additional_cost} credits)
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {totalAdditionalCost > 0 && (
              <p className="text-sm font-medium">
                Total cost: {baseCost} + {totalAdditionalCost} = {totalCost} credits
              </p>
            )}

            {!canAfford && selectionIsValid && (
              <p className="text-sm text-destructive">
                Insufficient credits (need {totalCost}, have {gangCredits})
              </p>
            )}
          </div>
        }
        onClose={onClose}
        onConfirm={() => {
          onConfirm(
            Number(manualCost),
            isMasterCrafted,
            useBaseCostForRating,
            selectedEffectIds,
            undefined,
            selectedGrantIds
          );
          return true;
        }}
        confirmText="Confirm Purchase"
        confirmDisabled={!isValid}
      />
    );
  }

  return (
    <Modal
      title="Confirm Purchase"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to buy <strong>{item.equipment_name}</strong>?</p>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Cost
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  value={manualCost}
                  onChange={(e) => {
                    const val = e.target.value;

                    // Allow only empty (0), "-", or digits (optionally starting with "-")
                    if (/^-?\d*$/.test(val)) {
                      setManualCost(val);

                      const parsed = Number(val);
                      if (!Number.isNaN(parsed) && parsed <= gangCredits) {
                        setCreditError(null);
                      }
                    }
                  }}
                  className="w-full p-2 border rounded-md"
                  min="0"
                />
              </div>
            </div>
            
            {item.equipment_type === 'weapon' && equipmentListType !== 'fighters-list' && (
              <div className="flex items-center space-x-2 mt-2">
                <Checkbox 
                  id="master-crafted"
                  checked={isMasterCrafted}
                  onCheckedChange={(checked) => setIsMasterCrafted(checked as boolean)}
                />
                <label
                  htmlFor="master-crafted"
                  className="text-sm font-medium text-muted-foreground cursor-pointer"
                >
                  Master-crafted (+25%)
                </label>
                <div className="relative group">
                  <ImInfo />
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-48 -left-24 z-50">
                    Master-crafted weapons are Rare (10).
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2 mb-2 mt-2">
              <Checkbox 
                id="use-base-cost-for-rating"
                checked={useBaseCostForRating}
                onCheckedChange={(checked) => setUseBaseCostForRating(checked as boolean)}
              />
              <label 
                htmlFor="use-base-cost-for-rating" 
                className="text-sm font-medium text-muted-foreground cursor-pointer"
              >
                Use Listed Cost for Rating
              </label>
              <div className="relative group">
                <ImInfo />
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
                When enabled, the Fighter Rating is calculated using the item's listed cost (from the fighter's Equipment List or the Trading Post), even if you paid a different amount. Disable this if you want the rating to reflect the price actually paid.
                </div>
              </div>
            </div>

            {creditError && (
              <p className="text-red-500 text-sm">{creditError}</p>
            )}
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}