'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { countLimitPrefix } from '@/utils/countLimitPrefix';
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
  fighterCredits: number;
  fighterHasLegacy?: boolean;
  fighterLegacyName?: string;
  vehicleId?: string;
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
  min_count?: number | null;
  max_count?: number | null;
}

const VEHICLE_UPGRADE_SLOT_ORDER: Record<string, number> = { Body: 1, Drive: 2, Engine: 3 };

/** Formats get_equipment_detailed_data rows and groups them by category, sorted by name. */
function groupEquipmentByCategory(data: RawEquipmentData[], markFightersList: boolean): Record<string, Equipment[]> {
  const byId = new Map<string, Equipment & { equipment_category: string }>();
  for (const item of data) {
    if (byId.has(item.id)) continue;
    byId.set(item.id, {
      ...item,
      equipment_id: item.id,
      fighter_equipment_id: '',
      cost: item.adjusted_cost,
      trade_points: item.trade_points ?? undefined,
      fighter_weapon_id: item.fighter_weapon_id || undefined,
      master_crafted: item.master_crafted || false,
      vehicle_upgrade_slot: item.vehicle_upgrade_slot || undefined,
      from_fighters_list: markFightersList && item.fighter_type_equipment
    });
  }

  const equipmentByCategory: Record<string, Equipment[]> = {};
  const sorted = [...byId.values()].sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
  for (const item of sorted) {
    (equipmentByCategory[item.equipment_category] ??= []).push(item);
  }
  // Vehicle Upgrades go by slot (no slot first), keeping name order within a slot.
  equipmentByCategory['Vehicle Upgrades']?.sort((a, b) =>
    (VEHICLE_UPGRADE_SLOT_ORDER[a.vehicle_upgrade_slot ?? ''] ?? 0) -
    (VEHICLE_UPGRADE_SLOT_ORDER[b.vehicle_upgrade_slot ?? ''] ?? 0)
  );
  return equipmentByCategory;
}

const NO_EQUIPMENT: Record<string, Equipment[]> = {};

type EquipmentListType = "fighters-list" | "fighters-tradingpost" | "unrestricted";

type SliderBounds = { cost: [number, number]; availability: [number, number]; tradePoints: [number, number] };
const DEFAULT_SLIDER_BOUNDS: SliderBounds = { cost: [10, 160], availability: [6, 12], tradePoints: [0, 5] };

/** The number in an availability such as "R12", "I9" or "S7"; 0 for "C", "E" and anything else. */
function availabilityLevel(availability: string | null | undefined): number {
  return availability && /^[RIS]\d+$/.test(availability) ? parseInt(availability.substring(1)) : 0;
}

const ItemModal: React.FC<ItemModalProps> = ({
  title,
  onClose,
  gangCredits,
  gangId,
  gangTypeId,
  fighterId,
  fighterTypeId,
  fighterCredits,
  fighterHasLegacy,
  vehicleId,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [buyModalData, setBuyModalData] = useState<Equipment | null>(null);
  const [equipmentListType, setEquipmentListType] = useState<EquipmentListType>(
    isStashMode ? "fighters-tradingpost" : "fighters-list"
  );
  const [costRange, setCostRange] = useState(DEFAULT_SLIDER_BOUNDS.cost);
  const [availabilityRange, setAvailabilityRange] = useState(DEFAULT_SLIDER_BOUNDS.availability);
  const [tradePointsRange, setTradePointsRange] = useState(DEFAULT_SLIDER_BOUNDS.tradePoints);
  const [includeLegacy, setIncludeLegacy] = useState<boolean>(false);

  // Which rarity axis this list filters on: N26 gates equipment by Trade Points where
  // earlier editions use Availability, and a fighter's own list has neither.
  const rarityFilter: 'none' | 'tradePoints' | 'availability' =
    equipmentListType === 'fighters-list' ? 'none' : showTradePoints ? 'tradePoints' : 'availability';

  const chargesTradePoints = showTradePoints && equipmentListType !== 'fighters-list';

  const { purchaseEquipment } = usePurchaseEquipment({
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

  const resolvedTypeId = isVehicleEquipment ? vehicleTypeId : fighterTypeId;
  // Gang-level access (no fighter) and custom fighters list equipment without a type.
  const missingTypeError = !resolvedTypeId && fighterId && !isCustomFighter
    ? isVehicleEquipment
      ? 'Vehicle type information is missing'
      : 'Fighter type information is missing'
    : null;
  // In Trading Post mode with a fighter type, SQL ORs the Trading Post and the fighter's list.
  const includesFightersList =
    equipmentListType === 'fighters-list' ||
    (equipmentListType === 'fighters-tradingpost' && !!resolvedTypeId && !isVehicleEquipment);

  const equipmentParams = new URLSearchParams();
  if (gangTypeId) equipmentParams.set('gang_type_id', gangTypeId);
  if (resolvedTypeId) equipmentParams.set('fighter_type_id', resolvedTypeId);
  if (includesFightersList) equipmentParams.set('fighter_type_equipment', 'true');
  if (equipmentListType === 'fighters-tradingpost') {
    equipmentParams.set('equipment_tradingpost', 'true');
    // A gang in a campaign only sees the campaign's authorised Trading Posts.
    if (campaignTradingPostIds !== undefined) {
      equipmentParams.set('campaign_trading_post_type_ids', campaignTradingPostIds.join(','));
    }
    if (campaignCustomTradingPostIds?.length) {
      equipmentParams.set('campaign_custom_trading_post_ids', campaignCustomTradingPostIds.join(','));
    }
  }
  // fighter_id lets the RPC match subtype rules (e.g. Leaders and Champions) against
  // the fighter's own subtypes, which keep-type promotions change without changing
  // the fighter type. include_legacy decides whether its Gang Legacy type applies.
  if (!isVehicleEquipment && fighterId) {
    equipmentParams.set('fighter_id', fighterId);
    equipmentParams.set('include_legacy', String(includeLegacy));
  }
  const equipmentQuery = equipmentParams.toString();

  const queryClient = useQueryClient();
  const { data: equipment = NO_EQUIPMENT, error: equipmentError } = useQuery({
    queryKey: ['available-equipment', gangId, equipmentQuery],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${gangId}/available-equipment?${equipmentQuery}`);
      if (!response.ok) throw new Error('Failed to load equipment categories');
      const data: RawEquipmentData[] = await response.json();
      return groupEquipmentByCategory(data, equipmentListType === 'fighters-tradingpost' && includesFightersList);
    },
    enabled: !missingTypeError,
  });
  // Lists and costs depend on the fighter, so drop them when the modal closes.
  useEffect(() => () => queryClient.removeQueries({ queryKey: ['available-equipment', gangId] }), [queryClient, gangId]);
  const error = missingTypeError ?? equipmentError?.message ?? null;

  const toggleCategory = (category: string) => {
    const newSet = new Set(expandedCategories);
    if (!newSet.delete(category)) newSet.add(category);
    setExpandedCategories(newSet);
  };

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

  const allEquipment = useMemo(() => Object.values(equipment).flat(), [equipment]);
  const sliderBounds = useMemo((): SliderBounds => {
    if (allEquipment.length === 0) return DEFAULT_SLIDER_BOUNDS;
    const bounds = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];
    return {
      cost: bounds(allEquipment.map(item => item.adjusted_cost ?? item.cost)),
      availability: bounds(allEquipment.map(item => availabilityLevel(item.availability))),
      tradePoints: bounds(allEquipment.map(item => parseTradePointsCost(item.trade_points))),
    };
  }, [allEquipment]);

  const equipmentCount = allEquipment.length;
  const sliderResetKey = `${equipmentQuery}:${equipmentCount > 0 ? 'loaded' : 'empty'}`;
  const [prevSliderResetKey, setPrevSliderResetKey] = useState(sliderResetKey);
  if (sliderResetKey !== prevSliderResetKey) {
    setPrevSliderResetKey(sliderResetKey);
    if (equipmentCount > 0) {
      setCostRange(sliderBounds.cost);
      setAvailabilityRange(sliderBounds.availability);
      setTradePointsRange(sliderBounds.tradePoints);
    }
  }

  // Filter equipment based on cost and availability / trade points ranges
  const filterEquipment = (items: Equipment[]) => {
    return items.filter(item => {
      const cost = item.adjusted_cost ?? item.cost;
      const availability = availabilityLevel(item.availability);

      const costInRange = cost >= costRange[0] && cost <= costRange[1];
      const tradePoints = parseTradePointsCost(item.trade_points);
      const rarityInRange =
        rarityFilter === 'tradePoints' ? tradePoints >= tradePointsRange[0] && tradePoints <= tradePointsRange[1] :
        rarityFilter === 'availability' ? availability >= availabilityRange[0] && availability <= availabilityRange[1] :
        true;

      return costInRange && rarityInRange &&
        item.equipment_name.toLowerCase().includes(searchQuery);
    });
  };

  const useN26CategoryFormation = hasEquipmentSuperCategories(editionSlug);

  const visibleCategories = useMemo(() => {
    return Object.keys(equipment)
      .filter(category => {
        const isVehicleAllowed = isVehicleEquipment && allowedCategories
          ? allowedCategories.includes(category)
          : !isVehicleEquipment;

        const hasMatchingEquipment = !searchQuery ||
          (equipment[category] &&
           filterEquipment(equipment[category]).length > 0);

        return isVehicleAllowed && hasMatchingEquipment;
      })
      .sort((a, b) => {
        if (useN26CategoryFormation) {
          const superA = getEquipmentSuperCategoryN26(a) ?? '';
          const superB = getEquipmentSuperCategoryN26(b) ?? '';
          const superRankA = equipmentSuperCategoryRankN26[superA.toLowerCase()];
          const superRankB = equipmentSuperCategoryRankN26[superB.toLowerCase()];
          if (superRankA !== undefined || superRankB !== undefined) {
            if (superRankA === undefined) return 1;
            if (superRankB === undefined) return -1;
            if (superRankA !== superRankB) return superRankA - superRankB;
          }
        }
        return compareEquipmentCategories(a, b, editionSlug);
      });
  }, [
    isVehicleEquipment,
    allowedCategories,
    searchQuery,
    equipment,
    costRange,
    availabilityRange,
    tradePointsRange,
    rarityFilter,
    useN26CategoryFormation,
    editionSlug,
  ]);

  const categoryGroups = useMemo(() => {
    if (!useN26CategoryFormation) {
      return [{ superCategory: null as string | null, categories: visibleCategories }];
    }

    const groups: { superCategory: string | null; categories: string[] }[] = [];
    for (const category of visibleCategories) {
      const superCategory = getEquipmentSuperCategoryN26(category) ?? null;
      const last = groups[groups.length - 1];
      if (last && last.superCategory === superCategory) {
        last.categories.push(category);
      } else {
        groups.push({ superCategory, categories: [category] });
      }
    }
    return groups;
  }, [useN26CategoryFormation, visibleCategories]);

  const equipmentListTabs: { value: EquipmentListType; label: string }[] = [
    // The stash has no fighter or vehicle, so it has no list of its own.
    ...(isStashMode ? [] : [{ value: 'fighters-list' as const, label: isVehicleEquipment ? "Vehicle's List" : "Fighter's List" }]),
    { value: 'fighters-tradingpost', label: 'Trading Post' },
    { value: 'unrestricted', label: 'Unrestricted' },
  ];

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
              {equipmentListTabs.map(tab => (
                <label key={tab.value} className="flex items-center text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                  <input
                    type="radio"
                    name="equipment-list"
                    value={tab.value}
                    checked={equipmentListType === tab.value}
                    onChange={() => setEquipmentListType(tab.value)}
                    className="mr-1"
                  />
                  {tab.label}
                </label>
              ))}
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
                min={sliderBounds.cost[0]}
                max={sliderBounds.cost[1]}
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
                    }}
                  />
                </label>
              )}
              
              {rarityFilter === 'availability' && (
                <RangeSlider
                  label="Availability"
                  value={availabilityRange}
                  onValueChange={setAvailabilityRange}
                  min={sliderBounds.availability[0]}
                  max={sliderBounds.availability[1]}
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
                  min={sliderBounds.tradePoints[0]}
                  max={sliderBounds.tradePoints[1]}
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
                  <div key={category}>
                    <Button
                      variant="ghost"
                      className="relative flex w-full justify-between rounded-none px-4 py-4 text-base font-semibold bg-muted hover:bg-muted mb-[1px]"
                      onClick={() => toggleCategory(category)}
                    >
                      <span>{getCategoryDisplayName(category)}</span>
                      <LuChevronRight
                        className={`h-4 w-4 transition-transform duration-200 ${
                          expandedCategories.has(category) ? "rotate-90" : ""
                        }`}
                      />
                    </Button>

                    {expandedCategories.has(category) && (
                      <div>
                        {equipment[category]?.length ? (
                          filterEquipment(equipment[category])
                            .map((item, itemIndex) => {
                              const affordable = canAffordEquipment(item);
                              return (
                                <div
                                  key={`${category}-${item.equipment_id}-${itemIndex}`}
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
                                          ? `${item.vehicle_upgrade_slot}: ${countLimitPrefix(item)}${item.equipment_name}`
                                          : `${countLimitPrefix(item)}${item.equipment_name}`}
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

