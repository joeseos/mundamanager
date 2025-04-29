'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { FighterType } from "@/types/fighter";
import { X } from "lucide-react";
import { fighterClassRank } from "@/utils/fighterClassRank";

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
  is_default_profile: boolean;
  weapon_group_id?: string | null;
  sort_order: number;
}

interface VehicleProfile {
  profile_name: string;
  movement: string;
  front: string;
  side: string;
  rear: string;
  hull_points: string;
  save: string;
  upgrade_type?: string;
  handling?: string;
}

interface GangDiscount {
  gang_type: string;
  gang_type_id: string;
  discount: number;
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
  vehicle_profiles?: VehicleProfile[];
  fighter_types?: string[];
  gang_discounts?: GangDiscount[];
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
  const [isFighterTypesLoading, setIsFighterTypesLoading] = useState(false);
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
    is_default_profile: true,
    sort_order: 1
  }]);
  const [vehicleProfiles, setVehicleProfiles] = useState<VehicleProfile[]>([{
    profile_name: '',
    movement: '',
    front: '',
    side: '',
    rear: '',
    hull_points: '',
    save: '',
    upgrade_type: ''
  }]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Array<{id: string, category_name: string}>>([]);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [selectedFighterTypes, setSelectedFighterTypes] = useState<string[]>([]);
  const [weapons, setWeapons] = useState<Array<{id: string, equipment_name: string}>>([]);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [selectedGangType, setSelectedGangType] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [gangDiscounts, setGangDiscounts] = useState<GangDiscount[]>([]);
  const [gangTypeOptions, setGangTypeOptions] = useState<Array<{gang_type_id: string, gang_type: string}>>([]);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangType, setSelectedAvailabilityGangType] = useState("");
  const [availabilityValue, setAvailabilityValue] = useState("");
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);

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
          is_default_profile: true,
          sort_order: 1
        }]);
        setGangDiscounts([]);
        setEquipmentAvailabilities([]);
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

        // Set gang discounts if they exist
        if (data.gang_discounts) {
          setGangDiscounts(data.gang_discounts.map((d: any) => ({
            gang_type: d.gang_type,
            gang_type_id: d.gang_type_id,
            discount: d.discount
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

        // Load weapon profiles if they exist
        if (data.equipment_type === 'weapon') {
          console.log('Fetching weapon profiles for ID:', selectedEquipmentId);
          
          const weaponResponse = await fetch(`/api/admin/equipment/weapon-profiles?id=${selectedEquipmentId}`);
          if (!weaponResponse.ok) throw new Error('Failed to fetch weapon profiles');
          const profilesData = await weaponResponse.json();
          
          console.log('Weapon profiles data:', profilesData);
          
          if (profilesData && profilesData.length > 0) {
            console.log('Setting weapon profiles:', profilesData);
            setWeaponProfiles(profilesData);
          } else {
            console.log('No profiles found, setting default');
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
              is_default_profile: true,
              sort_order: 1
            }]);
          }
        }

        if (data.equipment_type === 'vehicle_upgrade') {
          console.log('Fetching vehicle profiles for ID:', selectedEquipmentId);
          
          const vehicleResponse = await fetch(`/api/admin/equipment/vehicle-profiles?id=${selectedEquipmentId}`);
          if (!vehicleResponse.ok) throw new Error('Failed to fetch vehicle profiles');
          const profilesData = await vehicleResponse.json();
          
          console.log('Vehicle profiles data:', profilesData);
          
          if (profilesData && profilesData.length > 0) {
            console.log('Setting vehicle profiles:', profilesData);
            // Convert all numeric values to strings
            const formattedProfiles = profilesData.map((profile: {
              profile_name: string;
              movement: number | null;
              front: number | null;
              side: number | null;
              rear: number | null;
              hull_points: number | null;
              save: number | null;
              upgrade_type?: string;
              handling?: number | null;
            }) => ({
              profile_name: profile.profile_name || '',
              movement: profile.movement?.toString() || '',
              front: profile.front?.toString() || '',
              side: profile.side?.toString() || '',
              rear: profile.rear?.toString() || '',
              hull_points: profile.hull_points?.toString() || '',
              save: profile.save?.toString() || '',
              upgrade_type: profile.upgrade_type || '',
              handling: profile.handling?.toString() || ''
            }));
            setVehicleProfiles(formattedProfiles);
          } else {
            console.log('No profiles found, setting default');
            setVehicleProfiles([{
              profile_name: '',
              movement: '',
              front: '',
              side: '',
              rear: '',
              hull_points: '',
              save: '',
              upgrade_type: '',
              handling: ''
            }]);
          }
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

  // Add this effect to fetch fighter types when equipment is selected
  useEffect(() => {
    const fetchFighterTypes = async () => {
      if (!selectedEquipmentId) {
        setFighterTypes([]);
        setSelectedFighterTypes([]);
        return;
      }

      setIsFighterTypesLoading(true); // ✅ Start loading

      try {
        // First get all fighter types for the dropdown
        const response = await fetch('/api/admin/fighter-types');
        if (!response.ok) throw new Error('Failed to fetch fighter types');
        const allTypes = await response.json();
        setFighterTypes(allTypes);

        // Then get the fighter types that have this equipment
        const defaultsResponse = await fetch(`/api/admin/fighter-types?equipment_id=${selectedEquipmentId}`);
        if (!defaultsResponse.ok) throw new Error('Failed to fetch equipment defaults');
        const defaultsData = await defaultsResponse.json();
        
        console.log('Fighter types with this equipment:', defaultsData); // Debug log
        
        // Set the selected fighter types
        if (Array.isArray(defaultsData)) {
          setSelectedFighterTypes(defaultsData.map((ft: FighterType) => ft.id));
        }
      } catch (error) {
        console.error('Error fetching fighter types:', error);
        toast({
          description: 'Failed to load fighter types',
          variant: "destructive"
        });
      } finally {
        setIsFighterTypesLoading(false); // ✅ End loading after all operations
      }
    };

    fetchFighterTypes();
  }, [selectedEquipmentId, toast]);

  // Add useEffect to fetch weapons
  useEffect(() => {
    const fetchWeapons = async () => {
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
  }, [toast]);

  // Add this useEffect to fetch gang types
  useEffect(() => {
    const fetchGangTypes = async () => {
      if (showDiscountDialog || showAvailabilityDialog) {
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
  }, [showDiscountDialog, showAvailabilityDialog, toast]);

  useEffect(() => {
    setIsLoading(
      isEquipmentDetailsLoading ||
      isFighterTypesLoading ||
      isWeaponsLoading ||
      isGangTypesLoading
    );
  }, [
    isEquipmentDetailsLoading,
    isFighterTypesLoading,
    isWeaponsLoading,
    isGangTypesLoading
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
        is_default_profile: false,
        weapon_group_id: null,
        sort_order: weaponProfiles.length + 1
      }
    ]);
  };

  const removeProfile = (index: number) => {
    setWeaponProfiles(weaponProfiles.filter((_, i) => i !== index));
  };

  const handleVehicleProfileChange = (index: number, field: keyof VehicleProfile, value: string) => {
    const newProfiles = [...vehicleProfiles];
    newProfiles[index] = {
      ...newProfiles[index],
      [field]: value
    };
    console.log('Updated vehicle profiles:', newProfiles);
    setVehicleProfiles(newProfiles);
  };

  const addVehicleProfile = () => {
    setVehicleProfiles([
      ...vehicleProfiles,
      {
        profile_name: '',
        movement: '',
        front: '',
        side: '',
        rear: '',
        hull_points: '',
        save: '',
        handling: '',
        upgrade_type: ''
      }
    ]);
  };

  const removeVehicleProfile = (index: number) => {
    setVehicleProfiles(vehicleProfiles.filter((_, i) => i !== index));
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
        ...(equipmentType === 'vehicle_upgrade' ? { 
          vehicle_profiles: vehicleProfiles.map(profile => ({
            profile_name: profile.profile_name,
            movement: profile.movement || null,
            front: profile.front || null,
            side: profile.side || null,
            rear: profile.rear || null,
            hull_points: profile.hull_points || null,
            save: profile.save || null,
            upgrade_type: profile.upgrade_type || null,
            handling: profile.handling || null
          }))
        } : {}),
        ...(hasEditedFighterTypes ? { fighter_types: selectedFighterTypes } : {}),
        gang_discounts: gangDiscounts.map(d => ({
          gang_type_id: d.gang_type_id,
          discount: d.discount
        })),
        equipment_availabilities: equipmentAvailabilities.map(a => ({
          gang_type_id: a.gang_type_id,
          availability: a.availability
        }))
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
                    onClick={() => setShowDiscountDialog(true)}
                    variant="outline"
                    size="sm"
                    className="mb-2"
                  >
                    Add Gang
                  </Button>

                  {gangDiscounts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {gangDiscounts.map((discount, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100"
                        >
                          <span>{discount.gang_type} (-{discount.discount} credits)</span>
                          <button
                            onClick={() => setGangDiscounts(prev =>
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

                  {showDiscountDialog && (
                    <div
                      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                      onClick={(e) => {
                        // Only close if clicking the backdrop (not the dialog itself)
                        if (e.target === e.currentTarget) {
                          setShowDiscountDialog(false);
                          setSelectedGangType("");
                          setDiscountValue("");
                        }
                      }}
                    >
                      <div className="bg-white p-6 rounded-lg shadow-lg w-[400px]">
                        <h3 className="text-xl font-bold mb-4">Cost per Gang</h3>
                        <p className="text-sm text-gray-500 mb-4">Select a gang and enter the discounted cost</p>

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
                            >
                              <option key="default" value="">Select a Gang Type</option>
                              {gangTypeOptions.map((gang) => (
                                <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                  {gang.gang_type}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">Discounted Cost</label>
                            <Input
                              type="number"
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value)}
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
                                setShowDiscountDialog(false);
                                setSelectedGangType("");
                                setDiscountValue("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => {
                                if (selectedGangType && discountValue) {
                                  const discount = parseInt(discountValue);
                                  if (discount >= 0) {
                                    const selectedGang = gangTypeOptions.find(g => g.gang_type_id === selectedGangType);
                                    if (selectedGang) {
                                      setGangDiscounts(prev => [
                                        ...prev,
                                        {
                                          gang_type: selectedGang.gang_type,
                                          gang_type_id: selectedGang.gang_type_id,
                                          discount
                                        }
                                      ]);
                                      setShowDiscountDialog(false);
                                      setSelectedGangType("");
                                      setDiscountValue("");
                                    }
                                  }
                                }
                              }}
                              disabled={!selectedGangType || !discountValue || parseInt(discountValue) < 0}
                            >
                              Save Discount
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
                            >
                              <option key="default" value="">Select a Gang Type</option>
                              {gangTypeOptions.map((gang) => (
                                <option key={gang.gang_type_id} value={gang.gang_type_id}>
                                  {gang.gang_type}
                                </option>
                              ))}
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
                              disabled={!selectedAvailabilityGangType || !availabilityValue}
                            >
                              Save Availability
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
                            <button
                              onClick={() => removeProfile(index)}
                              className="text-red-500 hover:text-red-700"
                              disabled={!selectedEquipmentId}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
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
                              Short Range
                            </label>
                            <Input
                              type="text"
                              value={profile.range_short}
                              onChange={(e) => handleProfileChange(index, 'range_short', e.target.value)}
                              placeholder="Enter short range"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Long Range
                            </label>
                            <Input
                              type="text"
                              value={profile.range_long}
                              onChange={(e) => handleProfileChange(index, 'range_long', e.target.value)}
                              placeholder="Enter long range"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Short Acc
                            </label>
                            <Input
                              type="text"
                              value={profile.acc_short}
                              onChange={(e) => handleProfileChange(index, 'acc_short', e.target.value)}
                              placeholder="Enter short accuracy"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Long Acc
                            </label>
                            <Input
                              type="text"
                              value={profile.acc_long}
                              onChange={(e) => handleProfileChange(index, 'acc_long', e.target.value)}
                              placeholder="Enter long accuracy"
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
                              placeholder="e.g. 1, D3, 2D6"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Ammo
                            </label>
                            <Input
                              type="text"
                              value={profile.ammo}
                              onChange={(e) => handleProfileChange(index, 'ammo', e.target.value)}
                              placeholder="Enter ammo"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

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

                          <div className="col-span-3">
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={profile.is_default_profile}
                                onChange={(e) => handleProfileChange(index, 'is_default_profile', e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                disabled={!selectedEquipmentId}
                              />
                              <span className="text-sm font-medium text-gray-700">Default Profile</span>
                            </label>
                          </div>

                          <div className="col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Weapon Group
                            </label>
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
                            <p className="text-sm text-gray-500 mt-1">
                              Select a weapon to share profiles with, or leave empty to use this weapon.
                            </p>
                          </div>

                          <div className="col-span-1 w-24">
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
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {equipmentType === 'vehicle_upgrade' && (
                <div className="col-span-3 space-y-4">
                  <div className="flex justify-between items-center sticky top-0 bg-white py-2">
                    <h4 className="text-lg font-semibold">Vehicle Profiles</h4>
                    <Button
                      onClick={addVehicleProfile}
                      variant="outline"
                      size="sm"
                      disabled={!selectedEquipmentId}
                    >
                      Add Profile
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                    {vehicleProfiles.map((profile, index) => (
                      <div key={`vehicle-profile-${index}`} className="border p-4 rounded-lg space-y-4 bg-white">
                        <div className="flex justify-between items-center">
                          <h5 className="font-medium">Profile {index + 1}</h5>
                          {index > 0 && (
                            <button
                              onClick={() => removeVehicleProfile(index)}
                              className="text-red-500 hover:text-red-700"
                              disabled={!selectedEquipmentId}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Profile Name
                            </label>
                            <Input
                              value={profile.profile_name}
                              onChange={(e) => handleVehicleProfileChange(index, 'profile_name', e.target.value)}
                              placeholder="e.g. Standard, Enhanced"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Movement
                            </label>
                            <Input
                              value={profile.movement}
                              onChange={(e) => handleVehicleProfileChange(index, 'movement', e.target.value)}
                              placeholder="Enter movement value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Front Armor
                            </label>
                            <Input
                              value={profile.front}
                              onChange={(e) => handleVehicleProfileChange(index, 'front', e.target.value)}
                              placeholder="Enter front armor value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Side Armor
                            </label>
                            <Input
                              value={profile.side}
                              onChange={(e) => handleVehicleProfileChange(index, 'side', e.target.value)}
                              placeholder="Enter side armor value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Rear Armor
                            </label>
                            <Input
                              value={profile.rear}
                              onChange={(e) => handleVehicleProfileChange(index, 'rear', e.target.value)}
                              placeholder="Enter rear armor value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Hull Points
                            </label>
                            <Input
                              value={profile.hull_points}
                              onChange={(e) => handleVehicleProfileChange(index, 'hull_points', e.target.value)}
                              placeholder="Enter hull points value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Save
                            </label>
                            <Input
                              value={profile.save}
                              onChange={(e) => handleVehicleProfileChange(index, 'save', e.target.value)}
                              placeholder="Enter save value"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Handling
                            </label>
                            <Input
                              value={profile.handling}
                              onChange={(e) => handleVehicleProfileChange(index, 'handling', e.target.value)}
                              placeholder="Enter handling modifier"
                              disabled={!selectedEquipmentId}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Upgrade Type
                            </label>
                            <select
                              value={profile.upgrade_type || ''}
                              onChange={(e) => handleVehicleProfileChange(index, 'upgrade_type', e.target.value)}
                              className="w-full p-2 border rounded-md"
                              disabled={!selectedEquipmentId}
                            >
                              <option value="">Select upgrade type</option>
                              <option value="body">Body</option>
                              <option value="drive">Drive</option>
                              <option value="engine">Engine</option>
                            </select>
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