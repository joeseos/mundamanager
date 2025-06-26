'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ImInfo } from "react-icons/im";

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
}

interface CustomWeaponProfilesProps {
  profiles: CustomWeaponProfile[];
  onProfilesChange: (profiles: CustomWeaponProfile[]) => void;
  disabled?: boolean;
}

export function CustomWeaponProfiles({ profiles, onProfilesChange, disabled = false }: CustomWeaponProfilesProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const { toast } = useToast();

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
    sort_order: profiles.length
  });

  const handleAddProfile = () => {
    const newProfile = createEmptyProfile();
    const updatedProfiles = [...profiles, newProfile];
    onProfilesChange(updatedProfiles);
    setEditingIndex(updatedProfiles.length - 1);
  };

  const handleUpdateProfile = (index: number, field: keyof CustomWeaponProfile, value: string | number) => {
    const updatedProfiles = [...profiles];
    updatedProfiles[index] = {
      ...updatedProfiles[index],
      [field]: value
    };
    onProfilesChange(updatedProfiles);
  };

  const handleDeleteProfile = (index: number) => {
    const updatedProfiles = profiles.filter((_, i) => i !== index);
    // Update sort_order for remaining profiles
    updatedProfiles.forEach((profile, i) => {
      profile.sort_order = i;
    });
    onProfilesChange(updatedProfiles);
    setEditingIndex(null);
  };

  const handleSaveProfile = (index: number) => {
    const profile = profiles[index];
    
    // Validate required fields
    if (!profile.range_short || !profile.range_long || !profile.acc_short || 
        !profile.acc_long || !profile.strength || !profile.ap || 
        !profile.damage || !profile.ammo) {
      toast({
        title: "Validation Error",
        description: "All weapon profile fields except Profile Name and Traits are required",
        variant: "destructive",
      });
      return;
    }

    setEditingIndex(null);
    toast({
      title: "Success",
      description: "Weapon profile saved",
    });
  };

  const handleCancelEdit = (index: number) => {
    if (!profiles[index].id) {
      // If this is a new profile that hasn't been saved, remove it
      handleDeleteProfile(index);
    } else {
      setEditingIndex(null);
    }
  };

  const isProfileValid = (profile: CustomWeaponProfile): boolean => {
    return !!(profile.range_short && profile.range_long && profile.acc_short && 
              profile.acc_long && profile.strength && profile.ap && 
              profile.damage && profile.ammo);
  };

  if (disabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-700">Weapon Profiles</h4>
        <Button
          type="button"
          onClick={handleAddProfile}
          variant="default"
          size="sm"
          disabled={editingIndex !== null}
        >
          Add Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No weapon profiles added yet.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center">
                <h5 className="text-sm font-medium">
                  Profile {index + 1} {profile.profile_name ? `- ${profile.profile_name}` : ''}
                </h5>
                <div className="flex gap-2">
                  {editingIndex === index ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => handleSaveProfile(index)}
                        variant="default"
                        size="sm"
                        disabled={!isProfileValid(profile)}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleCancelEdit(index)}
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={() => setEditingIndex(index)}
                        variant="outline"
                        size="sm"
                        disabled={editingIndex !== null}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleDeleteProfile(index)}
                        variant="destructive"
                        size="sm"
                        disabled={editingIndex !== null}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {editingIndex === index ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="col-span-1 md:col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Profile Name (Optional)
                      </label>
                      <div className="relative group">
                        <ImInfo />
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs p-2 rounded w-72 -left-36 z-50">
                          This name will be displayed on the fighter card next to the weapon stats. If the weapon has only one profile, it's suggested to name it the same as the weapon name. For multiple profiles, use descriptive names like "- gas shells" or "- shatter shells".
                        </div>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={profile.profile_name || ''}
                      onChange={(e) => handleUpdateProfile(index, 'profile_name', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. Single Shot, Rapid Fire"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Range (Short) *
                    </label>
                    <input
                      type="text"
                      value={profile.range_short}
                      onChange={(e) => handleUpdateProfile(index, 'range_short', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. 6"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Range (Long) *
                    </label>
                    <input
                      type="text"
                      value={profile.range_long}
                      onChange={(e) => handleUpdateProfile(index, 'range_long', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. 18"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Accuracy (Short) *
                    </label>
                    <input
                      type="text"
                      value={profile.acc_short}
                      onChange={(e) => handleUpdateProfile(index, 'acc_short', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. +1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Accuracy (Long) *
                    </label>
                    <input
                      type="text"
                      value={profile.acc_long}
                      onChange={(e) => handleUpdateProfile(index, 'acc_long', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. -1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Strength *
                    </label>
                    <input
                      type="text"
                      value={profile.strength}
                      onChange={(e) => handleUpdateProfile(index, 'strength', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. 3, S+1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      AP *
                    </label>
                    <input
                      type="text"
                      value={profile.ap}
                      onChange={(e) => handleUpdateProfile(index, 'ap', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. -1, -"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Damage *
                    </label>
                    <input
                      type="text"
                      value={profile.damage}
                      onChange={(e) => handleUpdateProfile(index, 'damage', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. 1, D3"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Ammo *
                    </label>
                    <input
                      type="text"
                      value={profile.ammo}
                      onChange={(e) => handleUpdateProfile(index, 'ammo', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. 6+, -"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Traits (Optional)
                    </label>
                    <input
                      type="text"
                      value={profile.traits || ''}
                      onChange={(e) => handleUpdateProfile(index, 'traits', e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="e.g. Rapid Fire (1), Blast (3&quot;)"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><strong>Range:</strong> {profile.range_short || '-'} / {profile.range_long || '-'}</div>
                  <div><strong>Acc:</strong> {profile.acc_short || '-'} / {profile.acc_long || '-'}</div>
                  <div><strong>Str:</strong> {profile.strength || '-'}</div>
                  <div><strong>AP:</strong> {profile.ap || '-'}</div>
                  <div><strong>Dmg:</strong> {profile.damage || '-'}</div>
                  <div><strong>Ammo:</strong> {profile.ammo || '-'}</div>
                  <div className="col-span-2 md:col-span-2"><strong>Traits:</strong> {profile.traits || 'None'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 