'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { X } from "lucide-react";

interface AdminCreateEquipmentModalProps {
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

export function AdminCreateEquipmentModal({ onClose, onSubmit }: AdminCreateEquipmentModalProps) {
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
  const [categories, setCategories] = useState<Array<{id: string, category_name: string}>>([]);
  const [weapons, setWeapons] = useState<Array<{id: string, equipment_name: string}>>([]);
  const [showAdjustedCostDialog, setShowAdjustedCostDialog] = useState(false);
  const [selectedGangType, setSelectedGangType] = useState("");
  const [adjustedCostValue, setAdjustedCostValue] = useState("");
  const [gangAdjustedCosts, setGangAdjustedCosts] = useState<GangAdjustedCost[]>([]);
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
  const [gangTypeOptions, setGangTypeOptions] = useState<Array<{gang_type_id: string, gang_type: string}>>([]);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [selectedAvailabilityGangType, setSelectedAvailabilityGangType] = useState("");
  const [availabilityValue, setAvailabilityValue] = useState("");
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/admin/equipment/categories');
        if (!response.ok) throw new Error('Failed to fetch categories');
        const data = await response.json();
        console.log('Fetched categories:', data);
        setCategories(data);
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

  useEffect(() => {
    const fetchWeapons = async () => {
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
      }
    };

    fetchWeapons();
  }, [toast]);

  // Add this useEffect to fetch gang types
  useEffect(() => {
    const fetchGangTypes = async () => {
      if (showAdjustedCostDialog || showAvailabilityDialog) {
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
        }
      }
    };

    fetchGangTypes();
  }, [showAdjustedCostDialog, showAvailabilityDialog, toast]);

  const handleProfileChange = (index: number, field: keyof WeaponProfile, value: string | number | boolean) => {
    const newProfiles = [...weaponProfiles];
    newProfiles[index] = {
      ...newProfiles[index],
      [field]: value
    };
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
    setVehicleProfiles(newProfiles);
  };

  const handleSubmit = async () => {
    if (!equipmentName || !cost || !equipmentCategory || !equipmentType) {
      toast({
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const cleanedWeaponProfiles = equipmentType === 'weapon' ? weaponProfiles.map(profile => ({
        ...profile,
        weapon_group_id: profile.weapon_group_id || null,
        range_short: profile.range_short || null,
        range_long: profile.range_long || null,
        acc_short: profile.acc_short || null,
        acc_long: profile.acc_long || null,
        strength: profile.strength || null,
        ap: profile.ap || null,
        damage: profile.damage || null,
        ammo: profile.ammo || null,
        traits: profile.traits || null
      })) : undefined;

      const cleanedVehicleProfiles = equipmentType === 'vehicle_upgrade' ? vehicleProfiles.map(profile => ({
        ...profile,
        movement: profile.movement || null,
        front: profile.front || null,
        side: profile.side || null,
        rear: profile.rear || null,
        hull_points: profile.hull_points || null,
        save: profile.save || null,
        handling: profile.handling || null,
        upgrade_type: profile.upgrade_type || null
      })) : undefined;

      const response = await fetch('/api/admin/equipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          equipment_name: equipmentName,
          trading_post_category: tradingPostCategory || null,
          availability: availability || null,
          cost: parseInt(cost),
          faction: faction || null,
          variants: variants || null,
          equipment_category_id: equipmentCategory,
          equipment_type: equipmentType,
          core_equipment: coreEquipment,
          weapon_profiles: cleanedWeaponProfiles,
          vehicle_profiles: cleanedVehicleProfiles,
          gang_adjusted_costs: gangAdjustedCosts.map(d => ({
            gang_type_id: d.gang_type_id,
            adjusted_cost: d.adjusted_cost
          })),
          equipment_availabilities: equipmentAvailabilities.map(a => ({
            gang_type_id: a.gang_type_id,
            availability: a.availability
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create equipment');
      }

      toast({
        description: "Equipment created successfully",
        variant: "default"
      });
      
      if (onSubmit) {
        onSubmit();
      }
      onClose();
    } catch (error) {
      console.error('Error creating equipment:', error);
      toast({
        description: 'Failed to create equipment',
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
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">Add Equipment</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Equipment Name *
              </label>
              <Input
                type="text"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                placeholder="E.g. Bolt pistol, Combat knife"
                className="w-full"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Equipment Category *
              </label>
              <select
                value={equipmentCategory}
                onChange={(e) => setEquipmentCategory(e.target.value)}
                className="w-full p-2 border rounded-md"
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
                  if (newType === 'vehicle_upgrade') {
                    setCoreEquipment(false);
                  }
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select equipment type</option>
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === 'vehicle_upgrade'
                      ? 'Vehicle Upgrade'
                      : type.charAt(0).toUpperCase() + type.slice(1)
                    }
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
                className="w-full"
                min="0"
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
                className="w-full"
              />
            </div>

            {equipmentType && equipmentType !== 'vehicle_upgrade' ? (
              <div className="col-span-1">
                <label className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    checked={coreEquipment}
                    onChange={(e) => setCoreEquipment(e.target.checked)}
                    className="h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Exclusive to a single Fighter
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      I.e. the 'Canine jaws' of the Hacked Cyber-mastiff (Exotic Beast).
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <div className="col-span-1"></div>
            )}

            {equipmentType && equipmentType !== 'vehicle_upgrade' && (
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
                            disabled={!selectedGangType || !adjustedCostValue || parseInt(adjustedCostValue) < 0}
                          >
                            Save Adjusted Cost
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {equipmentType && equipmentType !== 'vehicle_upgrade' && (
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
                      // Only close if clicking the backdrop (not the dialog itself)
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
                            placeholder="Enter availability (e.g. R9, C, E)"
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

            {/* Weapon Profiles Section */}
            {equipmentType === 'weapon' && (
              <div className="col-span-3 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-semibold">Weapon Profiles</h4>
                  <Button
                    onClick={addProfile}
                    variant="outline"
                    size="sm"
                  >
                    Add Profile
                  </Button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 p-4">
                  {weaponProfiles.map((profile, index) => (
                    <div key={`profile-${index}`} className="border p-4 rounded-lg space-y-4 bg-white">
                      <div className="flex justify-between items-center">
                        <h5 className="font-medium">Profile {index + 1}</h5>
                        {index > 0 && (
                          <Button
                            variant="destructive"
                            onClick={() => removeProfile(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      {/* Profile Name and Sorting */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Profile Name *
                          </label>
                          <Input
                            value={profile.profile_name}
                            onChange={(e) => handleProfileChange(index, 'profile_name', e.target.value)}
                            placeholder="e.g. Standard, Rapid Fire"
                            required
                          />
                        </div>
                        <div>
                          <label className="flex items-start space-x-2">
                            <input
                              type="checkbox"
                              checked={profile.is_default_profile}
                              onChange={(e) => handleProfileChange(index, 'is_default_profile', e.target.checked)}
                              className="h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">Default Profile</span>
                              <p className="text-sm text-gray-500 mt-1">
                                I.e. available by default with this weapon.
                              </p>
                            </div>
                          </label>
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
                        >
                          <option value="">Use This Weapon (Default)</option>
                          {weapons.map((weapon) => (
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
                            value={profile.range_short}
                            onChange={(e) => handleProfileChange(index, 'range_short', e.target.value)}
                            placeholder='e.g. 4", -'
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rng L
                          </label>
                          <Input
                            value={profile.range_long}
                            onChange={(e) => handleProfileChange(index, 'range_long', e.target.value)}
                            placeholder='e.g. 8", E'
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Acc S
                          </label>
                          <Input
                            value={profile.acc_short}
                            onChange={(e) => handleProfileChange(index, 'acc_short', e.target.value)}
                            placeholder='e.g. +1, -'
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Acc L
                          </label>
                          <Input
                            value={profile.acc_long}
                            onChange={(e) => handleProfileChange(index, 'acc_long', e.target.value)}
                            placeholder='e.g. -1, -'
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Strength
                          </label>
                          <Input
                            value={profile.strength}
                            onChange={(e) => handleProfileChange(index, 'strength', e.target.value)}
                            placeholder="e.g. 3, S+1"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            AP
                          </label>
                          <Input
                            value={profile.ap}
                            onChange={(e) => handleProfileChange(index, 'ap', e.target.value)}
                            placeholder='e.g. -1, -'
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
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Am
                          </label>
                          <Input
                            value={profile.ammo}
                            onChange={(e) => handleProfileChange(index, 'ammo', e.target.value)}
                            placeholder='e.g. 5+'
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
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-semibold">Vehicle Profile</h4>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="border p-4 rounded-lg space-y-4 bg-white">
                    <div className="grid grid-cols-2 gap-2 md:gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Profile Name
                        </label>
                        <Input
                          value={vehicleProfiles[0].profile_name}
                          onChange={(e) => handleVehicleProfileChange(0, 'profile_name', e.target.value)}
                          placeholder="e.g. Standard"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Upgrade Type
                        </label>
                        <select
                          value={vehicleProfiles[0].upgrade_type || ''}
                          onChange={(e) => handleVehicleProfileChange(0, 'upgrade_type', e.target.value)}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="">Select upgrade type</option>
                          <option value="body">Body</option>
                          <option value="drive">Drive</option>
                          <option value="engine">Engine</option>
                        </select>
                      </div>
                    </div>

                    {/* Vehicle Upgrade Effects */}
                    <div className="block text-sm font-medium text-gray-700 mb-1">
                      Adjust Characteristics
                    </div>
                    <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          M
                        </label>
                        <Input
                          value={vehicleProfiles[0].movement}
                          onChange={(e) => handleVehicleProfileChange(0, 'movement', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          T. Front
                        </label>
                        <Input
                          value={vehicleProfiles[0].front}
                          onChange={(e) => handleVehicleProfileChange(0, 'front', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          T. Side
                        </label>
                        <Input
                          value={vehicleProfiles[0].side}
                          onChange={(e) => handleVehicleProfileChange(0, 'side', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          T. Rear
                        </label>
                        <Input
                          value={vehicleProfiles[0].rear}
                          onChange={(e) => handleVehicleProfileChange(0, 'rear', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          HP
                        </label>
                        <Input
                          value={vehicleProfiles[0].hull_points}
                          onChange={(e) => handleVehicleProfileChange(0, 'hull_points', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Hnd
                        </label>
                        <Input
                          value={vehicleProfiles[0].handling}
                          onChange={(e) => handleVehicleProfileChange(0, 'handling', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sv
                        </label>
                        <Input
                          value={vehicleProfiles[0].save}
                          onChange={(e) => handleVehicleProfileChange(0, 'save', e.target.value)}
                          placeholder="e.g. 1, -1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-[10px] py-2 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!equipmentName || !cost || !availability || !equipmentCategory || !equipmentType || isLoading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Creating...' : 'Create Equipment'}
          </Button>
        </div>
      </div>
    </div>
  );
} 