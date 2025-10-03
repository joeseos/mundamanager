'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { createClient } from "@/utils/supabase/client";
import { Equipment, WeaponProfile } from '@/types/equipment';
import { ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";
import { LuX } from "react-icons/lu";
import { RangeSlider } from "@/components/ui/range-slider";
import { buyEquipmentForFighter } from '@/app/actions/equipment';
import { Tooltip } from 'react-tooltip';
import FighterEffectSelection from './fighter-effect-selection';

interface ItemModalProps {
  title: string;
  onClose: () => void;
  gangCredits: number;
  gangId: string;
  gangTypeId: string;
  fighterId: string;
  fighterTypeId: string;
  gangAffiliationId?: string | null;
  fighterCredits: number;
  fighterHasLegacy?: boolean;
  fighterLegacyName?: string;
  vehicleId?: string;
  vehicleType?: string;
  vehicleTypeId?: string;
  isVehicleEquipment?: boolean;
  allowedCategories?: string[];
  isStashMode?: boolean;
  isCustomFighter?: boolean;
  onEquipmentBought: (newFighterCredits: number, newGangCredits: number, boughtEquipment: Equipment) => void;
}

interface RawEquipmentData {
  id: string;
  equipment_name: string;
  trading_post_category: string;
  availability: string | null;
  base_cost: number;
  discounted_cost: number;
  adjusted_cost: number;
  equipment_category: string;
  equipment_type: 'weapon' | 'wargear' | 'vehicle_upgrade';
  created_at: string;
  weapon_profiles?: WeaponProfile[];
  fighter_type_equipment: boolean;
  fighter_type_equipment_tp: boolean;
  fighter_weapon_id?: string;
  fighter_equipment_id: string;
  master_crafted?: boolean;
  is_custom: boolean;
  vehicle_upgrade_slot?: string;
}

interface PurchaseModalProps {
  item: Equipment;
  gangCredits: number;
  onClose: () => void;
  onConfirm: (cost: number, isMasterCrafted: boolean, useBaseCostForRating: boolean, selectedEffectIds?: string[]) => void;
  isStashPurchase?: boolean;
}

interface Category {
  id: string;
  category_name: string;
}

function PurchaseModal({ item, gangCredits, onClose, onConfirm, isStashPurchase }: PurchaseModalProps) {
  const [manualCost, setManualCost] = useState<string>(String(item.adjusted_cost ?? item.cost));
  const [creditError, setCreditError] = useState<string | null>(null);
  const [isMasterCrafted, setIsMasterCrafted] = useState(false);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);
  const [showEffectSelection, setShowEffectSelection] = useState(false);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [isEffectSelectionValid, setIsEffectSelectionValid] = useState(false);
  const [effectTypes, setEffectTypes] = useState<any[]>([]);
  const effectSelectionRef = useRef<{ handleConfirm: () => boolean; isValid: () => boolean } | null>(null);

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

  const handleConfirm = () => {
    const parsedCost = Number(manualCost);

    if (isNaN(parsedCost)) {
      setCreditError(`Incorrect input, please update the input value`);
      return false; // Explicitly return false to prevent modal closure
    } else if (parsedCost > gangCredits) {
      setCreditError(`Not enough credits. Gang Credits: ${gangCredits}`);
      return false; // Explicitly return false to prevent modal closure
    }

    setCreditError(null);
    
    // If buying to stash, skip effect selection entirely
    if (isStashPurchase) {
      onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, []);
      return true;
    }
    
    // Check if this equipment has effects that need selection
    if (!item.is_custom && !showEffectSelection) {
      // Check if there are any selectable effects (non-fixed) for this equipment
      const checkSelectableEffects = async () => {
        try {
          // Fetch full effect data including modifiers
          const response = await fetch(`/api/fighter-effects?equipmentId=${item.equipment_id}`);
          
          if (!response.ok) {
            throw new Error('Failed to fetch fighter effects');
          }

          const fetchedEffectTypes = await response.json();
          setEffectTypes(fetchedEffectTypes);

          const hasSelectableEffects = fetchedEffectTypes?.some((effect: any) => 
            effect.type_specific_data?.effect_selection === 'single_select' || 
            effect.type_specific_data?.effect_selection === 'multiple_select'
          );

          if (hasSelectableEffects) {
            setShowEffectSelection(true);
            setIsEffectSelectionValid(false);
            return false; // Don't close modal, show effect selection
          } else {
            // All effects are fixed, collect them and proceed directly with purchase
            const fixedEffects = fetchedEffectTypes
              ?.filter((effect: any) => 
                effect.type_specific_data?.effect_selection === 'fixed' || 
                !effect.type_specific_data?.effect_selection
              )
              .map((effect: any) => effect.id) || [];
            
            onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, fixedEffects);
            return true; // Allow modal to close
          }
        } catch (error) {
          console.error('Error checking selectable effects:', error);
          // On error, proceed with purchase to avoid blocking the user
          onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds);
          return true;
        }
      };

      checkSelectableEffects();
      return false; // Prevent modal from closing while we check
    }
    
    onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds);
    return true; // Allow modal to close
  };

  const handleEffectSelectionComplete = (effectIds: string[]) => {
    setSelectedEffectIds(effectIds);
    setShowEffectSelection(false);
    setEffectTypes([]);
    // Proceed with purchase
    onConfirm(Number(manualCost), isMasterCrafted, useBaseCostForRating, effectIds);
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
        onConfirm={() => {
          return effectSelectionRef.current?.handleConfirm() || false;
        }}
        confirmText="Confirm Selection"
        confirmDisabled={!isEffectSelectionValid}
        width="lg"
      />
    );
  }

  return (
    <Modal
      title="Confirm Purchase"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to buy {item.equipment_name}?</p>
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
            
            {item.equipment_type === 'weapon' && (
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

const ItemModal: React.FC<ItemModalProps> = ({
  title,
  onClose,
  gangCredits,
  gangId,
  gangTypeId,
  fighterId,
  fighterTypeId,
  gangAffiliationId,
  fighterCredits,
  fighterHasLegacy,
  fighterLegacyName,
  vehicleId,
  vehicleType,
  vehicleTypeId,
  isVehicleEquipment,
  allowedCategories,
  isStashMode,
  isCustomFighter = false,
  onEquipmentBought
}) => {
  const TRADING_POST_FIGHTER_TYPE_ID = "03d16c02-4fe2-4fb2-982f-ce0298d91ce5";
  
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<Record<string, Equipment[]>>({});
  const [categoryLoadingStates, setCategoryLoadingStates] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [buyModalData, setBuyModalData] = useState<Equipment | null>(null);
  const [session, setSession] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [equipmentListType, setEquipmentListType] = useState<"fighters-list" | "fighters-tradingpost" | "unrestricted">(
    isStashMode || isCustomFighter ? "fighters-tradingpost" : "fighters-list"
  );
  const [localVehicleTypeId, setLocalVehicleTypeId] = useState<string | undefined>(vehicleTypeId);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [cachedFighterCategories, setCachedFighterCategories] = useState<string[]>([]);
  const [cachedFighterTPCategories, setCachedFighterTPCategories] = useState<string[]>([]);
  const [cachedAllCategories, setCachedAllCategories] = useState<string[]>([]);
  const [cachedEquipment, setCachedEquipment] = useState<Record<string, Record<string, Equipment[]>>>({
    fighter: {},
    all: {}
  });
  const [isLoadingAllEquipment, setIsLoadingAllEquipment] = useState(false);
  const [costRange, setCostRange] = useState<[number, number]>([10, 160]);
  const [availabilityRange, setAvailabilityRange] = useState<[number, number]>([6, 12]);
  const [includeLegacy, setIncludeLegacy] = useState<boolean>(false);
  const [minCost, setMinCost] = useState(10);
  const [maxCost, setMaxCost] = useState(160);
  const [minAvailability, setMinAvailability] = useState(6);
  const [maxAvailability, setMaxAvailability] = useState(12);

  useEffect(() => {
    // Debug: snapshot key props on mount
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const getSession = async () => {
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    getSession();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!session) return;

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equipment_categories?select=id,category_name&order=category_name`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );

        if (!response.ok) throw new Error('Failed to fetch categories');
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
        setError('Failed to load categories');
      }
    };

    if (session) {
      fetchCategories();
    }
  }, [session]);

  useEffect(() => {
    const fetchVehicleTypeId = async () => {
      if (isVehicleEquipment && !localVehicleTypeId && session && vehicleType) {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/vehicle_types?select=id&vehicle_type=eq.${encodeURIComponent(vehicleType)}`,
            {
              headers: {
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
                'Authorization': `Bearer ${session.access_token}`
              }
            }
          );

          if (!response.ok) throw new Error('Failed to fetch vehicle type ID');
          const data = await response.json();
          if (data && data.length > 0) {
            setLocalVehicleTypeId(data[0].id);
          }
        } catch (error) {
          console.error('Error fetching vehicle type ID:', error);
          setError('Could not determine vehicle type. Please try again later.');
        }
      }
    };

    fetchVehicleTypeId();
  }, [isVehicleEquipment, localVehicleTypeId, session, vehicleType]);

  const fetchAllCategories = async (includeLegacyOverride?: boolean) => {
    if (!session || isLoadingAllEquipment) return;
    
    setIsLoadingAllEquipment(true);
    setError(null);


    let resolvedTypeId = isVehicleEquipment 
      ? localVehicleTypeId || vehicleTypeId 
      : fighterTypeId;

    // For gang-level access (when fighterId is empty) or custom fighters, we don't need fighter type validation
    const isGangLevelAccess = !fighterId || fighterId === '';
    const skipFighterTypeValidation = isGangLevelAccess || isCustomFighter;

    // Attempt to resolve missing fighterTypeId from fighterId before failing
    if (!resolvedTypeId && !isVehicleEquipment && !skipFighterTypeValidation && fighterId) {
      try {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighters?select=fighter_type_id&id=eq.${fighterId}`,
          {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );
        if (resp.ok) {
          const rows = await resp.json();
          const fetchedTypeId = rows?.[0]?.fighter_type_id;
          if (fetchedTypeId) {
            resolvedTypeId = fetchedTypeId;
          } else {
          }
        } else {
        }
      } catch (e) {
      }
    }


    if (!gangTypeId || (!resolvedTypeId && !skipFighterTypeValidation)) {
      const errorMessage = isVehicleEquipment && !resolvedTypeId
        ? `Vehicle type information is missing. Vehicle: ${vehicleType || 'unknown'}`
        : !resolvedTypeId && !skipFighterTypeValidation
        ? 'Fighter type information is missing'
        : 'Required information is missing';
      setError(errorMessage);
      return;
    }

    try {
      const requestBody: Record<string, any> = {
        gang_type_id: gangTypeId,
        gang_id: gangId,  // ✅ Always pass - it's always available
        // Don't specify equipment_category to get ALL equipment
      };

      // Add fighter_type_id if available
      if (resolvedTypeId) {
        requestBody.fighter_type_id = resolvedTypeId;
      }

      // Add equipment filtering
      if (equipmentListType === 'fighters-list') {
        requestBody.fighter_type_equipment = true;
      }
      if (equipmentListType === 'fighters-tradingpost') {
        requestBody.equipment_tradingpost = true;
      }

      // Include fighter_id so RPC can resolve legacy fighter type availability/discounts
      // Pass fighter_id if: legacy toggle enabled OR gang has affiliation
      const useLegacy = includeLegacyOverride !== undefined ? includeLegacyOverride : includeLegacy;
      const hasGangAffiliation = Boolean(gangAffiliationId);
      if (!isVehicleEquipment && fighterId && (useLegacy || hasGangAffiliation)) {
        requestBody.fighter_id = fighterId;
      }


      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_equipment_with_discounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch fighter equipment');
      }

      const data: RawEquipmentData[] = await response.json();



      // Format and organize equipment by category
      const formattedData = data
        .map((item: RawEquipmentData) => ({
          ...item,
          equipment_id: item.id,
          fighter_equipment_id: '',
          cost: item.adjusted_cost,
          base_cost: item.base_cost,
          adjusted_cost: item.adjusted_cost,
          equipment_type: item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade',
          fighter_weapon_id: item.fighter_weapon_id || undefined,
          master_crafted: item.master_crafted || false,
          is_custom: item.is_custom,
          vehicle_upgrade_slot: item.vehicle_upgrade_slot || undefined
        }))
        // Remove duplicates based on equipment_id
        .filter((item, index, array) => 
          array.findIndex(i => i.equipment_id === item.equipment_id) === index
        )
        .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));

      // Organize equipment by category
      const equipmentByCategory: Record<string, Equipment[]> = {};
      formattedData.forEach(item => {
        const category = item.equipment_category;
        if (!equipmentByCategory[category]) {
          equipmentByCategory[category] = [];
        }
        equipmentByCategory[category].push(item);
      });

      // Sort Vehicle Upgrades by slot first, then alphabetically
      if (equipmentByCategory['Vehicle Upgrades']) {
        equipmentByCategory['Vehicle Upgrades'].sort((a, b) => {
          // Define slot order - items without slot info come first (0)
          const slotOrder = { 'Body': 1, 'Drive': 2, 'Engine': 3 };
          
          // Get slot values, treating null/undefined as 0 (first)
          const aSlot = a.vehicle_upgrade_slot || '';
          const bSlot = b.vehicle_upgrade_slot || '';
          const aOrder = slotOrder[aSlot as keyof typeof slotOrder] || 0;
          const bOrder = slotOrder[bSlot as keyof typeof slotOrder] || 0;
          
          // Sort by slot first
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }
          
          // Then sort alphabetically
          return a.equipment_name.localeCompare(b.equipment_name);
        });
      }

      const uniqueCategories = Object.keys(equipmentByCategory);

      // Cache the data
      if (equipmentListType === 'unrestricted') {
        setCachedAllCategories(uniqueCategories);
        setCachedEquipment(prev => ({ ...prev, all: equipmentByCategory }));
      } else if (equipmentListType === 'fighters-list') {
        setCachedFighterCategories(uniqueCategories);
        setCachedEquipment(prev => ({ ...prev, fighter: equipmentByCategory }));
      } else if (equipmentListType === 'fighters-tradingpost') {
        setCachedFighterTPCategories(uniqueCategories);
        setCachedEquipment(prev => ({ ...prev, tradingpost: equipmentByCategory }));
      }

      // Set the state
      setAvailableCategories(uniqueCategories);
      setEquipment(equipmentByCategory);

    } catch (err) {
      console.error('Error fetching all equipment categories:', err);
      setError('Failed to load equipment categories');
    } finally {
      setIsLoadingAllEquipment(false);
    }
  };

  const toggleCategory = async (category: Category) => {
    const isExpanded = expandedCategories.has(category.category_name);
    const newSet = new Set(expandedCategories);

    if (isExpanded) {
      newSet.delete(category.category_name);
    } else {
      newSet.add(category.category_name);
      // No need to fetch individual categories anymore - all equipment is loaded at once
    }

    setExpandedCategories(newSet);
  };

  useEffect(() => {
    if (!searchQuery) {
      // When search is cleared, reset to default collapsed state
      setExpandedCategories(new Set());
      return;
    }

    const matching = new Set<string>();

    for (const category of categories) {
      const items = equipment[category.category_name] || [];
      const match = items.some(item =>
        item.equipment_name.toLowerCase().includes(searchQuery)
      );
      if (match) {
        matching.add(category.category_name);
        // No need to fetch individual categories anymore - all equipment is loaded at once
      }
    }

    setExpandedCategories(prev => {
      const updated = new Set(prev);
      matching.forEach(cat => updated.add(cat));
      return updated;
    });
  }, [searchQuery, categories, equipment]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const canAffordEquipment = (item: Equipment) => {
    return gangCredits >= (item.adjusted_cost ?? item.cost);
  };

  const handleBuyEquipment = async (item: Equipment, manualCost: number, isMasterCrafted: boolean = false, useBaseCostForRating: boolean = true, selectedEffectIds: string[] = []) => {
    if (!session) return;
    try {
      // Determine if this is a gang stash purchase
      const isGangStashPurchase = isStashMode || (!fighterId && !vehicleId);
      
      const params = {
        ...(item.is_custom 
          ? { custom_equipment_id: item.equipment_id }
          : { equipment_id: item.equipment_id }
        ),
        gang_id: gangId,
        manual_cost: manualCost,
        master_crafted: isMasterCrafted && item.equipment_type === 'weapon',
        use_base_cost_for_rating: useBaseCostForRating,
        buy_for_gang_stash: isGangStashPurchase,
        selected_effect_ids: selectedEffectIds,
        // Only include fighter_id or vehicle_id if not buying for gang stash
        ...(!isGangStashPurchase && (isVehicleEquipment
          ? { vehicle_id: vehicleId || undefined }
          : { fighter_id: fighterId || undefined }
        ))
      };

      

      const result = await buyEquipmentForFighter(params);

      if (!result.success) {
        throw new Error(result.error || 'Failed to buy equipment');
      }

      const data = result.data;
      const newGangCredits = data.updategangsCollection?.records[0]?.credits;
      
      // Handle different response structures for gang stash vs fighter equipment
      let equipmentRecord;
      if (isGangStashPurchase) {
        equipmentRecord = data.insertIntofighter_equipmentCollection?.records[0];
      } else {
        equipmentRecord = data.insertIntofighter_equipmentCollection?.records[0];
      }

      if (!equipmentRecord) {
        throw new Error('Failed to get equipment ID from response');
      }

      // Use the rating cost from the backend response
      // This value will be the adjusted_cost when use_base_cost_for_rating is true
      // or the manual_cost when use_base_cost_for_rating is false
      const ratingCost = data.rating_cost;
      
      // Calculate new fighter credits adding the rating cost, not the manual cost
      // This ensures the fighter's rating is correctly updated
      // For gang stash purchases, fighter credits don't change
      const newFighterCredits = isGangStashPurchase ? fighterCredits : fighterCredits + ratingCost;
      

      onEquipmentBought(newFighterCredits, newGangCredits, {
        ...item,
        fighter_equipment_id: equipmentRecord.id,
        cost: ratingCost, // Use the rating cost value from the server
        is_master_crafted: equipmentRecord.is_master_crafted,
        equipment_name: equipmentRecord.is_master_crafted && item.equipment_type === 'weapon' 
          ? `${item.equipment_name} (Master-crafted)` 
          : item.equipment_name,
        equipment_effect: data.equipment_effect
      });

      toast({
        title: "Equipment purchased",
        description: `Successfully bought ${equipmentRecord.is_master_crafted && item.equipment_type === 'weapon' 
          ? `${item.equipment_name} (Master-crafted)` 
          : item.equipment_name} for ${manualCost} credits`,
        variant: "default",
      });

      setBuyModalData(null);
    } catch (err) {
      console.error('Error buying equipment:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to buy equipment',
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!session || isLoadingAllEquipment) return;

    // Check cache first before making any API calls
    // If we have cached data for this equipment list type, use it
    if (equipmentListType === 'unrestricted' && cachedAllCategories.length > 0 && cachedEquipment.all && Object.keys(cachedEquipment.all).length > 0) {
      
      setAvailableCategories(cachedAllCategories);
      setEquipment(cachedEquipment.all);
      return;
    } else if (equipmentListType === 'fighters-list' && cachedFighterCategories.length > 0 && cachedEquipment.fighter && Object.keys(cachedEquipment.fighter).length > 0) {
      
      setAvailableCategories(cachedFighterCategories);
      setEquipment(cachedEquipment.fighter);
      return;
    } else if (equipmentListType === 'fighters-tradingpost' && cachedFighterTPCategories.length > 0 && cachedEquipment.tradingpost && Object.keys(cachedEquipment.tradingpost).length > 0) {
      
      setAvailableCategories(cachedFighterTPCategories);
      setEquipment(cachedEquipment.tradingpost);
      return;
    }

    // Only fetch if we don't have cached data
    
    fetchAllCategories();
  }, [session, equipmentListType, cachedAllCategories.length, cachedFighterCategories.length, cachedFighterTPCategories.length, isLoadingAllEquipment]);

  // Calculate min/max values from equipment data
  useEffect(() => {
    const allEquipment = Object.values(equipment).flat();
    if (allEquipment.length > 0) {
      const costs = allEquipment.map(item => item.adjusted_cost ?? item.cost);
      const availabilities = allEquipment
        .map(item => {
          // Parse availability - handle valid formats: "R12", "I9", "S7", "C", "E"
          const availabilityStr = item.availability || '0';
          
          if (availabilityStr === 'C' || availabilityStr === 'E') {
            return 0;
          } else if (/^[RIS]\d+$/.test(availabilityStr)) {
            // Valid format: letter prefix followed by numbers (R12, I9, S7)
            const numStr = availabilityStr.substring(1);
            return parseInt(numStr);
          } else {
            // Invalid format - log warning and default to 0
            return 0;
          }
        })
        .filter(val => !isNaN(val));

      if (costs.length > 0) {
        const newMinCost = Math.min(...costs);
        const newMaxCost = Math.max(...costs);
        setMinCost(newMinCost);
        setMaxCost(newMaxCost);
        setCostRange([newMinCost, newMaxCost]);
      }

      if (availabilities.length > 0) {
        const newMinAvailability = Math.min(...availabilities);
        const newMaxAvailability = Math.max(...availabilities);
        setMinAvailability(newMinAvailability);
        setMaxAvailability(newMaxAvailability);
        setAvailabilityRange([newMinAvailability, newMaxAvailability]);
      }
    }
  }, [equipment]);

  // Filter equipment based on cost and availability ranges
  const filterEquipment = (items: Equipment[]) => {
    return items.filter(item => {
      const cost = item.adjusted_cost ?? item.cost;
      // Parse availability - handle valid formats: "R12", "I9", "S7", "C", "E"
      const availabilityStr = item.availability || '0';
      let availability = 0;
      
      if (availabilityStr === 'C' || availabilityStr === 'E') {
        availability = 0;
      } else if (/^[RIS]\d+$/.test(availabilityStr)) {
        // Valid format: letter prefix followed by numbers (R12, I9, S7)
        const numStr = availabilityStr.substring(1);
        availability = parseInt(numStr);
      } else {
        // Invalid format - log warning and default to 0
        availability = 0;
      }
      
      const costInRange = cost >= costRange[0] && cost <= costRange[1];
      const availabilityInRange = availability >= availabilityRange[0] && 
        availability <= availabilityRange[1];
      
      return costInRange && availabilityInRange && 
        item.equipment_name.toLowerCase().includes(searchQuery);
    });
  };

  const modalContent = (
    <>
      <div
        className="fixed inset-0 bg-neutral-300 bg-opacity-50 dark:bg-neutral-700 dark:bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
        onMouseDown={handleOverlayClick}
      >
        <div className="w-[600px] min-h-0 max-h-svh overflow-y-auto rounded-lg bg-card shadow-xl">
          <div className="relative border-b p-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full absolute right-4 top-4"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>

            <div className="flex flex-row gap-3 pr-8">
              <h2 className="text-xl font-semibold">{title}</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Gang Credits</span>
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                  {gangCredits}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center">
              {!isStashMode && !isVehicleEquipment && fighterHasLegacy && (
                <label className="flex items-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap leading-8 gap-2">
                  <span>Gang Legacy</span>
                  <Switch
                    checked={includeLegacy}
                    onCheckedChange={(checked) => {
                      setIncludeLegacy(!!checked);
                      setEquipment({});
                      // use the new state directly to avoid lag with async setState
                      fetchAllCategories(!!checked);
                    }}
                  />
                </label>
              )}
              {!isStashMode && !isCustomFighter && (
                <label className="flex text-sm text-muted-foreground cursor-pointer whitespace-nowrap leading-8">
                  <input
                    type="radio"
                    name="equipment-list"
                    value="fighters-list"
                    checked={equipmentListType === "fighters-list"}
                    onChange={() => {
                      setEquipmentListType("fighters-list");
                      setEquipment({});
                    }}
                    className="mr-1"
                  />
                  {isVehicleEquipment ? "Vehicle's List" : "Fighter's List"}
                </label>
              )}
              <label className="flex text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                <input
                  type="radio"
                  name="equipment-list"
                  value="fighters-tradingpost"
                  checked={equipmentListType === "fighters-tradingpost"}
                  onChange={() => {
                    setEquipmentListType("fighters-tradingpost");
                    setEquipment({});
                  }}
                  className="mr-1"
                />
                Trading Post
              </label>
              <label className="flex text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                <input
                  type="radio"
                  name="equipment-list"
                  value="unrestricted"
                  checked={equipmentListType === "unrestricted"}
                  onChange={() => {
                    setEquipmentListType("unrestricted");
                    setEquipment({});
                  }}
                  className="mr-1"
                />
                Unrestricted
              </label>
            </div>
            <div className="mt-1 flex justify-center">
              <div className="relative w-[250px]">
                <input
                  type="text"
                  placeholder="Search equipment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 pr-8 border rounded-md text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xl leading-none"
                    aria-label="Clear search"
                  >
                    <LuX size={20} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="mt-4 flex flex-col md:flex-row gap-4 md:gap-6 px-4">
              <RangeSlider
                label="Cost"
                value={costRange}
                onValueChange={setCostRange}
                min={minCost}
                max={maxCost}
                step={5}
                className="flex-1"
              />
              
              {equipmentListType !== 'fighters-list' && (
                <RangeSlider
                  label="Availability"
                  value={availabilityRange}
                  onValueChange={setAvailabilityRange}
                  min={minAvailability}
                  max={maxAvailability}
                  step={1}
                  formatValue={(val) => `${val}`}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-col">
              {error && <p className="text-red-500 p-4">{error}</p>}

              {categories
                .filter(category => {
                  const isVehicleAllowed = isVehicleEquipment && allowedCategories
                    ? allowedCategories.includes(category.category_name)
                    : !isVehicleEquipment;

                  const isAvailable = availableCategories.includes(category.category_name);

                  // When searching, only show categories that have matching equipment
                  const hasMatchingEquipment = !searchQuery || 
                    (equipment[category.category_name] && 
                     filterEquipment(equipment[category.category_name]).length > 0);

                  return isVehicleAllowed && isAvailable && hasMatchingEquipment;
                })
                .sort((a, b) => {
                  const rankA = equipmentCategoryRank[a.category_name.toLowerCase()] ?? Infinity;
                  const rankB = equipmentCategoryRank[b.category_name.toLowerCase()] ?? Infinity;
                  return rankA - rankB;
                })
                .map((category) => (
                  <div key={category.id}>
                    <Button
                      variant="ghost"
                      className="relative flex w-full justify-between rounded-none px-4 py-4 text-base font-semibold bg-muted hover:bg-muted mb-[1px]"
                      onClick={() => toggleCategory(category)}
                    >
                      <span>{category.category_name}</span>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform duration-200 ${
                          expandedCategories.has(category.category_name) ? "rotate-90" : ""
                        }`}
                      />
                    </Button>

                    {expandedCategories.has(category.category_name) && (
                      <div className="bg-muted">
                        {categoryLoadingStates[category.category_name] ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                          </div>
                        ) : equipment[category.category_name]?.length ? (
                          filterEquipment(equipment[category.category_name])
                            .map((item, itemIndex) => {
                              const affordable = canAffordEquipment(item);
                              const tooltipProps = (item.equipment_type === 'weapon' && item.weapon_profiles && item.weapon_profiles.length > 0)
                                ? {
                                    'data-tooltip-id': 'weapon-profile-tooltip',
                                    'data-tooltip-html': (() => {
                                      const sortedProfiles = [...(item.weapon_profiles || [])].sort((a, b) => {
                                        const orderA = (a as any).sort_order ?? 1;
                                        const orderB = (b as any).sort_order ?? 1;
                                        if (orderA !== orderB) return orderA - orderB;
                                        return (a.profile_name || '').localeCompare(b.profile_name || '');
                                      });
                                      // Check if any profile has meaningful data beyond just the name
                                      const hasProfileData = sortedProfiles.some(profile => 
                                        profile.range_short || profile.range_long || 
                                        profile.acc_short || profile.acc_long ||
                                        profile.strength || profile.ap || 
                                        profile.damage || profile.ammo || 
                                        profile.traits
                                      );
                                      // If no meaningful data, just show profile names
                                      if (!hasProfileData) {
                                        return sortedProfiles.map(profile => profile.profile_name).join('\n');
                                      }
                                      let html = '<div style="font-size: 12px;">';
                                      html += '<table style="width: 100%; border-collapse: collapse;">';
                                      html += '<thead>';
                                      html += '<tr>';
                                      html += '<th style="text-align: left; min-width: 80px;"></th>';
                                      html += '<th style="text-align: center; solid #666;" colspan="2">Rng</th>';
                                      html += '<th style="text-align: center; solid #666;" colspan="2">Acc</th>';
                                      html += '<th style="text-align: center; solid #666;"></th>';
                                      html += '<th style="text-align: center; solid #666;"></th>';
                                      html += '<th style="text-align: center; solid #666;"></th>';
                                      html += '<th style="text-align: center; solid #666;"></th>';
                                      html += '<th style="text-align: left; solid #666;"></th>';
                                      html += '</tr>';
                                      html += '<tr style="border-bottom: 1px solid #666;">';
                                      html += '<th style="text-align: left; padding: 2px; font-size: 10px;">Weapon</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px; min-width: 25px;">S</th>';
                                      html += '<th style="text-align: center; padding: 2px; font-size: 10px; min-width: 25px;">L</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px; min-width: 25px;">S</th>';
                                      html += '<th style="text-align: center; padding: 2px; font-size: 10px; min-width: 25px;">L</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">Str</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">AP</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">D</th>';
                                      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">Am</th>';
                                      html += '<th style="text-align: left; padding: 2px; border-left: 1px solid #666; font-size: 10px; max-width: 22vw;">Traits</th>';
                                      html += '</tr>';
                                      html += '</thead><tbody>';
                                      sortedProfiles.forEach(profile => {
                                        // Check if this profile has any meaningful data
                                        const profileHasData = profile.range_short || profile.range_long || 
                                                             profile.acc_short || profile.acc_long ||
                                                             profile.strength || profile.ap || 
                                                             profile.damage || profile.ammo || 
                                                             profile.traits;
                                        html += '<tr style="border-bottom: 1px solid #555;">';
                                        html += `<td style="padding: 2px; vertical-align: top; font-weight: 500; text-overflow: ellipsis; max-width: 10vw;">${profile.profile_name || '-'}</td>`;
                                        if (profileHasData) {
                                          // Show "-" for missing values when profile has other data
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.range_short || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center;">${profile.range_long || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.acc_short || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center;">${profile.acc_long || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.strength || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.ap || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.damage || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.ammo || '-'}</td>`;
                                          html += `<td style="padding: 3px; vertical-align: top; border-left: 1px solid #555; word-break: normal; white-space: normal; max-width: 22vw;">${profile.traits || '-'}</td>`;
                                        } else {
                                          // Show empty cells for profiles with no data
                                          html += `<td style="padding: 3px; text-align: center; border-left: 1px solid #555;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px; text-align: center;"></td>`;
                                          html += `<td style="padding: 3px;"></td>`;
                                        }
                                        html += '</tr>';
                                      });
                                      html += '</tbody></table></div>';
                                      return html;
                                    })()
                                  }
                                : {};
                              return (
                                <div
                                  key={`${category.category_name}-${item.equipment_id}-${itemIndex}`}
                                  className="flex items-center justify-between w-full px-4 py-2 text-left hover:bg-muted"
                                >
                                  <div className="flex-1 pl-4 leading-none cursor-help" {...tooltipProps}>
                                    <span className="text-sm font-medium">
                                      {item.equipment_type === 'vehicle_upgrade' && item.vehicle_upgrade_slot 
                                        ? `${item.vehicle_upgrade_slot}: ${item.equipment_name}` 
                                        : item.equipment_name
                                      }
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {item.adjusted_cost !== undefined && item.adjusted_cost !== (item.base_cost ?? item.cost) ? (
                                      <div className="flex items-center gap-1">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${
                                          item.adjusted_cost < (item.base_cost ?? item.cost) ? 'bg-green-500' : 'bg-red-500'
                                        }`}>
                                          <span className="text-[10px] font-medium">{item.adjusted_cost}</span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-black text-white line-through">
                                          <span className="text-[10px] font-medium">{item.base_cost}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-black text-white">
                                        <span className="text-[10px] font-medium">{item.cost}</span>
                                      </div>
                                    )}
                                    {equipmentListType !== 'fighters-list' && (
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-sky-500 text-white">
                                        <span className="text-[10px] font-medium">{item.availability}</span>
                                      </div>
                                    )}
                                    <Button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBuyModalData(item);
                                      }}
                                      className={`text-white text-xs py-0.5 px-2 h-6 ${
                                        affordable
                                          ? "bg-green-500 hover:bg-green-600"
                                          : "bg-gray-500 hover:bg-gray-600"
                                      }`}
                                    >
                                      Buy
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                        ) : (
                          <div className="flex justify-center py-4">
                            <p className="text-muted-foreground">No equipment found in this category.</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="h-[1px] w-full bg-secondary" />
                  </div>
                ))}
            </div>
            {buyModalData && (
              <PurchaseModal
                item={buyModalData}
                gangCredits={gangCredits}
                onClose={() => setBuyModalData(null)}
                onConfirm={(cost, isMasterCrafted, useBaseCostForRating, selectedEffectIds) => {
                  handleBuyEquipment(buyModalData!, cost, isMasterCrafted, useBaseCostForRating, selectedEffectIds || []);
                }}
                isStashPurchase={Boolean(isStashMode || (!fighterId && !vehicleId))}
              />
            )}
          </div>
        </div>
      </div>
      {/* Purchase Modal and Tooltip */}
      {buyModalData && (
        <PurchaseModal
          item={buyModalData}
          gangCredits={gangCredits}
          onClose={() => setBuyModalData(null)}
          onConfirm={(parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds) => handleBuyEquipment(buyModalData, parsedCost, isMasterCrafted, useBaseCostForRating, selectedEffectIds || [])}
          isStashPurchase={Boolean(isStashMode || (!fighterId && !vehicleId))}
        />
      )}
      {/* Weapon Profile Tooltip */}
      <Tooltip
        id="weapon-profile-tooltip"
        place="top-start"
        className="!bg-gray-900 !text-white !text-xs !z-[60]"
        style={{
          backgroundColor: '#1f2937',
          color: 'white',
          padding: '6px',
          fontSize: '12px',
          maxWidth: '97vw',
          marginLeft: '-10px',
          zIndex: 60
        }}
      />
    </>
  );

  return createPortal(modalContent, document.body);
};

export default ItemModal;