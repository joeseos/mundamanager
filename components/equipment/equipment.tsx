'use client';

import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { Equipment, WeaponProfile, EquipmentGrants } from '@/types/equipment';
import { LuChevronRight } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import { Switch } from "@/components/ui/switch";
import { LuX } from "react-icons/lu";
import { RangeSlider } from "@/components/ui/range-slider";
import { EquipmentTooltipTrigger } from './equipment-tooltip';
import { PurchaseModal } from './purchase-modal';
import { usePurchaseEquipment, type EquipmentBoughtResult } from '@/hooks/use-purchase-equipment';
import type { GangCampaignResource } from '@/app/lib/shared/gang-data';
import { hasEquipmentSuperCategories, hasTradePoints } from '@/types/edition';
import { isExclusiveTradePoints, parseTradePointsCost } from '@/utils/campaigns/resources';
import { compareEquipmentCategories } from '@/utils/getEquipmentCategoryRank';
import {
  getEquipmentCategoryDisplayNameN26,
  getEquipmentSuperCategoryN26,
  equipmentSuperCategoryRankN26,
} from '@/utils/equipmentCategoryRankN26';

interface ItemModalProps {
  title: string;
  onClose: () => void;
  gangCredits: number;
  gangId: string;
  gangTypeId?: string | null;
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
  campaignCustomTradingPostIds?: string[];
  campaignCustomTradingPostNames?: string[];
  campaignGangId?: string;
  gangCampaignResources?: GangCampaignResource[];
  gangReputation?: number;
  editionSlug?: string | null;
  gangTradePoints?: number;
  onEquipmentBought?: (result: EquipmentBoughtResult) => void;
  onPurchaseRequest?: (payload: { params: any; item: Equipment }) => void;
  // Optional: pass fighter weapons to avoid client fetch in target selection
  fighterWeapons?: { id: string; name: string; equipment_category?: string; effect_names?: string[] }[];
}

interface RawEquipmentData {
  id: string;
  equipment_name: string;
  availability: string | null;
  base_cost: number;
  adjusted_cost: number;
  trade_points?: string | null;
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
  cost_resource_name?: string | null;
  cost_resource_amount?: number | null;
  cost_type_resource_id?: string | null;
  cost_campaign_resource_id?: string | null;
  banned?: boolean;
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
  vehicleId,
  vehicleType,
  vehicleTypeId,
  isVehicleEquipment,
  allowedCategories,
  isStashMode,
  isCustomFighter = false,
  campaignTradingPostIds,
  campaignTradingPostNames,
  campaignCustomTradingPostIds,
  campaignCustomTradingPostNames,
  campaignGangId,
  gangCampaignResources,
  gangReputation,
  editionSlug,
  gangTradePoints,
  onEquipmentBought,
  onPurchaseRequest,
  fighterWeapons
}) => {
  const showTradePoints = hasTradePoints(editionSlug);
  const [equipment, setEquipment] = useState<Record<string, Equipment[]>>({});
  const [categoryLoadingStates] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [buyModalData, setBuyModalData] = useState<Equipment | null>(null);
  const [session, setSession] = useState<any>(null);
  const [equipmentListType, setEquipmentListType] = useState<"fighters-list" | "fighters-tradingpost" | "unrestricted">(
    isStashMode ? "fighters-tradingpost" : "fighters-list"
  );
  const [localVehicleTypeId, setLocalVehicleTypeId] = useState<string | undefined>(vehicleTypeId);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [cachedFighterCategories, setCachedFighterCategories] = useState<string[]>([]);
  const [cachedFighterTPCategories, setCachedFighterTPCategories] = useState<string[]>([]);
  const [cachedAllCategories, setCachedAllCategories] = useState<string[]>([]);
  const [cachedEquipment, setCachedEquipment] = useState<Record<string, Record<string, Equipment[]>>>({
    fighter: {},
    all: {},
    tradingpost: {}
  });
  // Whether a bucket has been fetched, tracked separately from its contents: a
  // fighter with no equipment list caches a legitimately empty result, and an
  // emptiness test cannot tell that apart from "never fetched".
  const [loadedBuckets, setLoadedBuckets] = useState<{ all: boolean; fighter: boolean; tradingpost: boolean }>({
    all: false,
    fighter: false,
    tradingpost: false
  });
  const [isLoadingAllEquipment, setIsLoadingAllEquipment] = useState(false);
  const [costRange, setCostRange] = useState<[number, number]>([10, 160]);
  const [availabilityRange, setAvailabilityRange] = useState<[number, number]>([6, 12]);
  const [tradePointsRange, setTradePointsRange] = useState<[number, number]>([0, 5]);
  const [includeLegacy, setIncludeLegacy] = useState<boolean>(false);

  // Which rarity axis this list filters on: N26 gates equipment by Trade Points where
  // earlier editions use Availability, and a fighter's own list has neither.
  const rarityFilter: 'none' | 'tradePoints' | 'availability' =
    equipmentListType === 'fighters-list' ? 'none' : showTradePoints ? 'tradePoints' : 'availability';

  const chargesTradePoints = showTradePoints && equipmentListType !== 'fighters-list';

  const { purchaseEquipment } = usePurchaseEquipment({
    session,
    gangId,
    fighterId,
    vehicleId,
    isVehicleEquipment,
    isStashMode,
    fighterCredits,
    campaignGangId,
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

    if (!resolvedTypeId && !skipFighterTypeValidation) {
      const errorMessage = isVehicleEquipment
        ? `Vehicle type information is missing. Vehicle: ${vehicleType || 'unknown'}`
        : 'Fighter type information is missing';
      setError(errorMessage);
      // Returns before the try below, so release the in-flight flag here or the
      // modal stays wedged with no way to retry.
      setIsLoadingAllEquipment(false);
      return;
    }

    try {
      const requestBody: Record<string, any> = {
        gang_id: gangId,  // ✅ Always pass - it's always available
        ...(gangTypeId && { gang_type_id: gangTypeId }),
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
        if (resolvedTypeId && !isVehicleEquipment) {
          // Pass both filters - SQL will use OR logic to return items in EITHER trading post OR fighter's list
          requestBody.equipment_tradingpost = true;
          requestBody.fighter_type_equipment = true;
        } else {
          // For vehicle/custom/gang-level, use standard trading post filter
          requestBody.equipment_tradingpost = true;
        }
        // When gang is in a campaign, restrict trading post to campaign's authorised TPs only
        if (campaignTradingPostIds !== undefined) {
          requestBody.campaign_trading_post_type_ids = campaignTradingPostIds;
        }
        if (campaignCustomTradingPostIds !== undefined && campaignCustomTradingPostIds.length > 0) {
          requestBody.campaign_custom_trading_post_ids = campaignCustomTradingPostIds;
        }
      }

      // The RPC reads the fighter's own subtypes and specialisation to resolve scoped equipment
      // rows, so the id goes every time; include_legacy now carries what omitting it used to.
      const useLegacy = includeLegacyOverride !== undefined ? includeLegacyOverride : includeLegacy;
      if (!isVehicleEquipment && fighterId) {
        requestBody.fighter_id = fighterId;
        requestBody.include_legacy = useLegacy;
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
          trade_points: item.trade_points ?? undefined,
          equipment_type: item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade',
          fighter_weapon_id: item.fighter_weapon_id || undefined,
          master_crafted: item.master_crafted || false,
          is_custom: item.is_custom,
          vehicle_upgrade_slot: item.vehicle_upgrade_slot || undefined,
          from_fighters_list: false
        }));

      // When in Trading Post mode with fighter type, mark items that are in fighter's list
      // The SQL returns computed fighter_type_equipment field for all items
      if (equipmentListType === 'fighters-tradingpost' && resolvedTypeId && !isVehicleEquipment) {
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
        setLoadedBuckets(prev => ({ ...prev, all: true }));
      } else if (equipmentListType === 'fighters-list') {
        setCachedFighterCategories(uniqueCategories);
        setCachedEquipment(prev => ({ ...prev, fighter: equipmentByCategory }));
        setLoadedBuckets(prev => ({ ...prev, fighter: true }));
      } else if (equipmentListType === 'fighters-tradingpost') {
        // Only cache when not using campaign filter (campaign-filtered results would overwrite unfiltered cache)
        if (campaignTradingPostIds === undefined) {
          setCachedFighterTPCategories(uniqueCategories);
          setCachedEquipment(prev => ({ ...prev, tradingpost: equipmentByCategory }));
          setLoadedBuckets(prev => ({ ...prev, tradingpost: true }));
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

  // Track which contexts have already been fetched to prevent infinite loops
  // when campaignTradingPostIds is defined (which bypasses the normal cache)
  const fetchedContextsRef = useRef<Set<string>>(new Set());

  const searchExpandKey = `${searchQuery}:${Object.keys(equipment).join(',')}`;
  const [prevSearchExpandKey, setPrevSearchExpandKey] = useState(searchExpandKey);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchExpandKey !== prevSearchExpandKey) {
    setPrevSearchExpandKey(searchExpandKey);
    const wasSearching = prevSearchQuery;
    setPrevSearchQuery(searchQuery);

    if (!searchQuery) {
      if (wasSearching) {
        setExpandedCategories(new Set());
      }
    } else {
      const matching = new Set<string>();
      for (const categoryName of Object.keys(equipment)) {
        const items = equipment[categoryName] || [];
        if (items.some(item => item.equipment_name.toLowerCase().includes(searchQuery))) {
          matching.add(categoryName);
        }
      }
      setExpandedCategories(prev => {
        const updated = new Set(prev);
        matching.forEach(cat => updated.add(cat));
        return updated;
      });
    }
  }

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const canAffordEquipment = (item: Equipment) => {
    const canAffordCredits = gangCredits >= (item.adjusted_cost ?? item.cost);
    if (!chargesTradePoints) return canAffordCredits;
    const tradePointsCost = parseTradePointsCost(item.trade_points);
    return canAffordCredits && tradePointsCost <= (gangTradePoints ?? 0);
  };

  const cacheRestorationKey = `${equipmentListType}:${loadedBuckets.all}:${loadedBuckets.fighter}:${loadedBuckets.tradingpost}:${campaignTradingPostIds === undefined ? 'no-campaign' : 'campaign'}`;
  const [prevCacheRestorationKey, setPrevCacheRestorationKey] = useState(cacheRestorationKey);
  if (cacheRestorationKey !== prevCacheRestorationKey) {
    setPrevCacheRestorationKey(cacheRestorationKey);
    if (equipmentListType === 'unrestricted' && loadedBuckets.all) {
      setAvailableCategories(cachedAllCategories);
      setEquipment(cachedEquipment.all);
    } else if (equipmentListType === 'fighters-list' && loadedBuckets.fighter) {
      setAvailableCategories(cachedFighterCategories);
      setEquipment(cachedEquipment.fighter);
    } else if (equipmentListType === 'fighters-tradingpost' && campaignTradingPostIds === undefined && loadedBuckets.tradingpost) {
      setAvailableCategories(cachedFighterTPCategories);
      setEquipment(cachedEquipment.tradingpost);
    }
  }

  const campaignTPKey = (campaignTradingPostIds || []).join(',');
  const campaignCustomTPKey = (campaignCustomTradingPostIds || []).join(',');
  useEffect(() => {
    if (!session || isLoadingAllEquipment) return;

    const contextKey = `${equipmentListType}:${campaignTPKey}:${campaignCustomTPKey}`;

    // Skip if cache was already restored during render
    if (equipmentListType === 'unrestricted' && loadedBuckets.all) return;
    if (equipmentListType === 'fighters-list' && loadedBuckets.fighter) return;
    if (equipmentListType === 'fighters-tradingpost' && campaignTradingPostIds === undefined && loadedBuckets.tradingpost) return;

    // Authoritative on its own: an empty result is still a fetched result, and the
    // campaign-filtered Trading Post has no cache bucket to fall back on. Tab
    // switches clear this ref, so a deliberate reload still goes through.
    if (fetchedContextsRef.current.has(contextKey)) return;

    fetchedContextsRef.current.add(contextKey);
    fetchAllCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, equipmentListType, loadedBuckets.all, loadedBuckets.fighter, loadedBuckets.tradingpost, isLoadingAllEquipment, campaignTPKey, campaignCustomTPKey]);

  const { computedMinCost, computedMaxCost, computedMinAvailability, computedMaxAvailability, computedMinTradePoints, computedMaxTradePoints } = useMemo(() => {
    const allEquipment = Object.values(equipment).flat();
    if (allEquipment.length === 0) {
      return {
        computedMinCost: 10,
        computedMaxCost: 160,
        computedMinAvailability: 6,
        computedMaxAvailability: 12,
        computedMinTradePoints: 0,
        computedMaxTradePoints: 5,
      };
    }

    const costs = allEquipment.map(item => item.adjusted_cost ?? item.cost);
    const availabilities = allEquipment
      .map(item => {
        const availabilityStr = item.availability || '0';
        if (availabilityStr === 'C' || availabilityStr === 'E') return 0;
        if (/^[RIS]\d+$/.test(availabilityStr)) return parseInt(availabilityStr.substring(1));
        return 0;
      })
      .filter(val => !isNaN(val));
    const tradePointsValues = allEquipment.map(item => parseTradePointsCost(item.trade_points));

    return {
      computedMinCost: costs.length > 0 ? Math.min(...costs) : 10,
      computedMaxCost: costs.length > 0 ? Math.max(...costs) : 160,
      computedMinAvailability: availabilities.length > 0 ? Math.min(...availabilities) : 6,
      computedMaxAvailability: availabilities.length > 0 ? Math.max(...availabilities) : 12,
      computedMinTradePoints: tradePointsValues.length > 0 ? Math.min(...tradePointsValues) : 0,
      computedMaxTradePoints: tradePointsValues.length > 0 ? Math.max(...tradePointsValues) : 5,
    };
  }, [equipment]);

  const equipmentCount = Object.values(equipment).flat().length;
  const equipmentContextKey = `${equipmentListType}:${campaignTPKey}:${campaignCustomTPKey}`;
  const sliderResetKey = `${equipmentContextKey}:${equipmentCount > 0 ? 'loaded' : 'empty'}`;
  const [prevSliderResetKey, setPrevSliderResetKey] = useState(sliderResetKey);
  if (sliderResetKey !== prevSliderResetKey) {
    setPrevSliderResetKey(sliderResetKey);
    if (equipmentCount > 0) {
      setCostRange([computedMinCost, computedMaxCost]);
      setAvailabilityRange([computedMinAvailability, computedMaxAvailability]);
      setTradePointsRange([computedMinTradePoints, computedMaxTradePoints]);
    }
  }

  // Filter equipment based on cost and availability / trade points ranges
  const filterEquipment = useCallback((items: Equipment[]) => {
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
      const tradePoints = parseTradePointsCost(item.trade_points);
      const rarityInRange =
        rarityFilter === 'tradePoints' ? tradePoints >= tradePointsRange[0] && tradePoints <= tradePointsRange[1] :
        rarityFilter === 'availability' ? availability >= availabilityRange[0] && availability <= availabilityRange[1] :
        true;

      return costInRange && rarityInRange &&
        item.equipment_name.toLowerCase().includes(searchQuery);
    });
  }, [costRange, rarityFilter, tradePointsRange, availabilityRange, searchQuery]);

  // Derive categories from available category names (no separate fetch needed)
  const categories: Category[] = availableCategories.map(name => ({
    id: name,
    category_name: name
  }));

  const useN26CategoryFormation = hasEquipmentSuperCategories(editionSlug);

  const visibleCategories = useMemo(() => {
    return categories
      .filter(category => {
        const isVehicleAllowed = isVehicleEquipment && allowedCategories
          ? allowedCategories.includes(category.category_name)
          : !isVehicleEquipment;

        const isAvailable = availableCategories.includes(category.category_name);

        const hasMatchingEquipment = !searchQuery ||
          (equipment[category.category_name] &&
           filterEquipment(equipment[category.category_name]).length > 0);

        return isVehicleAllowed && isAvailable && hasMatchingEquipment;
      })
      .sort((a, b) => {
        if (useN26CategoryFormation) {
          const superA = getEquipmentSuperCategoryN26(a.category_name) ?? '';
          const superB = getEquipmentSuperCategoryN26(b.category_name) ?? '';
          const superRankA = equipmentSuperCategoryRankN26[superA.toLowerCase()];
          const superRankB = equipmentSuperCategoryRankN26[superB.toLowerCase()];
          if (superRankA !== undefined || superRankB !== undefined) {
            if (superRankA === undefined) return 1;
            if (superRankB === undefined) return -1;
            if (superRankA !== superRankB) return superRankA - superRankB;
          }
        }
        return compareEquipmentCategories(a.category_name, b.category_name, editionSlug);
      });
  }, [
    categories,
    isVehicleEquipment,
    allowedCategories,
    availableCategories,
    searchQuery,
    equipment,
    filterEquipment,
    useN26CategoryFormation,
    editionSlug,
  ]);

  const categoryGroups = useMemo(() => {
    if (!useN26CategoryFormation) {
      return [{ superCategory: null as string | null, categories: visibleCategories }];
    }

    const groups: { superCategory: string | null; categories: Category[] }[] = [];
    for (const category of visibleCategories) {
      const superCategory = getEquipmentSuperCategoryN26(category.category_name) ?? null;
      const last = groups[groups.length - 1];
      if (last && last.superCategory === superCategory) {
        last.categories.push(category);
      } else {
        groups.push({ superCategory, categories: [category] });
      }
    }
    return groups;
  }, [useN26CategoryFormation, visibleCategories]);

  const getCategoryDisplayName = (categoryName: string) =>
    useN26CategoryFormation
      ? getEquipmentCategoryDisplayNameN26(categoryName)
      : categoryName;

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
                <div className="flex items-center gap-0.5">
                  <span className="text-xs text-muted-foreground">Credits</span>
                  <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs">
                    {gangCredits}
                  </span>
                </div>
                {showTradePoints && (
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-muted-foreground">TP</span>
                    <span className="bg-sky-500 text-white px-3 py-1 rounded-full text-xs">
                      {gangTradePoints ?? 0}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center">
              {!isStashMode && (
                <label className="flex items-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
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
              <label className="flex items-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
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
              <label className="flex items-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
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
                  className="w-full px-3 py-2 pr-8 border rounded-md text-base md:text-sm"
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
                min={computedMinCost}
                max={computedMaxCost}
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
              
              {rarityFilter === 'availability' && (
                <RangeSlider
                  label="Availability"
                  value={availabilityRange}
                  onValueChange={setAvailabilityRange}
                  min={computedMinAvailability}
                  max={computedMaxAvailability}
                  step={1}
                  formatValue={(val) => `${val}`}
                  className="flex-1"
                />
              )}

              {rarityFilter === 'tradePoints' && (
                <RangeSlider
                  label="Trade Points"
                  value={tradePointsRange}
                  onValueChange={setTradePointsRange}
                  min={computedMinTradePoints}
                  max={computedMaxTradePoints}
                  step={1}
                  formatValue={(val) => `${val}`}
                  className="flex-1"
                />
              )}
            </div>
            
            {/* Display trading post names when Trading Post is selected and gang is in a campaign */}
            {equipmentListType === 'fighters-tradingpost' && (campaignTradingPostIds !== undefined || campaignCustomTradingPostIds !== undefined) && (
              <div className="mt-2 px-4">
                <p className="text-xs text-muted-foreground text-center">
                  Authorised: {(() => {
                    const allNames = [...(campaignTradingPostNames || []), ...(campaignCustomTradingPostNames || [])];
                    return allNames.length > 0 ? allNames.sort((a, b) => a.localeCompare(b)).join(', ') : 'None';
                  })()}
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-col">
              {error && <p className="text-red-500 p-4">{error}</p>}

              {categoryGroups.map((group) => (
                <div key={group.superCategory ?? '__ungrouped__'}>
                  {group.superCategory && (
                    <div className="px-2 py-2 text-sm font-bold uppercase tracking-wide text-muted-foreground bg-card border-b">
                      {group.superCategory}
                    </div>
                  )}
                  {group.categories.map((category) => (
                  <div key={category.id}>
                    <Button
                      variant="ghost"
                      className="relative flex w-full justify-between rounded-none px-4 py-4 text-base font-semibold bg-muted hover:bg-muted mb-[1px]"
                      onClick={() => toggleCategory(category)}
                    >
                      <span>{getCategoryDisplayName(category.category_name)}</span>
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
                                  className={`flex items-center justify-between w-full px-4 py-2 text-left gap-1 ${item.banned ? 'opacity-40 grayscale' : 'hover:bg-muted'}`}
                                >
                                  <EquipmentTooltipTrigger
                                    item={item}
                                    className="flex-1 pl-4 leading-none"
                                    options={{ equipmentListType, isVehicleEquipment }}
                                    editionSlug={editionSlug}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium">
                                        {item.equipment_type === 'vehicle_upgrade' && item.vehicle_upgrade_slot
                                          ? `${item.vehicle_upgrade_slot}: ${item.equipment_name}`
                                          : item.equipment_name}
                                      </span>
                                      {item.banned && (
                                        <Badge variant="destructive" className="px-1 text-[0.6rem]">
                                          Banned
                                        </Badge>
                                      )}
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
                                    {item.cost_resource_name && item.cost_resource_amount != null ? (
                                      <div className="min-w-6 h-6 rounded-full flex items-center justify-center bg-amber-500 text-white px-1.5" title={item.cost_resource_name}>
                                        <span className="text-[10px] font-medium">{item.cost_resource_amount}</span>
                                      </div>
                                    ) : item.adjusted_cost !== undefined && item.adjusted_cost !== (item.base_cost ?? item.cost) ? (
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
                                    {rarityFilter === 'tradePoints' && (() => {
                                      const isExclusive = isExclusiveTradePoints(item.trade_points);
                                      const canAffordTradePoints = parseTradePointsCost(item.trade_points) <= (gangTradePoints ?? 0);
                                      return (
                                        <div
                                          className={`min-w-6 h-6 rounded-full flex items-center justify-center text-white px-1.5 ${
                                            isExclusive
                                              ? 'bg-rose-500'
                                              : canAffordTradePoints
                                                ? 'bg-sky-500'
                                                : 'bg-gray-500'
                                          }`}
                                          title="Trade Points"
                                        >
                                          <span className="text-[10px] font-medium">
                                            {isExclusive ? 'E' : `TP ${parseTradePointsCost(item.trade_points)}`}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                    {rarityFilter === 'availability' && (
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
                                      disabled={item.banned}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBuyModalData(item);
                                      }}
                                      className={`text-white text-xs py-0.5 px-2 h-6 ${
                                        item.banned
                                          ? "bg-gray-500 cursor-not-allowed"
                                          : affordable
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
              ))}
            </div>
            {buyModalData && (
              <PurchaseModal
                item={buyModalData}
                gangCredits={gangCredits}
                onClose={() => setBuyModalData(null)}
                onConfirm={({ cost, isMasterCrafted, useBaseCostForRating, selectedEffectIds, equipmentTarget, selectedGrantEquipmentIds, resourceCost, tradePoints }) => {
                  purchaseEquipment({
                    item: buyModalData,
                    manualCost: cost,
                    isMasterCrafted,
                    useBaseCostForRating,
                    selectedEffectIds: selectedEffectIds || [],
                    equipmentTarget,
                    selectedGrantEquipmentIds: selectedGrantEquipmentIds || [],
                    resourceCost,
                    tradePoints,
                  })
                }}
                isStashPurchase={Boolean(isStashMode || (!fighterId && !vehicleId))}
                fighterId={fighterId}
                fighterWeapons={fighterWeapons}
                equipmentListType={equipmentListType}
                gangCampaignResources={gangCampaignResources}
                gangReputation={gangReputation}
                editionSlug={editionSlug}
                gangTradePoints={gangTradePoints}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default ItemModal;

