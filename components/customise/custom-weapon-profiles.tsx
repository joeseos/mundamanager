'use client';

import { useState, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { ImInfo } from "react-icons/im";
import { HiX } from "react-icons/hi";
import { LuChevronUp, LuChevronDown } from "react-icons/lu";

export interface CustomWeaponProfile {
  id?: string;
  profile_name?: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  ap: string;
  damage: string;
  ammo: string;
  traits?: string;
  sort_order?: number;
  weapon_group_id?: string | null;
}

export interface AvailableWeapon {
  id: string;
  name: string;
  is_custom?: boolean;
  category?: string;
}

interface CustomWeaponProfilesProps {
  profiles: CustomWeaponProfile[];
  onProfilesChange: (profiles: CustomWeaponProfile[]) => void;
  disabled?: boolean;
  availableWeapons?: AvailableWeapon[];
  showTargetWeapon?: boolean;
}

interface ProfileCardProps {
  profile: CustomWeaponProfile;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (index: number, field: keyof CustomWeaponProfile, value: string | number) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

const ProfileCard = memo(({ profile, index, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }: ProfileCardProps) => {
  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex justify-between items-center">
        <h5 className="text-sm font-medium">
          Profile {index + 1} {profile.profile_name ? `- ${profile.profile_name}` : ''}
        </h5>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onMoveUp(index)}
            variant="outline"
            size="sm"
            disabled={isFirst}
            title="Move up"
          >
            <LuChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={() => onMoveDown(index)}
            variant="outline"
            size="sm"
            disabled={isLast}
            title="Move down"
          >
            <LuChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={() => onDelete(index)}
            variant="destructive"
            size="sm"
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Profile Name *
            </label>
            <div className="relative group">
              <ImInfo />
              <div className="absolute bottom-full left-0 -translate-x-1/4 mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded-sm w-72 z-50">
                This name will be displayed on the fighter card next to the weapon stats. If the weapon has only one profile, it&apos;s suggested to name it the same as the weapon name. For multiple profiles, use descriptive names like &quot;- gas shells&quot; or &quot;- shatter shells&quot;.
              </div>
            </div>
          </div>
          <input
            type="text"
            value={profile.profile_name || ''}
            onChange={(e) => onUpdate(index, 'profile_name', e.target.value)}
            className="w-full p-2 border rounded-md text-sm"
            placeholder="e.g. Single Shot, Rapid Fire"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Range (Short)
            </label>
            <input
              type="text"
              value={profile.range_short}
              onChange={(e) => onUpdate(index, 'range_short', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. 6"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Range (Long)
            </label>
            <input
              type="text"
              value={profile.range_long}
              onChange={(e) => onUpdate(index, 'range_long', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. 18"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Accuracy (Short)
            </label>
            <input
              type="text"
              value={profile.acc_short}
              onChange={(e) => onUpdate(index, 'acc_short', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. +1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Accuracy (Long)
            </label>
            <input
              type="text"
              value={profile.acc_long}
              onChange={(e) => onUpdate(index, 'acc_long', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. -1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Strength
            </label>
            <input
              type="text"
              value={profile.strength}
              onChange={(e) => onUpdate(index, 'strength', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. 3, S+1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              AP
            </label>
            <input
              type="text"
              value={profile.ap}
              onChange={(e) => onUpdate(index, 'ap', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. -1, -"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Damage
            </label>
            <input
              type="text"
              value={profile.damage}
              onChange={(e) => onUpdate(index, 'damage', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. 1, D3"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Ammo
            </label>
            <input
              type="text"
              value={profile.ammo}
              onChange={(e) => onUpdate(index, 'ammo', e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
              placeholder="e.g. 6+, -"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Traits (Optional)
          </label>
          <input
            type="text"
            value={profile.traits || ''}
            onChange={(e) => onUpdate(index, 'traits', e.target.value)}
            className="w-full p-2 border rounded-md text-sm"
            placeholder="e.g. Rapid Fire (1), Blast (3&quot;)"
          />
        </div>
      </div>
    </div>
  );
});

ProfileCard.displayName = 'ProfileCard';

export function CustomWeaponProfiles({ profiles, onProfilesChange, disabled = false, availableWeapons, showTargetWeapon = false }: CustomWeaponProfilesProps) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [storedTargetWeaponId, setStoredTargetWeaponId] = useState<string | null>(
    () => (profiles.length > 0 ? profiles[0].weapon_group_id ?? null : null)
  );

  const nextTargetWeaponId = profiles[0]?.weapon_group_id ?? null;
  if (profiles.length > 0 && nextTargetWeaponId !== storedTargetWeaponId) {
    setStoredTargetWeaponId(nextTargetWeaponId);
  }

  const targetWeaponId = profiles.length > 0 ? profiles[0].weapon_group_id ?? storedTargetWeaponId : storedTargetWeaponId;
  const targetWeapon = targetWeaponId
    ? availableWeapons?.find(w => w.id === targetWeaponId) ?? { id: targetWeaponId, name: 'Unknown weapon' }
    : null;

  const categories = availableWeapons
    ? Array.from(new Set(availableWeapons.map(w => w.category).filter(Boolean))).sort()
    : [];

  const filteredWeapons = availableWeapons?.filter(w => w.category === selectedCategory) || [];

  const handleSetTargetWeapon = (weaponId: string) => {
    if (!weaponId) return;
    setStoredTargetWeaponId(weaponId);
    if (profiles.length > 0) {
      const updated = profiles.map(p => ({ ...p, weapon_group_id: weaponId }));
      onProfilesChange(updated);
    }
    setSelectedCategory('');
  };

  const handleClearTargetWeapon = () => {
    setStoredTargetWeaponId(null);
    if (profiles.length > 0) {
      const updated = profiles.map(p => ({ ...p, weapon_group_id: null }));
      onProfilesChange(updated);
    }
  };

  const createEmptyProfile = (): CustomWeaponProfile => ({
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
    sort_order: profiles.length,
    weapon_group_id: targetWeaponId || null,
  });

  const handleAddProfile = () => {
    const newProfile = createEmptyProfile();
    const updatedProfiles = [...profiles, newProfile];
    onProfilesChange(updatedProfiles);
  };

  const handleUpdateProfile = useCallback((index: number, field: keyof CustomWeaponProfile, value: string | number) => {
    const updatedProfiles = [...profiles];
    updatedProfiles[index] = {
      ...updatedProfiles[index],
      [field]: value
    };
    onProfilesChange(updatedProfiles);
  }, [profiles, onProfilesChange]);

  const handleDeleteProfile = useCallback((index: number) => {
    const updatedProfiles = profiles.filter((_, i) => i !== index);
    updatedProfiles.forEach((profile, i) => {
      profile.sort_order = i;
    });
    onProfilesChange(updatedProfiles);
  }, [profiles, onProfilesChange]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;

    const updatedProfiles = [...profiles];
    const temp = updatedProfiles[index - 1];
    updatedProfiles[index - 1] = updatedProfiles[index];
    updatedProfiles[index] = temp;

    updatedProfiles.forEach((profile, i) => {
      profile.sort_order = i;
    });

    onProfilesChange(updatedProfiles);
  }, [profiles, onProfilesChange]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === profiles.length - 1) return;

    const updatedProfiles = [...profiles];
    const temp = updatedProfiles[index + 1];
    updatedProfiles[index + 1] = updatedProfiles[index];
    updatedProfiles[index] = temp;

    updatedProfiles.forEach((profile, i) => {
      profile.sort_order = i;
    });

    onProfilesChange(updatedProfiles);
  }, [profiles, onProfilesChange]);

  if (disabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      {showTargetWeapon && availableWeapons && availableWeapons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Target Weapon
            </label>
            <div className="relative group">
              <ImInfo />
              <div className="absolute bottom-full left-0 -translate-x-1/4 mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded-sm w-72 z-50">
                Attach all profiles to an existing weapon. Use this for ammunition — the profiles will appear under the selected weapon when both are equipped on a fighter.
              </div>
            </div>
          </div>

          {targetWeapon ? (
            <div className="flex flex-wrap gap-2 mt-1">
              <div className="bg-muted px-3 py-1 rounded-full flex items-center text-sm">
                <span>{targetWeapon.name}{targetWeapon.is_custom ? ' (Custom)' : ''}</span>
                <button
                  type="button"
                  onClick={handleClearTargetWeapon}
                  className="ml-2 text-gray-500 hover:text-muted-foreground focus:outline-hidden"
                >
                  <HiX size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 border rounded-md text-sm"
              >
                <option value="">Select a weapon category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                value=""
                onChange={(e) => handleSetTargetWeapon(e.target.value)}
                className="w-full p-2 border rounded-md text-sm"
                disabled={!selectedCategory}
              >
                <option value="">Select a weapon</option>
                {filteredWeapons.map((weapon) => (
                  <option key={weapon.id} value={weapon.id}>
                    {weapon.name}{weapon.is_custom ? ' (Custom)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-muted-foreground">Weapon Profiles</h4>
        <Button
          type="button"
          onClick={handleAddProfile}
          variant="default"
          size="sm"
        >
          Add Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No weapon profiles added yet.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile, index) => (
            <ProfileCard
              key={index}
              profile={profile}
              index={index}
              isFirst={index === 0}
              isLast={index === profiles.length - 1}
              onUpdate={handleUpdateProfile}
              onDelete={handleDeleteProfile}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}
    </div>
  );
}
