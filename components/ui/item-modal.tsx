'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import { createClient } from "@/utils/supabase/client";
import { Equipment, WeaponProfile } from '@/types/equipment';
import { ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface ItemModalProps {
  title: string;
  onClose: () => void;
  gangCredits: number;
  gangId: string;
  gangTypeId: string;
  fighterId: string;
  fighterCredits: number;
  onEquipmentBought: (newFighterCredits: number, newGangCredits: number, boughtEquipment: Equipment) => void;
}

interface RawEquipmentData {
  id: string;
  equipment_name: string;
  trading_post_category: string;
  availability: string | null;
  base_cost: number;
  discounted_cost: number;
  equipment_category: string;
  equipment_type: 'weapon' | 'wargear';
  created_at: string;
  weapon_profiles?: WeaponProfile[];
  fighter_type_equipment: boolean;
  core_equipment?: boolean;
}

interface PurchaseModalProps {
  item: Equipment;
  onClose: () => void;
  onConfirm: (cost: number) => void;
}

interface Category {
  id: string;
  category_name: string;
}

function PurchaseModal({ item, onClose, onConfirm }: PurchaseModalProps) {
  const [manualCost, setManualCost] = useState(item.discounted_cost ?? item.cost);

  return (
    <Modal
      title="Confirm Purchase"
      content={
        <div className="space-y-4">
          <p>Are you sure you want to buy {item.equipment_name}?</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost
              </label>
              <input
                type="number"
                value={manualCost}
                onChange={(e) => setManualCost(Number(e.target.value))}
                className="w-full p-2 border rounded-md"
                min="0"
              />
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      onConfirm={() => onConfirm(manualCost)}
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
  fighterCredits,
  onEquipmentBought 
}) => {
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<Record<string, Equipment[]>>({});
  const [categoryLoadingStates, setCategoryLoadingStates] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const [buyModalData, setBuyModalData] = useState<Equipment | null>(null);
  const [session, setSession] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAllEquipment, setShowAllEquipment] = useState(false);

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

  const fetchCategoryEquipment = useCallback(async (categoryName: string, categoryQuery: string) => {
    if (!session) return;
    setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: true }));
    setError(null);
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_equipment_with_discounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            gang_type_id: gangTypeId,
            equipment_category: categoryQuery,
            fighter_type_id: fighterId
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch ${categoryName}`);
      }

      const data: RawEquipmentData[] = await response.json();
      
      const formattedData = data
        .map((item: RawEquipmentData) => ({
          ...item,
          equipment_id: item.id,
          fighter_equipment_id: '',
          cost: item.discounted_cost,
          base_cost: item.base_cost,
          discounted_cost: item.discounted_cost,
          equipment_type: item.equipment_type as 'weapon' | 'wargear',
          fighter_type_equipment: item.fighter_type_equipment,
          core_equipment: item.core_equipment
        }));

      setEquipment(prev => ({
        ...prev,
        [categoryName]: formattedData
      }));
    } catch (err) {
      console.error('Error fetching equipment:', err);
      setError(`Failed to load ${categoryName}`);
    } finally {
      setCategoryLoadingStates(prev => ({ ...prev, [categoryName]: false }));
    }
  }, [session, gangTypeId, fighterId]);

  const toggleCategory = async (category: Category) => {
    const newExpandedCategory = expandedCategory === category.category_name ? null : category.category_name;
    setExpandedCategory(newExpandedCategory);

    if (newExpandedCategory && !equipment[category.category_name]) {
      await fetchCategoryEquipment(category.category_name, category.category_name);
    }
  };

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const canAffordEquipment = (item: Equipment) => {
    return gangCredits >= (item.discounted_cost ?? item.cost);
  };

  const handleBuyEquipment = async (item: Equipment, manualCost: number) => {
    if (!session) return;
    try {
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/buy_equipment_for_fighter',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            equipment_id: item.equipment_id,
            fighter_id: fighterId,
            gang_id: gangId,
            manual_cost: manualCost
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to buy equipment: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const newFighterCredits = fighterCredits + manualCost;
      const newGangCredits = data.updategangsCollection?.records[0]?.credits;
      const fighterEquipmentId = data.insertIntofighter_equipmentCollection?.records[0]?.id;

      if (!fighterEquipmentId) {
        throw new Error('Failed to get equipment ID from response');
      }

      onEquipmentBought(newFighterCredits, newGangCredits, {
        ...item,
        fighter_equipment_id: fighterEquipmentId,
        cost: manualCost
      });
      
      toast({
        title: "Equipment purchased",
        description: `Successfully bought ${item.equipment_name} for ${manualCost} credits`,
        variant: "default",
      });

      onClose();
    } catch (err) {
      console.error('Error buying equipment:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to buy equipment',
        variant: "destructive",
      });
    }
  };

  const getFilteredEquipment = (categoryName: string) => {
    const items = equipment[categoryName];
    if (!items) return [];
    
    return items
      .filter(item => showAllEquipment || item.fighter_type_equipment)
      .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={handleOverlayClick}
    >
      <div className="w-[600px] rounded-lg bg-white shadow-xl">
        <div className="flex flex-col border-b">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-xl font-semibold">Equipment</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Gang Credits</span>
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                {gangCredits}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full ml-2"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
          
          <div className="px-4 pb-4 flex items-center space-x-2">
            <Switch
              id="show-all"
              checked={showAllEquipment}
              onCheckedChange={setShowAllEquipment}
            />
            <Label htmlFor="show-all">Show all equipment</Label>
          </div>
        </div>

        <div className="h-[600px] overflow-y-auto">
          <div className="flex flex-col">
            {error && <p className="text-red-500 p-4">{error}</p>}
            
            {categories.map((category) => (
              <div key={category.id}>
                <Button
                  variant="ghost"
                  className="relative flex w-full justify-between rounded-none px-4 py-6 text-base bg-gray-50 hover:bg-gray-100 mb-[1px]"
                  onClick={() => toggleCategory(category)}
                >
                  <span>{category.category_name}</span>
                  <ChevronRight
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expandedCategory === category.category_name ? "rotate-90" : ""
                    }`}
                  />
                </Button>

                {expandedCategory === category.category_name && (
                  <div className="bg-gray-50">
                    {categoryLoadingStates[category.category_name] ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                      </div>
                    ) : getFilteredEquipment(category.category_name).length ? (
                      getFilteredEquipment(category.category_name).map((item) => {
                        const affordable = canAffordEquipment(item);
                        const hasDiscount = (item.discounted_cost ?? item.cost) < (item.base_cost ?? item.cost);
                        
                        return (
                          <Button
                            key={item.equipment_id}
                            variant="ghost"
                            className={`w-full justify-between px-4 py-2 text-sm hover:bg-gray-100 ${!affordable ? 'opacity-50' : ''}`}
                          >
                            <span>{item.equipment_name}</span>
                            <div className="flex items-center gap-2">
                              {hasDiscount ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-900 text-white">
                                    <span className="text-[10px] font-medium line-through">{item.base_cost ?? item.cost}</span>
                                  </div>
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white">
                                    <span className="text-[10px] font-medium">{item.discounted_cost ?? item.cost}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-900 text-white">
                                  <span className="text-[10px] font-medium">{item.cost}</span>
                                </div>
                              )}
                              {affordable && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuyModalData(item);
                                  }}
                                  className="bg-green-500 hover:bg-green-600 text-white text-xs py-0.5 px-2 h-6"
                                >
                                  Buy
                                </Button>
                              )}
                            </div>
                          </Button>
                        );
                      })
                    ) : (
                      <p className="text-sm text-gray-500 italic p-4">
                        No equipment available
                      </p>
                    )}
                  </div>
                )}
                <div className="h-[1px] w-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {buyModalData && (
        <PurchaseModal
          item={buyModalData}
          onClose={() => setBuyModalData(null)}
          onConfirm={(manualCost) => handleBuyEquipment(buyModalData, manualCost)}
        />
      )}
    </div>
  );
};

export default ItemModal;
