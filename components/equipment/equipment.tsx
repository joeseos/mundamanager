'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { Equipment, WeaponProfile, EquipmentGrants } from '@/types/equipment';
import { LuChevronRight } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { LuX } from "react-icons/lu";
import { RangeSlider } from "@/components/ui/range-slider";
import { EquipmentTooltipTrigger, EquipmentTooltip } from './equipment-tooltip';
import { PurchaseModal } from './purchase-modal';
import { usePurchaseEquipment } from '@/hooks/use-purchase-equipment';

interface ItemModalProps {
  title: string;
  onClose: () => void;
  gangCredits: number;
  gangId: string;
  gangTypeId: string;
  fighterId: string;
  fighterTypeId?: string;
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
  campaignTradingPostIds?: string[];
  campaignTradingPostNames?: string[];
  onEquipmentBought?: (newFighterCredits: number, newGangCredits: number, boughtEquipment: Equipment, newGangRating?: number, newGangWealth?: number) => void;
  onPurchaseRequest?: (payload: { params: any; item: Equipment }) => void;
  // Optional: pass fighter weapons to avoid client fetch in target selection
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
}

interface RawEquipmentData {
  id: string;
  equipment_name: string;
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
  grants_equipment?: EquipmentGrants;
  equipment_tradingpost?: boolean;
  trading_post_names?: string[];
}

interface Category {
  id: string;
  category_name: string;
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
  campaignTradingPostIds,
  campaignTradingPostNames,
  onEquipmentBought,
  onPurchaseRequest,
  fighterWeapons
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<Record<string, Equipment[]>>({});
  const [categoryLoadingStates, setCategoryLoadingStates] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [buyModalData, setBuyModalData] = useState<Equipment | null>(null);
  const [session, setSession] = useState<any>(null);
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

  const { purchaseEquipment } = usePurchaseEquipment({
    session,
    gangId,
    fighterId,
    vehicleId,
    isVehicleEquipment,
    isStashMode,
    fighterCredits,
    onEquipmentBought,
    onPurchaseRequest,
    closePurchaseModal: () => setBuyModalData(null),
  });

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

    // Fallback: resolve missing fighterTypeId from fighterId (should rarely be needed)
    if (!resolvedTypeId && !isVehicleEquipment && !skipFighterTypeValidation && fighterId) {
      console.warn('fighterTypeId not provided - fetching from database. Consider passing it from parent component.');
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
            console.error('Fighter type ID not found for fighter:', fighterId);
          }
        } else {
          console.error('Failed to fetch fighter type ID:', resp.status);
        }
      } catch (e) {
        console.error('Error fetching fighter type ID:', e);
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
        // In Trading Post mode with fighter type, we want both trading post AND fighter's list items
        if (resolvedTypeId && !isVehicleEquipment && !isCustomFighter) {
          // Pass both filters - SQL will use OR logic to return items in EITHER trading post OR fighter's list
          // fighters_tradingpost_only ensures only fighter-specific trading post items are shown (not gang-level)
          requestBody.equipment_tradingpost = true;
          requestBody.fighter_type_equipment = true;
          requestBody.fighters_tradingpost_only = true;
        } else {
          // For vehicle/custom/gang-level, use standard trading post filter
          requestBody.equipment_tradingpost = true;
        }
        // When gang is in a campaign, restrict trading post to campaign's authorised TPs only
        if (campaignTradingPostIds !== undefined) {
          requestBody.campaign_trading_post_type_ids = campaignTradingPostIds;
        }
      }

      // Include fighter_id so RPC can resolve legacy fighter type availability/discounts
      // Pass fighter_id if: legacy toggle enabled OR gang has affiliation
      const useLegacy = includeLegacyOverride !== undefined ? includeLegacyOverride : includeLegacy;
      const hasGangAffiliation = Boolean(gangAffiliationId);
      if (!isVehicleEquipment && fighterId && (useLegacy || hasGangAffiliation)) {
        requestBody.fighter_id = fighterId;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_equipment_detailed_data`,
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
      // When in Trading Post mode with fighter type, we fetched trading post items
      // Use the returned boolean fields to determine source:
      // - items with equipment_tradingpost=true are from Trading Post (may also be in fighter's list)
      // - we also need to fetch fighter's list items that aren't in trading post
      let formattedData = data
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
          vehicle_upgrade_slot: item.vehicle_upgrade_slot || undefined,
          from_fighters_list: false
        }));

      // When in Trading Post mode with fighter type, mark items that are in fighter's list
      // The SQL returns computed fighter_type_equipment field for all items
      if (equipmentListType === 'fighters-tradingpost' && resolvedTypeId && !isVehicleEquipment && !isCustomFighter) {
        formattedData = formattedData.map(item => ({
          ...item,
          from_fighters_list: item.fighter_type_equipment
        }));
      }

      // Remove duplicates based on equipment_id
      formattedData = formattedData
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
        // Only cache when not using campaign filter (campaign-filtered results would overwrite unfiltered cache)
        if (campaignTradingPostIds === undefined) {
          setCachedFighterTPCategories(uniqueCategories);
          setCachedEquipment(prev => ({ ...prev, tradingpost: equipmentByCategory }));
        }
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

  // Track previous search query to detect transitions
  const prevSearchQueryRef = useRef<string>('');
  
  // Track previous equipment filter context to detect when sliders should reset
  const prevEquipmentContextRef = useRef<string>('');

  // Track which contexts have already been fetched to prevent infinite loops
  // when campaignTradingPostIds is defined (which bypasses the normal cache)
  const fetchedContextsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const prevSearchQuery = prevSearchQueryRef.current;
    prevSearchQueryRef.current = searchQuery;
    
    if (!searchQuery) {
      // Only reset when search transitions from non-empty to empty (user cleared search)
      // Don't reset if it was already empty (just equipment data changed)
      if (prevSearchQuery) {
        // When search is cleared, reset to default collapsed state
        setExpandedCategories(new Set());
      }
      return;
    }

    const matching = new Set<string>();

    // Search through all equipment categories
    for (const categoryName of Object.keys(equipment)) {
      const items = equipment[categoryName] || [];
      const match = items.some(item =>
        item.equipment_name.toLowerCase().includes(searchQuery)
      );
      if (match) {
        matching.add(categoryName);
      }
    }

    setExpandedCategories(prev => {
      const updated = new Set(prev);
      matching.forEach(cat => updated.add(cat));
      return updated;
    });
  }, [searchQuery, equipment]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const canAffordEquipment = (item: Equipment) => {
    return gangCredits >= (item.adjusted_cost ?? item.cost);
  };

  useEffect(() => {
    if (!session || isLoadingAllEquipment) return;

    // Build context key for this fetch (used for campaign-filtered results that bypass cache)
    const contextKey = `${equipmentListType}:${(campaignTradingPostIds || []).join(',')}`;

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
    } else if (equipmentListType === 'fighters-tradingpost' && campaignTradingPostIds === undefined && cachedFighterTPCategories.length > 0 && cachedEquipment.tradingpost && Object.keys(cachedEquipment.tradingpost).length > 0) {
      setAvailableCategories(cachedFighterTPCategories);
      setEquipment(cachedEquipment.tradingpost);
      return;
    }

    // For campaign-filtered results (which bypass the cache), check if we already fetched this context
    // This prevents infinite loops caused by isLoadingAllEquipment state changes re-triggering the effect
    if (fetchedContextsRef.current.has(contextKey) && Object.keys(equipment).length > 0) {
      return;
    }

    // Mark this context as being fetched before calling fetchAllCategories
    fetchedContextsRef.current.add(contextKey);
    fetchAllCategories();
  }, [session, equipmentListType, cachedAllCategories.length, cachedFighterCategories.length, cachedFighterTPCategories.length, isLoadingAllEquipment, (campaignTradingPostIds || []).join(',')]);

  // Calculate min/max values from equipment data
  useEffect(() => {
    // Build a context key that represents the current filter state
    const currentContext = `${equipmentListType}:${(campaignTradingPostIds || []).join(',')}`;
    const prevContext = prevEquipmentContextRef.current;
    const contextChanged = prevContext !== currentContext;
    
    const allEquipment = Object.values(equipment).flat();
    if (allEquipment.length > 0) {
      // Only update ref when we have equipment data to process
      // This ensures context change is detected on the run when data actually loads
      if (contextChanged) {
        prevEquipmentContextRef.current = currentContext;
      }
      
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
        // Only reset slider to full range when filter context changes (mode switch, campaign filter change)
        if (contextChanged) {
          setCostRange([newMinCost, newMaxCost]);
        }
      }

      if (availabilities.length > 0) {
        const newMinAvailability = Math.min(...availabilities);
        const newMaxAvailability = Math.max(...availabilities);
        setMinAvailability(newMinAvailability);
        setMaxAvailability(newMaxAvailability);
        // Only reset slider to full range when filter context changes
        if (contextChanged) {
          setAvailabilityRange([newMinAvailability, newMaxAvailability]);
        }
      }
    }
  }, [equipment, equipmentListType, campaignTradingPostIds]);

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

  // Derive categories from available category names (no separate fetch needed)
  const categories: Category[] = availableCategories.map(name => ({
    id: name,
    category_name: name
  }));

  const modalContent = (
    <>
      <div
        className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
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
              <HiX className="h-4 w-4" />
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
              {!isStashMode && !isCustomFighter && (
                <label className="flex text-sm text-muted-foreground cursor-pointer whitespace-nowrap leading-8">
                  <input
                    type="radio"
                    name="equipment-list"
                    value="fighters-list"
                    checked={equipmentListType === "fighters-list"}
                    onChange={() => {
                      fetchedContextsRef.current.clear();
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
                    fetchedContextsRef.current.clear();
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
                    fetchedContextsRef.current.clear();
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

              {equipmentListType == 'fighters-list' && !isStashMode && !isVehicleEquipment && fighterHasLegacy && (
                <label className="flex items-center justify-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap leading-8 gap-2">
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
            
            {/* Display trading post names when Trading Post is selected and gang is in a campaign */}
            {equipmentListType === 'fighters-tradingpost' && campaignTradingPostIds !== undefined && (
              <div className="mt-2 px-4">
                <p className="text-xs text-muted-foreground text-center">
                  Authorised: {(campaignTradingPostNames && campaignTradingPostNames.length > 0) ? [...campaignTradingPostNames].sort((a, b) => a.localeCompare(b)).join(', ') : 'None'}
                </p>
              </div>
            )}
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
                      <LuChevronRight
                        className={`h-4 w-4 transition-transform duration-200 ${
                          expandedCategories.has(category.category_name) ? "rotate-90" : ""
                        }`}
                      />
                    </Button>

                    {expandedCategories.has(category.category_name) && (
                      <div>
                        {categoryLoadingStates[category.category_name] ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                          </div>
                        ) : equipment[category.category_name]?.length ? (
                          filterEquipment(equipment[category.category_name])
                            .map((item, itemIndex) => {
                              const affordable = canAffordEquipment(item);
                              return (
                                <div
                                  key={`${category.category_name}-${item.equipment_id}-${itemIndex}`}
                                  className="flex items-center justify-between w-full px-4 py-2 text-left hover:bg-muted gap-1"
                                >
                                  <EquipmentTooltipTrigger
                                    item={item}
                                    className="flex-1 pl-4 leading-none"
                                    options={{ equipmentListType, isVehicleEquipment }}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium">
                                        {item.equipment_type === 'vehicle_upgrade' && item.vehicle_upgrade_slot 
                                          ? `${item.vehicle_upgrade_slot}: ${item.equipment_name}`
                                          : item.equipment_name}
                                      </span>
                                      {item.is_custom && (
                                        <Badge variant="discreet" className="px-1 text-[0.6rem]">
                                          Custom
                                        </Badge>
                                      )}
                                      {equipmentListType !== 'fighters-list' && (item.fighter_type_equipment || item.from_fighters_list) && (
                                        <Badge variant="discreet" className="px-1 text-[0.6rem]">
                                          {isVehicleEquipment ? "Vehicle's List" : "Fighter's List"}
                                        </Badge>
                                      )}
                                    </div>
                                  </EquipmentTooltipTrigger>
                                  <div className="flex items-center gap-1">
                                    {item.adjusted_cost !== undefined && item.adjusted_cost !== (item.base_cost ?? item.cost) ? (
                                      <div className="flex items-center gap-1">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${
                                          item.adjusted_cost < (item.base_cost ?? item.cost) ? 'bg-green-500' : 'bg-red-500'
                                        }`}>
                                          <span className="text-[10px] font-medium">{item.adjusted_cost}</span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-primary text-primary-foreground line-through">
                                          <span className="text-[10px] font-medium">{item.base_cost}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                                        <span className="text-[10px] font-medium">{item.cost}</span>
                                      </div>
                                    )}
                                    {equipmentListType !== 'fighters-list' && (
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${
                                        item.availability?.startsWith('R') ? 'bg-sky-500' :
                                        item.availability?.startsWith('I') ? 'bg-orange-500' :
                                        item.availability?.startsWith('S') ? 'bg-purple-500' :
                                        item.availability?.startsWith('E') ? 'bg-rose-500' :
                                        'bg-sky-500'
                                      }`}>
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
                onConfirm={(cost, isMasterCrafted, useBaseCostForRating, selectedEffectIds, equipmentTarget, selectedGrantEquipmentIds) => {
                  purchaseEquipment({
                    item: buyModalData,
                    manualCost: cost,
                    isMasterCrafted,
                    useBaseCostForRating,
                    selectedEffectIds: selectedEffectIds || [],
                    equipmentTarget,
                    selectedGrantEquipmentIds: selectedGrantEquipmentIds || [],
                  })
                }}
                isStashPurchase={Boolean(isStashMode || (!fighterId && !vehicleId))}
                fighterId={fighterId}
                fighterWeapons={fighterWeapons}
                equipmentListType={equipmentListType}
              />
            )}
          </div>
        </div>
      </div>
      <EquipmentTooltip />
    </>
  );

  return createPortal(modalContent, document.body);
};

export default ItemModal;

