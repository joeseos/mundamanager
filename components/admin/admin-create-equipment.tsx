'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AvailabilityPicker, combineAvailability } from '@/components/ui/availability-picker';
import { toast } from 'sonner';
import { WeaponProfileInput, EquipmentAvailability, GangAdjustedCost, emptyWeaponProfile } from "@/types/equipment";
import { EditionSelect, useEditions, editionSlugOf } from '@/components/edition-select';
import { hasLethalityStatline, hasTradePoints } from '@/types/edition';
import { isValidTradePoints } from '@/utils/campaigns/resources';
import { WeaponProfileFields } from '@/components/ui/weapon-profile-fields';
import { HiX } from "react-icons/hi";
import { LuTrash2 } from 'react-icons/lu'
import Modal from "@/components/ui/modal";

interface EquipmentCategory {
  id: string;
  category_name: string;
  edition_id?: string | null;
}

interface AdminCreateEquipmentModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const EQUIPMENT_TYPES = ['wargear', 'weapon', 'vehicle_upgrade'] as const;
type EquipmentType = typeof EQUIPMENT_TYPES[number];

type ScopeDialog = 'gangCost' | 'gangAvailability';

export function AdminCreateEquipmentModal({ onClose, onSubmit }: AdminCreateEquipmentModalProps) {
  const queryClient = useQueryClient();
  const [equipmentName, setEquipmentName] = useState('');
  const [availLetter, setAvailLetter] = useState<'C' | 'R' | 'E' | 'I' | 'S'>('C');
  const [availNumber, setAvailNumber] = useState(6);
  const [cost, setCost] = useState('');
  const [tradePoints, setTradePoints] = useState('0');
  const [equipmentCategory, setEquipmentCategory] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentType | ''>('');
  const [editionId, setEditionId] = useState('');
  const [coreEquipment, setCoreEquipment] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [weaponProfiles, setWeaponProfiles] = useState<WeaponProfileInput[]>([emptyWeaponProfile()]);
  const [gangAdjustedCosts, setGangAdjustedCosts] = useState<GangAdjustedCost[]>([]);
  const [equipmentAvailabilities, setEquipmentAvailabilities] = useState<EquipmentAvailability[]>([]);
  // One per-gang dialog is open at a time, so they share one draft
  const [scopeDialog, setScopeDialog] = useState<ScopeDialog | null>(null);
  const [draftGangType, setDraftGangType] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [draftAvailLetter, setDraftAvailLetter] = useState('');
  const [draftAvailNumber, setDraftAvailNumber] = useState(6);
  const [draftExclusive, setDraftExclusive] = useState(false);

  const { data: categories = [] } = useQuery<EquipmentCategory[]>({
    queryKey: ['admin-equipment-categories'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredCategories = useMemo(
    () => editionId ? categories.filter(category => category.edition_id === editionId) : categories,
    [categories, editionId]
  );

  const { data: editions = [] } = useEditions();
  const editionSlug = editionSlugOf(editions, editionId);
  const showTradePoints = hasTradePoints(editionSlug);
  const showAvailability = !showTradePoints;
  // N26 weapons are described with SR/LR/Str/AP/Lethality; N23 with Rng, Acc,
  // Str, AP, D and Am. Only the stats the selected edition uses are offered.
  const usesLethality = hasLethalityStatline(editionSlug);

  const { data: weapons = [] } = useQuery<Array<{
    id: string;
    equipment_name: string;
    edition_id?: string | null;
    equipment_type?: string;
  }>>({
    queryKey: ['admin-weapons'],
    queryFn: async () => {
      const response = await fetch('/api/admin/equipment?equipment_type=weapon');
      if (!response.ok) throw new Error('Failed to fetch weapons');
      return response.json();
    },
    enabled: equipmentType === 'weapon',
    staleTime: 5 * 60 * 1000,
  });

  const filteredWeapons = useMemo(
    () => editionId ? weapons.filter(weapon => weapon.edition_id === editionId) : weapons,
    [weapons, editionId]
  );

  const closeScopeDialog = () => {
    setScopeDialog(null);
    setDraftGangType('');
    setDraftCost('');
    setDraftAvailLetter('');
    setDraftAvailNumber(6);
    setDraftExclusive(false);
  };

  const handleEditionChange = (newEditionId: string) => {
    setEditionId(newEditionId);
    if (equipmentCategory) {
      const selected = categories.find(category => category.id === equipmentCategory);
      if (selected && newEditionId && selected.edition_id !== newEditionId) {
        setEquipmentCategory('');
      }
    }
    // Gang types are edition-scoped; clear any in-progress pick
    // and drop rows already added against another edition's gang types
    closeScopeDialog();
    if (newEditionId) {
      setGangAdjustedCosts(prev =>
        prev.filter(cost => {
          const gt = gangTypeOptions.find(g => g.id === cost.gang_type_id);
          return !gt || gt.edition_id === newEditionId;
        })
      );
    }
    // N26 uses Trade Points instead of Availability; drop stale N23 rows
    if (hasTradePoints(editionSlugOf(editions, newEditionId))) {
      setEquipmentAvailabilities([]);
    }
    // Stats the new edition does not use are no longer rendered, but anything
    // already typed would stay in state and still be submitted -- an N26 weapon
    // saved with a Damage and an Accuracy. Blank them on the way across.
    // Weapon Group parents are edition-scoped too; drop a cross-edition pick.
    const nowUsesLethality = hasLethalityStatline(editionSlugOf(editions, newEditionId));
    setWeaponProfiles(profiles => profiles.map(profile => {
      const clearedStats = nowUsesLethality
        ? { ...profile, acc_short: '', acc_long: '', damage: '', ammo: '' }
        : { ...profile, lethality: '' };
      if (profile.weapon_group_id && newEditionId) {
        const parent = weapons.find(w => w.id === profile.weapon_group_id);
        if (parent && parent.edition_id !== newEditionId) {
          return { ...clearedStats, weapon_group_id: null };
        }
      }
      return clearedStats;
    }));
  };

  const { data: gangTypeOptions = [] } = useQuery<Array<{id: string, gang_type: string, edition_id?: string | null}>>({
    queryKey: ['admin-gang-types'],
    queryFn: async () => {
      const response = await fetch('/api/admin/gang-types');
      if (!response.ok) throw new Error('Failed to fetch gang types');
      return response.json();
    },
    enabled: scopeDialog !== null,
    staleTime: 5 * 60 * 1000,
  });

  const filteredGangTypes = useMemo(
    () => editionId ? gangTypeOptions.filter(type => type.edition_id === editionId) : gangTypeOptions,
    [gangTypeOptions, editionId]
  );

  const handleProfileChange = (index: number, field: keyof WeaponProfileInput, value: string | number | boolean) => {
    setWeaponProfiles(profiles => profiles.map((profile, i) => i === index ? { ...profile, [field]: value } : profile));
  };

  const scopeSections: Array<{
    dialog: ScopeDialog;
    title: string;
    helper: string;
    chips: string[];
    onRemove: (index: number) => void;
  }> = [
    {
      dialog: 'gangCost',
      title: 'Cost per Gang',
      helper: 'Select a gang and enter the adjusted cost',
      chips: gangAdjustedCosts.map(c => `${c.gang_type} (${c.adjusted_cost} credits)`),
      onRemove: index => setGangAdjustedCosts(prev => prev.filter((_, i) => i !== index)),
    },
    {
      dialog: 'gangAvailability',
      title: 'Availability per Gang',
      helper: 'Select a gang and enter an availability value',
      chips: equipmentAvailabilities.map(a => `${a.gang_type} (${[
        a.availability ? `Availability: ${a.availability}` : null,
        a.exclusive ? 'Exclusive' : null
      ].filter(Boolean).join(', ')})`),
      onRemove: index => setEquipmentAvailabilities(prev => prev.filter((_, i) => i !== index)),
    },
  ];
  const openScopeSection = scopeSections.find(section => section.dialog === scopeDialog);

  // The Modal closes itself afterwards
  const confirmScopeDialog = () => {
    const gang = gangTypeOptions.find(g => g.id === draftGangType);
    if (!gang) return;
    if (scopeDialog === 'gangCost') {
      const adjusted_cost = parseInt(draftCost);
      if (adjusted_cost >= 0) {
        setGangAdjustedCosts(prev => [...prev, { gang_type: gang.gang_type, gang_type_id: gang.id, adjusted_cost }]);
      }
    } else {
      const availability = combineAvailability(draftAvailLetter, draftAvailNumber);
      if (availability || draftExclusive) {
        setEquipmentAvailabilities(prev => [
          ...prev,
          { gang_type: gang.gang_type, gang_type_id: gang.id, availability, exclusive: draftExclusive }
        ]);
      }
    }
  };

  const handleSubmit = async () => {
    if (!equipmentName || !cost || !equipmentCategory || !equipmentType) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (showTradePoints && !isValidTradePoints(tradePoints)) {
      toast.error("Trade Points must be a number or E");
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
        lethality: profile.lethality || null,
        ammo: profile.ammo || null,
        traits: profile.traits || null
      })) : undefined;

      const response = await fetch('/api/admin/equipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          equipment_name: equipmentName,
          // N26 has no Availability UI; column is NOT NULL so send a safe default.
          availability: showAvailability
            ? combineAvailability(availLetter, availNumber)
            : 'C',
          cost: parseInt(cost),
          trade_points: showTradePoints ? tradePoints.trim().toUpperCase() : '0',
          variants: null,
          equipment_category_id: equipmentCategory,
          equipment_type: equipmentType,
          core_equipment: coreEquipment,
          edition_id: editionId || null,
          weapon_profiles: cleanedWeaponProfiles,
          gang_adjusted_costs: gangAdjustedCosts.map(d => ({
            gang_type_id: d.gang_type_id,
            adjusted_cost: d.adjusted_cost
          })),
          equipment_availabilities: showAvailability
            ? equipmentAvailabilities.map(a => ({
                gang_type_id: a.gang_type_id,
                availability: a.availability,
                exclusive: a.exclusive
              }))
            : []
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create equipment');
      }

      toast.success("Equipment created successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-weapons'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-gang-types'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-equipment-list'] }),
      ]);

      onSubmit?.();
      onClose();
    } catch (error) {
      console.error('Error creating equipment:', error);
      toast.error('Failed to create equipment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-neutral-700/50 flex justify-center items-center z-50 px-[10px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-5xl min-h-0 max-h-svh overflow-y-auto flex flex-col">
        <div className="border-b px-[10px] py-2 flex justify-between items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground">Add Equipment</h3>
            <p className="text-sm text-muted-foreground">Fields marked with * are required.</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-[10px] py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Equipment Category *
              </label>
              <select
                value={equipmentCategory}
                onChange={(e) => setEquipmentCategory(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select category</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
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

            <EditionSelect value={editionId} onChange={handleEditionChange} defaultToCurrent />

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
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

            {showAvailability && (
              <AvailabilityPicker
                label="Availability (TP default) *"
                letter={availLetter}
                number={availNumber}
                onLetterChange={(v) => setAvailLetter(v as 'C' | 'R' | 'E' | 'I' | 'S')}
                onNumberChange={setAvailNumber}
              />
            )}

            {showTradePoints && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Trade Points *
                </label>
                <Input
                  type="text"
                  value={tradePoints}
                  onChange={(e) => setTradePoints(e.target.value)}
                  placeholder="2 or E"
                  className="w-full"
                />
              </div>
            )}

            {equipmentType && equipmentType !== 'vehicle_upgrade' ? (
              <div className="col-span-1">
                <label className="flex items-start space-x-2">
                  <Checkbox
                    checked={coreEquipment}
                    onCheckedChange={(checked) => setCoreEquipment(checked === true)}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">
                      Exclusive to a single Fighter
                    </span>
                    <p className="text-sm text-muted-foreground mt-1">
                      I.e. the &apos;Canine jaws&apos; of the Hacked Cyber-mastiff (Exotic Beast).
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <div className="col-span-1"></div>
            )}

            {equipmentType && equipmentType !== 'vehicle_upgrade' && scopeSections
              .filter(section => showAvailability || section.dialog === 'gangCost')
              .map((section) => (
                <div key={section.dialog} className="col-span-1">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    {section.title}
                  </label>
                  <Button
                    onClick={() => setScopeDialog(section.dialog)}
                    variant="outline"
                    size="sm"
                    className="mb-2"
                  >
                    Add Gang
                  </Button>

                  {section.chips.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {section.chips.map((chip, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
                        >
                          <span>{chip}</span>
                          <button
                            onClick={() => section.onRemove(index)}
                            className="hover:text-red-500 focus:outline-hidden"
                          >
                            <HiX className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {openScopeSection && (
              <Modal
                title={openScopeSection.title}
                helper={openScopeSection.helper}
                onClose={closeScopeDialog}
                onConfirm={confirmScopeDialog}
                confirmText="Save"
                confirmDisabled={
                  !draftGangType
                  || (scopeDialog === 'gangCost'
                    ? !draftCost || parseInt(draftCost) < 0
                    : !draftAvailLetter && !draftExclusive)
                }
                width="sm"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Gang Type</label>
                    <select
                      value={draftGangType}
                      onChange={(e) => {
                        if (e.target.value) setDraftGangType(e.target.value);
                      }}
                      className="w-full p-2 border rounded-md"
                    >
                      <option key="default" value="">Select a Gang Type</option>
                      {filteredGangTypes.map((gang) => (
                        <option key={gang.id} value={gang.id}>
                          {gang.gang_type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {scopeDialog === 'gangCost' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">Adjusted Cost</label>
                      <Input
                        type="number"
                        value={draftCost}
                        onChange={(e) => setDraftCost(e.target.value)}
                        placeholder="E.g. 120"
                        min="0"
                        onKeyDown={(e) => {
                          if (e.key === '-') {
                            e.preventDefault();
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <AvailabilityPicker
                        label="Availability"
                        letter={draftAvailLetter}
                        number={draftAvailNumber}
                        onLetterChange={setDraftAvailLetter}
                        onNumberChange={setDraftAvailNumber}
                        allowEmpty
                      />

                      <label className="flex items-start space-x-2">
                        <Checkbox
                          checked={draftExclusive}
                          onCheckedChange={(checked) => setDraftExclusive(checked === true)}
                          className="mt-1"
                        />
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Available only to this gang</span>
                          <p className="text-sm text-muted-foreground mt-1">
                            Limits this item&apos;s Trading Post visibility to only the gangs flagged here. Flag several gangs to make it available to each of them.
                          </p>
                        </div>
                      </label>
                    </>
                  )}
                </div>
              </Modal>
            )}

            {/* Weapon Profiles Section */}
            {equipmentType === 'weapon' && (
              <div className="col-span-3 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-semibold">Weapon Profiles</h4>
                  <Button
                    onClick={() => setWeaponProfiles(profiles => [...profiles, emptyWeaponProfile(profiles.length + 1)])}
                    variant="outline"
                    size="sm"
                  >
                    Add Profile
                  </Button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto rounded-lg border border-border p-4">
                  {weaponProfiles.map((profile, index) => (
                    <div key={`profile-${index}`} className="border p-4 rounded-lg space-y-4 bg-card">
                      <div className="flex justify-between items-center">
                        <h5 className="font-medium">Profile {index + 1}</h5>
                        {index > 0 && (
                          <Button
                            variant="destructive"
                            className="h-8 w-8 p-0"
                            onClick={() => setWeaponProfiles(profiles => profiles.filter((_, i) => i !== index))}
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Profile Name and Sorting */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
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
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Weapon Group
                        </label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Attach this profile to an existing weapon, or leave it as is to use with this weapon.
                        </p>
                        <select
                          value={profile.weapon_group_id || ''}
                          onChange={(e) => handleProfileChange(index, 'weapon_group_id', e.target.value)}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="">Use This Weapon (Default)</option>
                          {filteredWeapons.map((weapon) => (
                            <option key={weapon.id} value={weapon.id}>
                              {weapon.equipment_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Weapon Characteristics */}
                      <WeaponProfileFields
                        profile={profile}
                        index={index}
                        onChange={handleProfileChange}
                        usesLethality={usesLethality}
                      />
                      <div>
                        <div className="col-span-3">
                          <label className="block text-sm font-medium text-muted-foreground mb-1">
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
            disabled={!equipmentName || !cost || !availLetter || !equipmentCategory || !equipmentType || isLoading}
            className="bg-neutral-900 text-white rounded-sm hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create Equipment'}
          </Button>
        </div>
      </div>
    </div>
  );
} 