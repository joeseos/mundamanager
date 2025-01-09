'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface AdminEditEquipmentModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const EQUIPMENT_TYPES = ['wargear', 'weapon'] as const;
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
    is_default_profile: true
  }]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Array<{id: string, category_name: string}>>([]);

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
        // Reset form when no equipment is selected
        setEquipmentName('');
        setTradingPostCategory('');
        setAvailability('');
        setCost('');
        setFaction('');
        setVariants('');
        setEquipmentCategory('');
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
          is_default_profile: true
        }]);
        return;
      }

      try {
        const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`);
        if (!response.ok) throw new Error('Failed to fetch equipment details');
        const data = await response.json();
        
        console.log('Equipment data:', data);

        // Set all form fields from fetched data
        setEquipmentName(data.equipment_name);
        setTradingPostCategory(data.trading_post_category || '');
        setAvailability(data.availability || '');
        setCost(data.cost.toString());
        setFaction(data.faction || '');
        setVariants(data.variants || '');
        setEquipmentCategory(data.equipment_category_id);
        setEquipmentType(data.equipment_type.toLowerCase() as EquipmentType);
        setCoreEquipment(data.core_equipment);

        // Load weapon profiles if they exist
        if (data.equipment_type.toLowerCase() === 'weapon') {
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
              is_default_profile: true
            }]);
          }
        }
      } catch (error) {
        console.error('Error in fetchEquipmentDetails:', error);
        toast({
          description: 'Failed to load equipment details',
          variant: "destructive"
        });
      }
    };

    fetchEquipmentDetails();
  }, [selectedEquipmentId, toast]);

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
        is_default_profile: false
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

      const response = await fetch(`/api/admin/equipment?id=${selectedEquipmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
          weapon_profiles: equipmentType === 'weapon' ? weaponProfiles : undefined
        }),
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit Equipment</h3>
            <p className="text-sm text-gray-500">Fields marked with * are required</p>
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
            <div className="col-span-3 mb-4">
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

            <div className="col-span-3 mb-4">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Equipment Name *
              </label>
              <Input
                type="text"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                placeholder="e.g. Bolt Pistol, Combat Knife, etc."
                disabled={!selectedEquipmentId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trading Post Category
              </label>
              <Input
                type="text"
                value={tradingPostCategory}
                onChange={(e) => setTradingPostCategory(e.target.value)}
                placeholder="Enter trading post category"
                disabled={!selectedEquipmentId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Availability
              </label>
              <Input
                type="text"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="Enter availability"
                disabled={!selectedEquipmentId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost *
              </label>
              <Input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Enter cost in credits"
                disabled={!selectedEquipmentId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Faction
              </label>
              <Input
                type="text"
                value={faction}
                onChange={(e) => setFaction(e.target.value)}
                placeholder="Enter faction"
                disabled={!selectedEquipmentId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variants
              </label>
              <Input
                type="text"
                value={variants}
                onChange={(e) => setVariants(e.target.value)}
                placeholder="Enter variants"
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
                onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}
                className={`w-full p-2 border rounded-md ${!selectedEquipmentId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={!selectedEquipmentId}
              >
                <option value="">Select equipment type</option>
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3">
              <label className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  checked={coreEquipment}
                  onChange={(e) => !selectedEquipmentId && setCoreEquipment(e.target.checked)}
                  className={`h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary ${
                    !selectedEquipmentId ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                  disabled={!selectedEquipmentId}
                />
                <div className={!selectedEquipmentId ? 'opacity-50' : ''}>
                  <span className="text-sm font-medium text-gray-700">Core Equipment</span>
                  <p className="text-sm text-gray-500 mt-1">
                    When checked, this equipment will only be available as default equipment for fighters and won't appear in the trading post.
                  </p>
                </div>
              </label>
            </div>

            {equipmentType === 'weapon' && (
              <div className="col-span-3 space-y-4">
                <div className="flex justify-between items-center">
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

                <div className="space-y-4 max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 p-4">
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
                      </div>
                    </div>
                  ))}
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
            disabled={!categoryFilter || !selectedEquipmentId || !equipmentName || !cost || !equipmentCategory || !equipmentType || isLoading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isLoading ? 'Updating...' : 'Update Equipment'}
          </Button>
        </div>
      </div>
    </div>
  );
} 