'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { createClient } from "@/utils/supabase/client";
import { Equipment, WeaponProfile } from '@/types/equipment';
import { ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { Checkbox } from "@/components/ui/checkbox";
import { ImInfo } from "react-icons/im";
import { LuX } from "react-icons/lu";

interface ItemModalProps {
  title: string;
  onClose: () => void;
  gangCredits: number;
  gangId: string;
  gangTypeId: string;
  fighterId: string;
  fighterTypeId: string;
  fighterCredits: number;
  vehicleId?: string;
  vehicleType?: string;
  vehicleTypeId?: string;
  isVehicleEquipment?: boolean;
  allowedCategories?: string[];
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
  equipment_type: 'weapon' | 'wargear';
  created_at: string;
  weapon_profiles?: WeaponProfile[];
  fighter_type_equipment: boolean;
  fighter_type_equipment_tp: boolean;
  fighter_weapon_id?: string;
  fighter_equipment_id: string;
  master_crafted?: boolean;
  is_custom: boolean;
}

interface PurchaseModalProps {
  item: Equipment;
  gangCredits: number;
  onClose: () => void;
  onConfirm: (cost: number, isMasterCrafted: boolean, useBaseCostForRating: boolean) => void;
}

interface Category {
  id: string;
  category_name: string;
}

function PurchaseModal({ item, gangCredits, onClose, onConfirm }: PurchaseModalProps) {
  const [manualCost, setManualCost] = useState<string>(String(item.adjusted_cost ?? item.cost));
  const [creditError, setCreditError] = useState<string | null>(null);
  const [isMasterCrafted, setIsMasterCrafted] = useState(false);
  const [useBaseCostForRating, setUseBaseCostForRating] = useState(true);

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
    onConfirm(parsedCost, isMasterCrafted, useBaseCostForRating);
    return true; // Allow modal to close
  };

  return (
    <Modal
      title="Confirm Purchase"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to buy {item.equipment_name}?</p>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="text-sm font-medium text-gray-700 cursor-pointer"
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
                className="text-sm font-medium text-gray-700 cursor-pointer"
              >
                Use base cost for Fighter Rating
              </label>
              <div className="relative group">
                <ImInfo />
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
                  When checked, the equipment will cost what you enter above, but its rating will be calculated using the base cost. When unchecked, the equipment's rating will be based on what you paid.
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
  fighterCredits,
  vehicleId,
  vehicleType,
  vehicleTypeId,
  isVehicleEquipment,
  allowedCategories,
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
  const [equipmentListType, setEquipmentListType] = useState<"fighters-list" | "fighters-tradingpost" | "unrestricted">("fighters-list");
  const [localVehicleTypeId, setLocalVehicleTypeId] = useState<string | undefined>(vehicleTypeId);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [cachedFighterCategories, setCachedFighterCategories] = useState<string[]>([]);
  const [cachedFighterTPCategories, setCachedFighterTPCategories] = useState<string[]>([]);
  const [cachedAllCategories, setCachedAllCategories] = useState<string[]>([]);
  const [cachedEquipment, setCachedEquipment] = useState<Record<string, Record<string, Equipment[]>>>({
    fighter: {},
    all: {}
  });
  const DEBUG = false;

  useEffect(() => {
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

  const fetchAllCategories = async () => {
    if (!session) return;
    setError(null);

    const typeIdToUse = isVehicleEquipment 
      ? localVehicleTypeId || vehicleTypeId 
      : fighterTypeId;

    if (!gangTypeId || !typeIdToUse) {
      const errorMessage = isVehicleEquipment && !typeIdToUse
        ? `Vehicle type information is missing. Vehicle: ${vehicleType || 'unknown'}`
        : !fighterTypeId
        ? 'Fighter type information is missing'
        : 'Required information is missing';

      console.log('Missing type info debug:', {
        isVehicleEquipment,
        vehicleTypeId,
        localVehicleTypeId,
        fighterTypeId,
        gangTypeId
      });

      setError(errorMessage);
      return;
    }

    if (equipmentListType === 'unrestricted' && cachedAllCategories.length > 0) {
      setAvailableCategories(cachedAllCategories);
      return;
    } else if (equipmentListType === 'fighters-list' && cachedFighterCategories.length > 0) {
      setAvailableCategories(cachedFighterCategories);
      return;
    } else if (equipmentListType === 'fighters-tradingpost' && cachedFighterTPCategories.length > 0) {
      setAvailableCategories(cachedFighterTPCategories);
      return;
    }

    try {
      const requestBody: Record<string, any> = {
        gang_type_id: gangTypeId,
        fighter_type_id: typeIdToUse,
      };

      if (equipmentListType === 'fighters-list') {
        requestBody.fighter_type_equipment = true;
      }

      if (equipmentListType === 'fighters-tradingpost') {
        requestBody.equipment_tradingpost = true;
      }

      console.log(`fetchAllCategories request for ${equipmentListType}:`, requestBody);

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

      console.log(`fetchAllCategories response for ${equipmentListType}: ${data.length} items received`);

      if (DEBUG) {
        console.log('Fighter equipment data:', data);
      }

      const uniqueCategories = Array.from(new Set(data.map(item => item.equipment_category)));

      if (equipmentListType === 'unrestricted') {
        setCachedAllCategories(uniqueCategories);
      } else if (equipmentListType === 'fighters-list') {
        setCachedFighterCategories(uniqueCategories);
      } else if (equipmentListType === 'fighters-tradingpost') {
        setCachedFighterTPCategories(uniqueCategories);
      }

      setAvailableCategories(uniqueCategories);
    } catch (err) {
      console.error('Error fetching all equipment categories:', err);
      setError('Failed to load equipment categories');
    }
  };

  const fetchCategoryEquipment = async (categoryName: string, categoryQuery: string) => {
    if (!session) return;
    setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: true }));
    setError(null);

    const cacheKey = equipmentListType === 'unrestricted' ? 'all' : equipmentListType === 'fighters-tradingpost' ? 'tradingpost' : 'fighter';

    if (equipmentListType === 'fighters-tradingpost' && !cachedEquipment.tradingpost) {
      setCachedEquipment(prev => ({
        ...prev,
        tradingpost: {}
      }));
    }

    if (cachedEquipment[cacheKey]?.[categoryName]) {
      setEquipment(prev => ({
        ...prev,
        [categoryName]: cachedEquipment[cacheKey][categoryName]
      }));
      setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: false }));
      return;
    }

    const typeIdToUse = isVehicleEquipment 
      ? localVehicleTypeId || vehicleTypeId 
      : fighterTypeId;

    if (!gangTypeId || !typeIdToUse) {
      const errorMessage = isVehicleEquipment && !typeIdToUse
        ? `Vehicle type information is missing. Vehicle: ${vehicleType || 'unknown'}`
        : !fighterTypeId
        ? 'Fighter type information is missing'
        : 'Required information is missing';

      console.log('Missing type info debug:', {
        isVehicleEquipment,
        vehicleTypeId,
        localVehicleTypeId,
        fighterTypeId,
        gangTypeId
      });

      setError(errorMessage);
      setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: false }));
      return;
    }

    try {
      const requestBody: Record<string, any> = {
        gang_type_id: gangTypeId,
        equipment_category: categoryQuery,
        fighter_type_id: typeIdToUse
      };

      if (equipmentListType === 'fighters-list') {
        requestBody.fighter_type_equipment = true;
      } else if (equipmentListType === 'fighters-tradingpost') {
        requestBody.equipment_tradingpost = true;
      }

      Object.keys(requestBody).forEach(key =>
        requestBody[key] === undefined && delete requestBody[key]
      );

      console.log(`fetchCategoryEquipment request for ${categoryName} (${equipmentListType}):`, requestBody);

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
        throw new Error(`Failed to fetch ${categoryName}`);
      }

      const data: RawEquipmentData[] = await response.json();
      
      console.log(`fetchCategoryEquipment response for ${categoryName}: ${data.length} items received`);

      if (equipmentListType !== 'unrestricted' && categoryQuery === '*') {
        const categories = Array.from(new Set(data.map(item => item.equipment_category)));
        setAvailableCategories(categories);
      }

      if (DEBUG) {
        console.log('Fighter equipment data:', data);
      }

      const formattedData = data
        .map((item: RawEquipmentData) => ({
          ...item,
          equipment_id: item.id,
          fighter_equipment_id: '',
          cost: item.adjusted_cost,
          base_cost: item.base_cost,
          adjusted_cost: item.adjusted_cost,
          equipment_type: item.equipment_type as 'weapon' | 'wargear',
          fighter_weapon_id: item.fighter_weapon_id || undefined,
          master_crafted: item.master_crafted || false,
          is_custom: item.is_custom
        }))
        .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));

      const lasgun = formattedData.find(item => item.equipment_name === 'Lasgun');
      if (lasgun) {
        console.log('Formatted Lasgun:', lasgun);
      }

      setEquipment(prev => ({
        ...prev,
        [categoryName]: formattedData
      }));

      setCachedEquipment(prev => ({
        ...prev,
        [cacheKey]: {
          ...prev[cacheKey] || {},
          [categoryName]: formattedData
        }
      }));
    } catch (err) {
      console.error('Error fetching equipment:', err);
      setError(`Failed to load ${categoryName}`);
    } finally {
      setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: false }));
    }
  };

  const toggleCategory = async (category: Category) => {
    const isExpanded = expandedCategories.has(category.category_name);
    const newSet = new Set(expandedCategories);

    if (isExpanded) {
      newSet.delete(category.category_name);
    } else {
      newSet.add(category.category_name);
      if (!equipment[category.category_name]) {
        await fetchCategoryEquipment(category.category_name, category.category_name);
      }
    }

    setExpandedCategories(newSet);
  };

  useEffect(() => {
    if (!searchQuery) return;

    const matching = new Set<string>();

    for (const category of categories) {
      const items = equipment[category.category_name] || [];
      const match = items.some(item =>
        item.equipment_name.toLowerCase().includes(searchQuery)
      );
      if (match) {
        matching.add(category.category_name);
        if (!items.length) {
          fetchCategoryEquipment(category.category_name, category.category_name);
        }
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

  const handleBuyEquipment = async (item: Equipment, manualCost: number, isMasterCrafted: boolean = false, useBaseCostForRating: boolean = true) => {
    if (!session) return;
    try {
      const requestBody = {
        ...(item.is_custom 
          ? { custom_equipment_id: item.equipment_id }
          : { equipment_id: item.equipment_id }
        ),
        gang_id: gangId,
        manual_cost: manualCost,
        master_crafted: isMasterCrafted && item.equipment_type === 'weapon',
        use_base_cost_for_rating: useBaseCostForRating,
        ...(isVehicleEquipment
          ? { vehicle_id: vehicleId }
          : { fighter_id: fighterId }
        )
      };

      console.log('Sending equipment purchase request:', requestBody);

      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/buy_equipment_for_fighter',
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
        const errorText = await response.text();
        console.error('Purchase failed with status:', response.status);
        console.error('Error details:', errorText);
        throw new Error(`Failed to buy equipment: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      const newGangCredits = data.updategangsCollection?.records[0]?.credits;
      const equipmentRecord = data.insertIntofighter_equipmentCollection?.records[0];

      if (!equipmentRecord) {
        throw new Error('Failed to get equipment ID from response');
      }

      // Use the rating cost from the backend response
      // This value will be the adjusted_cost when use_base_cost_for_rating is true
      // or the manual_cost when use_base_cost_for_rating is false
      const ratingCost = data.rating_cost;
      
      // Calculate new fighter credits adding the rating cost, not the manual cost
      // This ensures the fighter's rating is correctly updated
      const newFighterCredits = fighterCredits + ratingCost;
      
      // Log to verify the values being used
      console.log('Equipment purchase details:', {
        manualCost,
        useBaseCostForRating,
        baseCost: item.base_cost,
        adjustedCost: item.adjusted_cost,
        ratingCost,
        responseRatingCost: data.rating_cost,
        equipmentRecord,
        newFighterCredits,
        oldFighterCredits: fighterCredits
      });

      onEquipmentBought(newFighterCredits, newGangCredits, {
        ...item,
        fighter_equipment_id: equipmentRecord.id,
        cost: ratingCost, // Use the rating cost value from the server
        is_master_crafted: equipmentRecord.is_master_crafted,
        equipment_name: equipmentRecord.is_master_crafted && item.equipment_type === 'weapon' 
          ? `${item.equipment_name} (Master-crafted)` 
          : item.equipment_name,
        vehicle_equipment_profiles: equipmentRecord.vehicle_profile ? [{
          ...equipmentRecord.vehicle_profile,
          id: equipmentRecord.id,
          equipment_id: item.equipment_id,
          created_at: new Date().toISOString()
        }] : undefined,
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
    if (session && equipmentListType !== 'unrestricted') {
      fetchAllCategories();
    }
  }, [session, equipmentListType]);

  useEffect(() => {
    if (equipmentListType === 'unrestricted' && cachedAllCategories.length > 0) {
      setAvailableCategories(cachedAllCategories);
    } else if (equipmentListType === 'fighters-list' && cachedFighterCategories.length > 0) {
      setAvailableCategories(cachedFighterCategories);
    } else if (equipmentListType === 'fighters-tradingpost' && cachedFighterTPCategories.length > 0) {
      setAvailableCategories(cachedFighterTPCategories);
    }

    expandedCategories.forEach(category =>
      fetchCategoryEquipment(category, category)
    );
  }, [equipmentListType]);

  useEffect(() => {
    if (!availableCategories.length || !session) return;

    availableCategories.forEach((categoryName) => {
      if (!equipment[categoryName]) {
        fetchCategoryEquipment(categoryName, categoryName);
      }
    });
  }, [availableCategories, session]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="w-[600px] min-h-0 max-h-svh overflow-y-auto rounded-lg bg-white shadow-xl">
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
              <span className="text-sm text-gray-600">Gang Credits</span>
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                {gangCredits}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <label className="flex text-sm text-gray-600 cursor-pointer whitespace-nowrap leading-8">
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
              Fighter's List
            </label>
            <label className="flex text-sm text-gray-600 cursor-pointer whitespace-nowrap">
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
            <label className="flex text-sm text-gray-600 cursor-pointer whitespace-nowrap">
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black text-xl leading-none"
                  aria-label="Clear search"
                >
                  <LuX size={20} />
                </button>
              )}
            </div>
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

                const isAvailable = equipmentListType === 'unrestricted' ||
                  availableCategories.includes(category.category_name);

                return isVehicleAllowed && isAvailable;
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
                  className="relative flex w-full justify-between rounded-none px-4 py-4 text-base font-semibold bg-gray-50 hover:bg-gray-100 mb-[1px]"
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
                  <div className="bg-gray-50">
                    {categoryLoadingStates[category.category_name] ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                      </div>
                    ) : equipment[category.category_name]?.length ? (
                      equipment[category.category_name]
                        .filter(item => item.equipment_name.toLowerCase().includes(searchQuery))
                        .map((item) => {
                        const affordable = canAffordEquipment(item);
                        const hasAdjustedCost = (item.adjusted_cost ?? item.cost) < (item.base_cost ?? item.cost);

                        return (
                          <div
                            key={item.equipment_id}
                            className="flex items-center justify-between w-full px-4 py-2 text-left hover:bg-gray-50"
                          >
                            <div className="flex-1 pl-4 leading-none">
                              <span className="text-sm font-medium">{item.equipment_name}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {item.adjusted_cost !== undefined && item.adjusted_cost < (item.base_cost ?? item.cost) ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white">
                                    <span className="text-[10px] font-medium">{item.adjusted_cost ?? item.cost}</span>
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

                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-sky-500 text-white">
                                <span className="text-[10px] font-medium">{item.availability}</span>
                              </div>

                              {(
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
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-gray-500 italic text-center p-4">
                        No equipment available.
                      </p>
                    )}
                  </div>
                )}
                <div className="h-[1px] w-full bg-gray-200" />
              </div>
            ))}
            {availableCategories.length === 0 && equipmentListType !== 'unrestricted' && (
              <p className="text-gray-500 italic text-center p-4">
                No equipment available.
              </p>
            )}
          </div>
        </div>
      </div>

      {buyModalData && (
        <PurchaseModal
          item={buyModalData}
          gangCredits={gangCredits}
          onClose={() => setBuyModalData(null)}
          onConfirm={(parsedCost, isMasterCrafted, useBaseCostForRating) => handleBuyEquipment(buyModalData, parsedCost, isMasterCrafted, useBaseCostForRating)}
        />
      )}
    </div>
  );
};

export default ItemModal;
