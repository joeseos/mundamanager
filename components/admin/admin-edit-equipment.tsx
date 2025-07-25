'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { FighterType } from "@/types/fighter";
import { X } from "lucide-react";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { AdminFighterEffects } from "./admin-fighter-effects";
import { AdminTradingPost } from "./admin-trading-post";

interface AdminEditEquipmentModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const EQUIPMENT_TYPES = ['wargear', 'weapon', 'vehicle_upgrade'] as const;
type EquipmentType = typeof EQUIPMENT_TYPES[number];

interface WeaponProfile {
  profile_name: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  ap: string;
  damage: string;
  ammo: string;
  traits: string;
  weapon_group_id?: string | null;
  sort_order: number;
}

interface GangAdjustedCost {
  gang_type: string;
  gang_type_id: string;
  adjusted_cost: number;
}

interface EquipmentAvailability {
  gang_type: string;
  gang_type_id: string;
  availability: string;
}

interface Equipment {
  id: string;
  equipment_name: string;
  trading_post_category: string;
  availability: string;
  cost: number;
  faction: string;
  variants: string;
  equipment_category: string;
  equipment_type: EquipmentType;
  core_equipment: boolean;
  weapon_profiles?: WeaponProfile[];
  fighter_types?: string[];
  gang_adjusted_costs?: GangAdjustedCost[];
  equipment_availabilities?: EquipmentAvailability[];
}

export function AdminEditEquipmentModal({ onClose, onSubmit }: AdminEditEquipmentModalProps) {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [equipmentName, setEquipmentName] = useState('');
  const [tradingPostCategory, setTradingPostCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [cost, setCost] = useState('');
  const [faction, setFaction] = useState('');
  const [variants, setVariants] = useState('');
  const [equipmentCategory, setEquipmentCategory] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentType | ''>('');
  const [coreEquipment, setCoreEquipment] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEquipmentDetailsLoading, setIsEquipmentDetailsLoading] = useState(false);
  const [isWeaponsLoading, setIsWeaponsLoading] = useState(false);
  const [isGangTypesLoading, setIsGangTypesLoading] = useState(false);
  const [weaponProfiles, setWeaponProfiles] = useState<WeaponProfile[]>([{
    profile_name: '',
    range_short: '',
    range_long: '',
    acc_short: '',
    acc_long: '',
    strength: '',
    ap: '',
    damage: '',
    ammo: '',
    traits: '',
    weapon_group_id: null,
    sort_order: 1
  }]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Array<{id: string, category_name: string}>>([]);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [selectedFighterTypes, setSelectedFighterTypes] = useState<string[]>([]);
  const [weapons, setWeapons] = useState<Array<{id: string, equipment_name: string}>>([]);
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [selectedGangType, setSelectedGangType] = useState("");
  const [adjustedCostValue, setAdjustedCostValue] = useState("");
  const [gangAdjustedCosts, setGangAdjustedCosts] = useState<GangAdjustedCost[]>([]);
  const [gangTypeOptions, setGangTypeOptions] = useState<Array<{gang_type_id: string, gang_type: string}>>([]);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangType, setSelectedAvailabilityGangType] = useState("");
  const [availabilityValue, setAvailabilityValue] = useState("");
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);
  const [fighterEffects, setFighterEffects] = useState<any[]>([]);
  const [fighterEffectCategories, setFighterEffectCategories] = useState<any[]>([]);
  const [selectedTradingPosts, setSelectedTradingPosts] = useState<string[]>([]);
  const [tradingPostTypes, setTradingPostTypes] = useState<Array<{id: string, trading_post_name: string}>>([]);

  const { toast } = useToast();

  // Modify equipment list fetch to only happen when category is selected
  useEffect(() => {
    const fetchEquipment = async () => {
      if (!categoryFilter) {
        setEquipmentList([]);
        return;
      }

      try {
        const response = await fetch(`/api/admin/equipment?equipment_category=${encodeURIComponent(categoryFilter)}`);
        if (!response.ok) throw new Error('Failed to fetch equipment');
        const data = await response.json();
        setEquipmentList(data);
      } catch (error) {
        console.error('Error fetching equipment:', error);
        toast({
          description: 'Failed to load equipment',
          variant: "destructive"
        });
      }
    };

    fetchEquipment();
  }, [categoryFilter, toast]);

  // Get unique categories - now needs to be a separate fetch
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/admin/equipment/categories');
        if (!response.ok) throw new Error('Failed to fetch categories');
        const data = await response.json();
        
        // Set categories directly from the response
        setCategories(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast({
          description: 'Failed to load categories',
          variant: "destructive"
        });
      }
    };

    fetchCategories();
  }, [toast]);

  // Fetch equipment details when selection changes
  useEffect(() => {
    const fetchEquipmentDetails = async () => {
      if (!selectedEquipmentId) {
        setEquipmentName('');
        setTradingPostCategory('');
        setAvailability('');
        setCost('');
        setFaction('');
        setVariants('');
        setEquipmentType('');
        setCoreEquipment(false);
        setWeaponProfiles([{
          profile_name: '',
          range_short: '',
          range_long: '',
          acc_short: '',
          acc_long: '',
          strength: '',
          ap: '',
          damage: '',
          ammo: '',
          traits: '',
          weapon_group_id: null,
          sort_order: 1
        }]);
        setGangAdjustedCosts([]);
        setEquipmentAvailabilities([]);
        setSelectedTradingPosts([]);
        return;
      }

      setIsEquipmentDetailsLoading(true); // ✅ Start loading

      try {
        const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`);
        if (!response.ok) throw new Error('Failed to fetch equipment details');
        const data = await response.json();
        
        console.log('Equipment data:', data);

        // Set all form fields from fetched data
        setEquipmentName(data.equipment_name);
        setTradingPostCategory(data.trading_post_category || '');
        setAvailability(data.availability || '');
        setCost(data.cost?.toString() || '');
        setFaction(data.faction || '');
        setVariants(data.variants || '');
        setEquipmentCategory(data.equipment_category_id);
        setEquipmentType(data.equipment_type);
        setCoreEquipment(data.core_equipment || false);

        // Set Gang adjusted cost if they exist
        if (data.gang_adjusted_costs) {
          setGangAdjustedCosts(data.gang_adjusted_costs.map((d: any) => ({
            gang_type: d.gang_type,
            gang_type_id: d.gang_type_id,
            adjusted_cost: d.adjusted_cost
          })));
        }

        // Set equipment availabilities if they exist
        if (data.equipment_availabilities) {
          setEquipmentAvailabilities(data.equipment_availabilities.map((a: any) => ({
            gang_type: a.gang_type,
            gang_type_id: a.gang_type_id,
            availability: a.availability
          })));
        }

        // Set trading post associations if they exist
        if (data.trading_post_associations) {
          setSelectedTradingPosts(data.trading_post_associations);
        }

        // Set trading post types if they exist
        if (data.trading_post_types) {
          setTradingPostTypes(data.trading_post_types);
        }

        // Set fighter effects if they exist
        if (data.fighter_effects) {
          setFighterEffects(data.fighter_effects);
        }

        // Set fighter effect categories if they exist
        if (data.fighter_effect_categories) {
          setFighterEffectCategories(data.fighter_effect_categories);
        }

        // Set fighter types if they exist
        if (data.all_fighter_types) {
          setFighterTypes(data.all_fighter_types);
        }

        // Set selected fighter types if they exist
        if (data.fighter_types_with_equipment) {
          setSelectedFighterTypes(data.fighter_types_with_equipment.map((ft: any) => ft.fighter_type_id));
        }

        // Set weapon profiles if they exist
        if (data.weapon_profiles && data.weapon_profiles.length > 0) {
          console.log('Setting weapon profiles from main API:', data.weapon_profiles);
          setWeaponProfiles(data.weapon_profiles);
        } else if (data.equipment_type === 'weapon') {
          console.log('No weapon profiles found, setting default');
          setWeaponProfiles([{
            profile_name: '',
            range_short: '',
            range_long: '',
            acc_short: '',
            acc_long: '',
            strength: '',
            ap: '',
            damage: '',
            ammo: '',
            traits: '',
            weapon_group_id: null,
            sort_order: 1
          }]);
        }
      } catch (error) {
        console.error('Error in fetchEquipmentDetails:', error);
        toast({
          description: 'Failed to load equipment details',
          variant: "destructive"
        });
      } finally {
        setIsEquipmentDetailsLoading(false); // ✅ End loading after all operations
      }
    };

    fetchEquipmentDetails();
  }, [selectedEquipmentId, toast]);

  // Add useEffect to fetch weapons - only when needed for weapon group selection
  useEffect(() => {
    const fetchWeapons = async () => {
      // Only fetch weapons if we have a selected equipment that is a weapon type
      if (!selectedEquipmentId || equipmentType !== 'weapon') {
        setWeapons([]);
        return;
      }

      setIsWeaponsLoading(true);
      try {
        const response = await fetch('/api/admin/equipment?equipment_type=weapon');
        if (!response.ok) throw new Error('Failed to fetch weapons');
        const data = await response.json();
        setWeapons(data);
      } catch (error) {
        console.error('Error fetching weapons:', error);
        toast({
          description: 'Failed to load weapons',
          variant: "destructive"
        });
      } finally {
        setIsWeaponsLoading(false);
      }
    };

    fetchWeapons();
  }, [selectedEquipmentId, equipmentType, toast]);

  // Add this useEffect to fetch gang types
  useEffect(() => {
    const fetchGangTypes = async () => {
      if (showAdjustedCostDialog || showAvailabilityDialog) {
        setIsGangTypesLoading(true);
        try {
          const response = await fetch('/api/admin/gang-types');
          if (!response.ok) throw new Error('Failed to fetch gang types');
          const data = await response.json();
          setGangTypeOptions(data);
        } catch (error) {
          console.error('Error fetching gang types:', error);
          toast({
            description: 'Failed to load gang types',
            variant: "destructive"
          });
        } finally {
          setIsGangTypesLoading(false);
        }
      }
    };

    fetchGangTypes();
  }, [showAdjustedCostDialog, showAvailabilityDialog, toast]);

  useEffect(() => {
    setIsLoading(
      isEquipmentDetailsLoading ||
      isWeaponsLoading
    );
  }, [
    isEquipmentDetailsLoading,
    isWeaponsLoading
  ]);

  const handleProfileChange = (index: number, field: keyof WeaponProfile, value: string | number | boolean) => {
    const newProfiles = [...weaponProfiles];
    newProfiles[index] = {
      ...newProfiles[index],
      [field]: value
    };
    console.log('Updated weapon profiles:', newProfiles);
    setWeaponProfiles(newProfiles);
  };

  const addProfile = () => {
    setWeaponProfiles([
      ...weaponProfiles,
      {
        profile_name: '',
        range_short: '',
        range_long: '',
        acc_short: '',
        acc_long: '',
        strength: '',
        ap: '',
        damage: '',
        ammo: '',
        traits: '',
        weapon_group_id: null,
        sort_order: weaponProfiles.length + 1
      }
    ]);
  };

  const removeProfile = (index: number) => {
    setWeaponProfiles(weaponProfiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!categoryFilter || !selectedEquipmentId || !equipmentName || !cost || !equipmentCategory || !equipmentType) {
      toast({
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // First get the category name
      const selectedCategory = categories.find(cat => cat.id === equipmentCategory);
      if (!selectedCategory) {
        throw new Error('Invalid category selected');
      }

      const hasEditedFighterTypes = selectedFighterTypes.length !== fighterTypes.filter(ft => selectedFighterTypes.includes(ft.id)).length;
      
      const requestBody = {
        equipment_name: equipmentName,
        trading_post_category: tradingPostCategory,
        availability,
        cost: parseInt(cost),
        faction,
        variants,
        equipment_category: selectedCategory.category_name,
        equipment_category_id: equipmentCategory,
        equipment_type: equipmentType,
        core_equipment: coreEquipment,
        ...(equipmentType === 'weapon' ? { 
          weapon_profiles: weaponProfiles.map(profile => ({
            ...profile,
            weapon_group_id: profile.weapon_group_id || selectedEquipmentId
          }))
        } : {}),
        ...(hasEditedFighterTypes ? { fighter_types: selectedFighterTypes } : {}),
        gang_adjusted_costs: gangAdjustedCosts.map(d => ({
          gang_type_id: d.gang_type_id,
          adjusted_cost: d.adjusted_cost
        })),
        equipment_availabilities: equipmentAvailabilities.map(a => ({
          gang_type_id: a.gang_type_id,
          availability: a.availability
        })),
        fighter_effects: fighterEffects
      };

      const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to update equipment');
      }

      // Update trading post associations
      if (selectedTradingPosts.length > 0 || selectedTradingPosts.length === 0) {
        const tradingPostResponse = await fetch('/api/admin/equipment/trading-posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            equipment_id: selectedEquipmentId,
            trading_post_ids: selectedTradingPosts
          })
        });

        if (!tradingPostResponse.ok) {
          console.error('Failed to update trading post associations');
          // Don't fail the whole operation for this
        }
      }

      toast({
        description: "Equipment updated successfully",
        variant: "default"
      });
      
      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast({
        description: 'Failed to update equipment',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-300 bg-opacity-50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">Edit Equipment</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Category *
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setSelectedEquipmentId('');
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.category_name}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 mb-4 border-b pb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Equipment to Edit *
              </label>
              <select
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                className={`w-full p-2 border rounded-md ${!categoryFilter ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={!categoryFilter}
              >
                <option value="">Select equipment</option>
                {equipmentList
                  .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
                  .map((item: Equipment) => (
                    <option key={item.id} value={item.id}>
                      {item.equipment_name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedEquipmentId && !isLoading && (
              <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Name *
                </label>
                <Input
                  type="text"
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  placeholder="E.g. Bolt pistol, Combat knife"
                  disabled={!selectedEquipmentId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Category *
                </label>
                <select
                  value={equipmentCategory}
                  onChange={(e) => setEquipmentCategory(e.target.value)}
                  className={`w-full p-2 border rounded-md ${!selectedEquipmentId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={!selectedEquipmentId}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Type *
                </label>
                <select
                  value={equipmentType}
                  onChange={(e) => {
                    const newType = e.target.value as EquipmentType;
                    setEquipmentType(newType);
                  }}
                  className={`w-full p-2 border rounded-md ${!selectedEquipmentId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={!selectedEquipmentId}
                >
                  <option value="">Select equipment type</option>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'vehicle_upgrade'
                        ? 'Vehicle Upgrade'
                        : type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost (TP default) *
                </label>
                <Input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="E.g. 130"
                  disabled={!selectedEquipmentId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Availability (TP default) *
                </label>
                <Input
                  type="text"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  placeholder="E.g. E, C, R9, I13"
                  disabled={!selectedEquipmentId}
                />
              </div>

              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-1">
                  <label className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      checked={coreEquipment}
                      onChange={(e) => setCoreEquipment(e.target.checked)}
                      className="h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Exclusive to a single Fighter</span>
                      <p className="text-sm text-gray-500 mt-1">
                        I.e. the 'Canine jaws' of the Hacked Cyber-mastiff (Exotic Beast).
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost per Gang
                  </label>
                  <Button
                    onClick={() => setShowAdjustedCostDialog(true)}
                    variant="outline"
                    size="sm"
                    className="mb-2"
                  >
                    Add Gang
                  </Button>

                  {gangAdjustedCosts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {gangAdjustedCosts.map((adjusted_cost, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                        >
                          <span>{adjusted_cost.gang_type} ({adjusted_cost.adjusted_cost} credits)</span>
                          <button
                            onClick={() => setGangAdjustedCosts(prev =>
                              prev.filter((_, i) => i !== index)
                            )}
                            className="hover:text-red-500 focus:outline-none"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showAdjustedCostDialog && (
                    <div
                      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                      onClick={(e) => {
                        // Only close if clicking the backdrop (not the dialog itself)
                        if (e.target === e.currentTarget) {
                          setShowAdjustedCostDialog(false);
                          setSelectedGangType("");
                          setAdjustedCostValue("");
                        }
                      }}
                    >
                      <div className="bg-white p-6 rounded-lg shadow-lg w-[400px]">
                        <h3 className="text-xl font-bold mb-4">Cost per Gang</h3>
                        <p className="text-sm text-gray-500 mb-4">Select a gang and enter the adjusted cost</p>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Gang Type</label>
                            <select
                              value={selectedGangType}
                              onChange={(e) => {
                                const selected = gangTypeOptions.find(g => g.gang_type_id === e.target.value);
                                if (selected) {
                                  setSelectedGangType(e.target.value);
                                }
                              }}
                              className="w-full p-2 border rounded-md"
                              disabled={isGangTypesLoading}
                            >
                              <option key="default" value="">Select a Gang Type</option>
                              {isGangTypesLoading ? (
                                <option>Loading...</option>
                              ) : (
                                gangTypeOptions.map((gang) => (
                                  <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                    {gang.gang_type}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">Adjusted Cost</label>
                            <Input
                              type="number"
                              value={adjustedCostValue}
                              onChange={(e) => setAdjustedCostValue(e.target.value)}
                              placeholder="E.g. 120"
                              min="0"
                              onKeyDown={(e) => {
                                if (e.key === '-') {
                                  e.preventDefault();
                                }
                              }}
                            />
                          </div>

                          <div className="flex gap-2 justify-end mt-6">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowAdjustedCostDialog(false);
                                setSelectedGangType("");
                                setAdjustedCostValue("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => {
                                if (selectedGangType && adjustedCostValue) {
                                  const adjusted_cost = parseInt(adjustedCostValue);
                                  if (adjusted_cost >= 0) {
                                    const selectedGang = gangTypeOptions.find(g => g.gang_type_id === selectedGangType);
                                    if (selectedGang) {
                                      setGangAdjustedCosts(prev => [
                                        ...prev,
                                        {
                                          gang_type: selectedGang.gang_type,
                                          gang_type_id: selectedGang.gang_type_id,
                                          adjusted_cost
                                        }
                                      ]);
                                      setShowAdjustedCostDialog(false);
                                      setSelectedGangType("");
                                      setAdjustedCostValue("");
                                    }
                                  }
                                }
                              }}
                              disabled={
                                isGangTypesLoading ||
                                !selectedGangType ||
                                !adjustedCostValue ||
                                parseInt(adjustedCostValue) < 0
                              }
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Availability per Gang
                  </label>
                  <Button
                    onClick={() => setShowAvailabilityDialog(true)}
                    variant="outline"
                    size="sm"
                    className="mb-2"
                  >
                    Add Gang
                  </Button>

                  {equipmentAvailabilities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {equipmentAvailabilities.map((avail, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                        >
                          <span>{avail.gang_type} (Availability: {avail.availability})</span>
                          <button
                            onClick={() => setEquipmentAvailabilities(prev =>
                              prev.filter((_, i) => i !== index)
                            )}
                            className="hover:text-red-500 focus:outline-none"
                            disabled={!selectedEquipmentId}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showAvailabilityDialog && (
                    <div
                      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          setShowAvailabilityDialog(false);
                          setSelectedAvailabilityGangType("");
                          setAvailabilityValue("");
                        }
                      }}
                    >
                      <div className="bg-white p-6 rounded-lg shadow-lg w-[400px]">
                        <h3 className="text-xl font-bold mb-4">Availability per Gang</h3>
                        <p className="text-sm text-gray-500 mb-4">Select a gang and enter an availability value</p>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Gang Type</label>
                            <select
                              value={selectedAvailabilityGangType}
                              onChange={(e) => {
                                const selected = gangTypeOptions.find(g => g.gang_type_id === e.target.value);
                                if (selected) {
                                  setSelectedAvailabilityGangType(e.target.value);
                                }
                              }}
                              className="w-full p-2 border rounded-md"
                              disabled={isGangTypesLoading}
                            >
                              <option key="default" value="">Select a Gang Type</option>
                              {isGangTypesLoading ? (
                                <option>Loading...</option>
                              ) : (
                                gangTypeOptions.map((gang) => (
                                  <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                    {gang.gang_type}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">Availability</label>
                            <Input
                              type="text"
                              value={availabilityValue}
                              onChange={(e) => setAvailabilityValue(e.target.value)}
                              placeholder="E.g. R9, C, E"
                            />
                          </div>

                          <div className="flex gap-2 justify-end mt-6">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowAvailabilityDialog(false);
                                setSelectedAvailabilityGangType("");
                                setAvailabilityValue("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => {
                                if (selectedAvailabilityGangType && availabilityValue) {
                                  const selectedGang = gangTypeOptions.find(g => g.gang_type_id === selectedAvailabilityGangType);
                                  if (selectedGang) {
                                    setEquipmentAvailabilities(prev => [
                                      ...prev,
                                      {
                                        gang_type: selectedGang.gang_type,
                                        gang_type_id: selectedGang.gang_type_id,
                                        availability: availabilityValue
                                      }
                                    ]);
                                    setShowAvailabilityDialog(false);
                                    setSelectedAvailabilityGangType("");
                                    setAvailabilityValue("");
                                  }
                                }
                              }}
                              disabled={
                                isGangTypesLoading ||
                                !selectedAvailabilityGangType ||
                                !availabilityValue
                              }
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Move Fighter Types with this Equipment to its own row */}
              {equipmentType !== 'vehicle_upgrade' && (
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fighter Types with this Equipment
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value && !selectedFighterTypes.includes(value)) {
                        setSelectedFighterTypes([...selectedFighterTypes, value]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full p-2 border rounded-md"
                    disabled={!selectedEquipmentId}
                  >
                    <option value="">Select fighter type to add</option>
                    {fighterTypes
                      .filter(ft => !selectedFighterTypes.includes(ft.id))
                      .sort((a, b) => {
                        // First sort by gang type
                        const gangCompare = a.gang_type.localeCompare(b.gang_type);
                        if (gangCompare !== 0) return gangCompare;
                        // Then by fighter class priority
                        const classCompare = (fighterClassRank[a.fighter_class?.toLowerCase() as keyof typeof fighterClassRank] || Infinity)
                          - (fighterClassRank[b.fighter_class?.toLowerCase() as keyof typeof fighterClassRank] || Infinity);
                        if (classCompare !== 0) return classCompare;
                        // Finally by fighter type name
                        return a.fighter_type.localeCompare(b.fighter_type);
                      })
                      .map((ft) => (
                        <option key={ft.id} value={ft.id}>
                          {`${ft.gang_type} - ${ft.fighter_type} (${ft.fighter_class})`}
                        </option>
                      ))}
                  </select>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFighterTypes.map((ftId) => {
                      const ft = fighterTypes.find(f => f.id === ftId);
                      if (!ft) return null;

                      return (
                        <div
                          key={ft.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                        >
                          <span>{`${ft.gang_type} - ${ft.fighter_type}`}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedFighterTypes(selectedFighterTypes.filter(id => id !== ft.id))}
                            className="hover:text-red-500 focus:outline-none"
                            disabled={!selectedEquipmentId}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Trading Post Section - Add this above Fighter Effects */}
              {selectedEquipmentId && (
                <AdminTradingPost
                  equipmentId={selectedEquipmentId}
                  selectedTradingPosts={selectedTradingPosts}
                  setSelectedTradingPosts={setSelectedTradingPosts}
                  tradingPostTypes={tradingPostTypes}
                  disabled={!selectedEquipmentId}
                />
              )}

              {/* Fighter Effects Section */}
              {selectedEquipmentId && (
                <div className="col-span-3">
                  <AdminFighterEffects 
                    equipmentId={selectedEquipmentId}
                    fighterEffects={fighterEffects}
                    fighterEffectCategories={fighterEffectCategories}
                    onUpdate={() => {
                      // No toast needed as effects show directly in UI
                    }}
                    onChange={(effects) => {
                      console.log('Fighter effects changed:', effects);
                      setFighterEffects(effects);
                    }}
                  />
                </div>
              )}

              {/* Weapon Profiles Section */}
              {equipmentType === 'weapon' && (
                <div className="col-span-3 space-y-4">
                  <div className="flex justify-between items-center sticky top-0 bg-white py-2">
                    <h4 className="text-lg font-semibold">Weapon Profiles</h4>
                    <Button
                      onClick={addProfile}
                      variant="outline"
                      size="sm"
                      disabled={!selectedEquipmentId}
                    >
                      Add Profile
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                    {weaponProfiles.map((profile, index) => (
                      <div key={`profile-${index}`} className="border p-4 rounded-lg space-y-4 bg-white">
                        <div className="flex justify-between items-center">
                          <h5 className="font-medium">Profile {index + 1}</h5>
                          {index > 0 && (
                            <Button
                              variant="destructive"
                              onClick={() => removeProfile(index)}
                              disabled={!selectedEquipmentId}
                            >
                              Remove
                            </Button>
                          )}
                        </div>

                        {/* Profile Name and Sorting */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Profile Name
                            </label>
                            <Input
                              value={profile.profile_name}
                              onChange={(e) => handleProfileChange(index, 'profile_name', e.target.value)}
                              placeholder="e.g. Standard, Rapid Fire"
                              disabled={!selectedEquipmentId}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Sort Order
                            </label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={profile.sort_order || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                handleProfileChange(index, 'sort_order', parseInt(value) || 0);
                              }}
                              placeholder="#"
                              disabled={!selectedEquipmentId}
                            />
                          </div>
                        </div>

                        {/* Weapon Group */}
                        <div className="col-span-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Weapon Group
                          </label>
                          <p className="text-sm text-gray-500 mt-1">
                            Attach this profile to an existing weapon, or leave it as is to use with this weapon.
                          </p>
                          <select
                            value={profile.weapon_group_id || ''}
                            onChange={(e) => handleProfileChange(index, 'weapon_group_id', e.target.value)}
                            className="w-full p-2 border rounded-md"
                            disabled={!selectedEquipmentId}
                          >
                            <option value="">Use This Weapon (Default)</option>
                            {weapons
                              .filter(w => w.id !== selectedEquipmentId)
                              .map((weapon) => (
                                <option key={weapon.id} value={weapon.id}>
                                  {weapon.equipment_name}
                                </option>
                            ))}
                          </select>
                        </div>

                        {/* Weapon Characteristics */}
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Rng S
                            </label>
                            <Input
                              type="text"
                              value={profile.range_short}
                              onChange={(e) => handleProfileChange(index, 'range_short', e.target.value)}
                              placeholder='e.g. 4", -'
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Rng L
                            </label>
                            <Input
                              type="text"
                              value={profile.range_long}
                              onChange={(e) => handleProfileChange(index, 'range_long', e.target.value)}
                              placeholder='e.g. 8", E'
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Acc S
                            </label>
                            <Input
                              type="text"
                              value={profile.acc_short}
                              onChange={(e) => handleProfileChange(index, 'acc_short', e.target.value)}
                              placeholder='e.g. +1, -'
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Acc L
                            </label>
                            <Input
                              type="text"
                              value={profile.acc_long}
                              onChange={(e) => handleProfileChange(index, 'acc_long', e.target.value)}
                              placeholder='e.g. -1, -'
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Strength
                            </label>
                            <Input
                              type="text"
                              value={profile.strength}
                              onChange={(e) => handleProfileChange(index, 'strength', e.target.value)}
                              placeholder="e.g. 3, S+1"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              AP
                            </label>
                            <Input
                              type="text"
                              value={profile.ap}
                              onChange={(e) => handleProfileChange(index, 'ap', e.target.value)}
                              placeholder="e.g. -1, -"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Damage
                            </label>
                            <Input
                              type="text"
                              value={profile.damage}
                              onChange={(e) => handleProfileChange(index, 'damage', e.target.value)}
                              placeholder="e.g. 1, D3"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Am
                            </label>
                            <Input
                              type="text"
                              value={profile.ammo}
                              onChange={(e) => handleProfileChange(index, 'ammo', e.target.value)}
                              placeholder='e.g. 5+'
                              disabled={!selectedEquipmentId}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Traits
                            </label>
                            <Input
                              value={profile.traits}
                              onChange={(e) => handleProfileChange(index, 'traits', e.target.value)}
                              placeholder="Comma-separated list of traits"
                              disabled={!selectedEquipmentId}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2 bg-white rounded-b-lg">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!categoryFilter || !selectedEquipmentId || !equipmentName || !cost || !availability || !equipmentCategory || !equipmentType || isLoading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Updating...' : 'Update Equipment'}
          </Button>
        </div>
      </div>
    </div>
  );
} 