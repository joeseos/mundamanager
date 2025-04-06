'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import DeleteGangButton from "./delete-gang-button";
import { Weapon } from '@/types/weapon';
import { FighterProps } from '@/types/fighter';
import { Equipment } from '@/types/equipment';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StashItem } from '@/types/gang';
import { VehicleProps } from '@/types/vehicle';
import Image from 'next/image';
import { DraggableFighters } from './draggable-fighters';
import { FighterType, EquipmentOption } from '@/types/fighter-type';
import { createClient } from '@/utils/supabase/client';
import { allianceRank } from "@/utils/allianceRank";
import { gangAdditionRank } from "@/utils/gangAdditionRank";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { GiAncientRuins } from "react-icons/gi";
import { equipmentCategoryRank } from "@/utils/equipmentCategoryRank";
import { gangVariantRank } from "@/utils/gangVariantRank";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FighterEffect } from '@/types/fighter';

interface VehicleType {
  id: string;
  vehicle_type: string;
  cost: number;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots: number;
  drive_slots: number;
  engine_slots: number;
  special_rules: string[];
}

interface DefaultEquipmentItem {
  id: string;
  quantity: number;
  equipment_name?: string;
  equipment_category?: string;
}

interface WeaponsSelection {
  options: EquipmentOption[];
  default?: DefaultEquipmentItem[];
  select_type: 'single' | 'multiple' | 'optional';
}

interface EquipmentSelection {
  weapons?: WeaponsSelection;
}

interface GangProps {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type?: string;
  gang_type_image_url: string;
  credits: number | null;
  reputation: number | null;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  alignment: string;
  alliance_id: string;
  alliance_name: string;
  created_at: string | Date | null;
  last_updated: string | Date | null;
  user_id: string;
  initialFighters: FighterProps[];
  initialFighterTypes: FighterType[];
  additionalButtons?: React.ReactNode;
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
    has_meat: boolean;
    has_exploration_points: boolean;
    territories: {
      id: string;
      created_at: string;
      territory_id: string;
      territory_name: string;
      ruined: boolean | null;
      }[];
  }[];
  note?: string;
  stash: StashItem[];
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  onVehicleAdd?: (newVehicle: VehicleProps) => void;
  positioning: Record<number, string>;
  gang_variants: Array<{id: string, variant: string}> | null;
}

export default function Gang({ 
  id, 
  name: initialName, 
  gang_type_id,
  gang_type,
  gang_type_image_url,
  credits: initialCredits, 
  reputation: initialReputation,
  meat: initialMeat,
  exploration_points: initialExplorationPoints,
  rating: initialRating,
  alignment: initialAlignment,
  alliance_id: initialAllianceId,
  alliance_name: initialAllianceName,
  created_at,
  last_updated: initialLastUpdated,
  user_id,
  initialFighters = [],
  initialFighterTypes = [],
  additionalButtons,
  campaigns,
  note,
  stash,
  onStashUpdate,
  onFighterDeleted,
  onVehicleAdd,
  positioning,
  gang_variants,
}: GangProps) {
  const safeGangVariant = gang_variants ?? [];
  const { toast } = useToast();
  const [name, setName] = useState(initialName)
  const [credits, setCredits] = useState(initialCredits ?? 0)
  const [reputation, setReputation] = useState(initialReputation ?? 0)
  const [meat, setMeat] = useState(initialMeat ?? 0)
  const [explorationPoints, setExplorationPoints] = useState(initialExplorationPoints ?? 0)
  const [rating, setRating] = useState<number>(initialRating ?? 0)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(initialName)
  const [editedCredits, setEditedCredits] = useState('');
  const [editedReputation, setEditedReputation] = useState((initialReputation ?? 0).toString())
  const [editedMeat, setEditedMeat] = useState((initialMeat ?? 0).toString())
  const [editedExplorationPoints, setEditedExplorationPoints] = useState((initialExplorationPoints ?? 0).toString())
  const [fighters, setFighters] = useState<FighterProps[]>(initialFighters);
  const [selectedFighterTypeId, setSelectedFighterTypeId] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [alignment, setAlignment] = useState(initialAlignment);
  const [editedAlignment, setEditedAlignment] = useState(initialAlignment);
  const [editedAllianceId, setEditedAllianceId] = useState(initialAllianceId);
  const [editedAllianceName, setEditedAllianceName] = useState(initialAllianceName);
  const [allianceList, setAllianceList] = useState<Array<{id: string, alliance_name: string, strong_alliance: string}>>([]);
  const [allianceListLoaded, setAllianceListLoaded] = useState(false);
  const [allianceId, setAllianceId] = useState<string | null>(initialAllianceId);
  const [allianceName, setAllianceName] = useState(initialAllianceName);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddFighterModal, setShowAddFighterModal] = useState(false);
  const [fighterCost, setFighterCost] = useState('');
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehicleCost, setVehicleCost] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [positions, setPositions] = useState<Record<number, string>>(positioning);
  const [showGangAdditionsModal, setShowGangAdditionsModal] = useState(false);
  const [selectedGangAdditionTypeId, setSelectedGangAdditionTypeId] = useState('');
  const [gangAdditionCost, setGangAdditionCost] = useState('');
  const [gangAdditionTypes, setGangAdditionTypes] = useState<FighterType[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [defaultEquipmentNames, setDefaultEquipmentNames] = useState<Record<string, string>>({});
  const [selectedGangAdditionClass, setSelectedGangAdditionClass] = useState<string>('');
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>(initialFighterTypes);
  const [selectedSubTypeId, setSelectedSubTypeId] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<Array<{id: string, sub_type_name: string}>>([]);
  const [gangIsVariant, setGangIsVariant] = useState(safeGangVariant.length > 0);
  const [gangVariants, setGangVariants] = useState<Array<{id: string, variant: string}>>(safeGangVariant);
  const [editedGangIsVariant, setEditedGangIsVariant] = useState(safeGangVariant.length > 0);
  const [editedGangVariants, setEditedGangVariants] = useState<Array<{id: string, variant: string}>>(safeGangVariant);
  const [viewMode, setViewMode] = useState<'normal' | 'small' | 'medium' | 'large'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('gang_view_mode') as 'normal' | 'small' | 'medium' | 'large') ?? 'normal';
    }
    return 'normal';
  });
  const [availableVariants, setAvailableVariants] = useState<Array<{id: string, variant: string}>>([]);

  // view mode
  useEffect(() => {
    // Update main content wrapper size
    const wrapper = document.getElementById('main-content-wrapper');
    if (wrapper) {
      if (viewMode !== 'normal') {
        wrapper.classList.remove('max-w-5xl');
        wrapper.classList.add('max-w-none');
      } else {
        wrapper.classList.remove('max-w-none');
        wrapper.classList.add('max-w-5xl');
      }
    }

    // Persist view mode in localStorage
    localStorage.setItem('gang_view_mode', viewMode);
  }, [viewMode]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const fetchAlliances = async () => {
    if (allianceListLoaded) return;
    
    try {
      const response = await fetch('/api/alliances');
      if (!response.ok) throw new Error('Failed to fetch alliances');
      const data = await response.json();
      setAllianceList(data);
      setAllianceListLoaded(true);
    } catch (error) {
      console.error('Error fetching alliances:', error);
      toast({
        description: 'Failed to load alliances',
        variant: "destructive"
      });
    }
  };

const syncGangVariantsWithAlignment = (newAlignment: string) => {
  const outlaw = availableVariants.find(v => v.variant === 'Outlaw');
  const hasOutlaw = editedGangVariants.some(v => v.variant === 'Outlaw');

  if (newAlignment === 'Outlaw' && outlaw && !hasOutlaw) {
    setEditedGangVariants(prev => [...prev, outlaw]);
  } else if (newAlignment === 'Law Abiding' && hasOutlaw) {
    setEditedGangVariants(prev => prev.filter(v => v.variant !== 'Outlaw'));
  }
};

const handleAlignmentChange = (value: string) => {
  setEditedAlignment(value);
  syncGangVariantsWithAlignment(value);
};

  const handleSave = async () => {
    try {
      const creditsDifference = parseInt(editedCredits) || 0;
      const operation = creditsDifference >= 0 ? 'add' : 'subtract';

      // Optimistically update the UI before the API request completes
      const prevName = name;
      const prevCredits = credits;
      const prevAlignment = alignment;
      const prevAllianceId = allianceId;
      const prevAllianceName = allianceName;
      const prevReputation = reputation;
      const prevMeat = meat;
      const prevExplorationPoints = explorationPoints;
      const prevGangVariants = [...gangVariants];
      const prevGangIsVariant = gangIsVariant;

      // Update state optimistically
      setName(editedName);
      setCredits(prevCredits + creditsDifference);
      setAlignment(editedAlignment);
      setAllianceId(editedAllianceId === '' ? null : editedAllianceId);
      setAllianceName(allianceList.find(a => a.id === editedAllianceId)?.alliance_name || "");
      setReputation(parseInt(editedReputation));
      setMeat(parseInt(editedMeat));
      setExplorationPoints(parseInt(editedExplorationPoints));
      setGangIsVariant(editedGangIsVariant);
      setGangVariants(editedGangVariants);

      const response = await fetch(`/api/gangs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editedName,
          credits: Math.abs(creditsDifference),
          operation: operation,
          alignment: editedAlignment,
          alliance_id: editedAllianceId === '' ? null : editedAllianceId,
          reputation: parseInt(editedReputation),
          meat: parseInt(editedMeat),
          exploration_points: parseInt(editedExplorationPoints),
          gang_variants: editedGangVariants.map(v => v.id),
        }),
      });

      if (!response.ok) {
        // Revert optimistic updates if the request fails
        setName(prevName);
        setCredits(prevCredits);
        setAlignment(prevAlignment);
        setAllianceId(prevAllianceId);
        setAllianceName(prevAllianceName);
        setReputation(prevReputation);
        setMeat(prevMeat);
        setExplorationPoints(prevExplorationPoints);
        setGangIsVariant(prevGangIsVariant);
        setGangVariants(prevGangVariants);
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedGang = await response.json();
      
      // Since we've already updated the state optimistically,
      // just need to update last_updated from the response
      setLastUpdated(updatedGang.last_updated);

      toast({
        description: "Gang updated successfully",
        variant: "default"
      });

      setShowEditModal(false);
      setEditedCredits('');
      return false;
    } catch (error) {
      console.error('Error updating gang:', error);
      
      toast({
        title: "Error",
        description: "Failed to update gang. Please try again.",
        variant: "destructive"
      });

      return false;
    }
  };

  const handleFighterTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setSelectedFighterTypeId(typeId);
    setSelectedSubTypeId(''); // Reset sub-type selection
    
    if (typeId) {
      // Get all fighters with this fighter_type name to check for sub-types
      const selectedType = fighterTypes.find(t => t.id === typeId);
      const fighterTypeGroup = fighterTypes.filter(t => 
        t.fighter_type === selectedType?.fighter_type
      );
      
      // If we have multiple entries with the same fighter_type, they have sub-types
      if (fighterTypeGroup.length > 1) {
        const subTypes = fighterTypeGroup.map(ft => ({
          id: ft.id,
          sub_type_name: ft.sub_type?.sub_type_name || 'Default',
          cost: ft.total_cost
        }));
        
        setAvailableSubTypes(subTypes);
        
        // Set cost to the lowest cost option initially
        const lowestCostType = fighterTypeGroup.reduce(
          (lowest, current) => 
            current.total_cost < lowest.total_cost ? current : lowest, 
          fighterTypeGroup[0]
        );
        
        setFighterCost(lowestCostType.total_cost.toString() || '');
      } else {
        // No sub-types, just set the cost directly
        setFighterCost(selectedType?.total_cost.toString() || '');
        setAvailableSubTypes([]);
      }
    } else {
      setFighterCost('');
      setAvailableSubTypes([]);
    }
  };

  const handleSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subTypeId = e.target.value;
    setSelectedSubTypeId(subTypeId);
    
    if (subTypeId) {
      // Set the fighter type ID to match the sub-type's ID
      setSelectedFighterTypeId(subTypeId);
      
      const selectedType = fighterTypes.find(t => t.id === subTypeId);
      if (selectedType) {
        setFighterCost(selectedType.total_cost.toString() || '');
      }
    }
  };

  const handleGangAdditionClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGangAdditionClass(e.target.value);
    setSelectedGangAdditionTypeId(''); // Reset Gang Addition type when class changes
  };

  const filteredGangAdditionTypes = selectedGangAdditionClass
    ? gangAdditionTypes.filter(type => type.fighter_class === selectedGangAdditionClass)
    : gangAdditionTypes;

  const handleAddFighter = async () => {
    if (!selectedFighterTypeId || !fighterName || !fighterCost) {
      setFetchError('Please fill in all fields');
      return false;
    }

    try {
      // Get the current authenticated user's ID
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setFetchError('You must be logged in to add a fighter');
        return false;
      }
      
      const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
      const weapons = selectedType?.equipment_selection?.weapons;
      
      let equipmentIds: string[] = [];
      
      if (weapons) {
        if (weapons.default) {
          // Add all default equipment first
          weapons.default.forEach(item => {
            // Add the item multiple times based on quantity
            for (let i = 0; i < item.quantity; i++) {
              equipmentIds.push(item.id);
            }
          });
          
          // If optional equipment is selected, replace ONE instance of the first default item
          if (weapons.select_type === 'optional' && selectedEquipmentIds.length > 0) {
            // Remove only one instance of the first default item
            const firstDefaultId = weapons.default[0].id;
            const indexToRemove = equipmentIds.indexOf(firstDefaultId);
            if (indexToRemove !== -1) {
              equipmentIds.splice(indexToRemove, 1);
            }
            // Add the optional equipment
            equipmentIds.push(selectedEquipmentIds[0]);
          }
        } else if (weapons.select_type === 'single' || weapons.select_type === 'multiple') {
          equipmentIds = selectedEquipmentIds;
        }
      }

      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/add_fighter_to_gang',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            p_gang_id: id,
            p_fighter_type_id: selectedFighterTypeId,
            p_fighter_name: fighterName,
            p_cost: parseInt(fighterCost),
            p_selected_equipment_ids: equipmentIds,
            p_user_id: user.id  // Use the current user's ID from auth
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.message?.includes('Not enough credits')) {
          throw new Error('Not enough credits to add this fighter');
        }
        throw new Error('Failed to add fighter');
      }

      const data = await response.json();

      if (!data?.fighter_id) {
        throw new Error('Failed to add fighter');
      }

      const actualCost = parseInt(fighterCost);
      const newGangCredits = credits - actualCost;
      const newRating = rating + actualCost;
      setCredits(newGangCredits);
      setRating(newRating);

      const newFighter = {
        id: data.fighter_id,
        fighter_name: fighterName,
        fighter_type_id: selectedFighterTypeId,
        fighter_type: data.fighter_type,
        fighter_class: data.fighter_class,
        credits: actualCost,
        movement: data.stats.movement,
        weapon_skill: data.stats.weapon_skill,
        ballistic_skill: data.stats.ballistic_skill,
        strength: data.stats.strength,
        toughness: data.stats.toughness,
        wounds: data.stats.wounds,
        initiative: data.stats.initiative,
        attacks: data.stats.attacks,
        leadership: data.stats.leadership,
        cool: data.stats.cool,
        willpower: data.stats.willpower,
        intelligence: data.stats.intelligence,
        xp: data.stats.xp,
        kills: 0,
        weapons: data.equipment
          .filter((item: any) => item.equipment_type === 'weapon')
          .map((item: any) => ({
            weapon_name: item.equipment_name,
            weapon_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id,
            weapon_profiles: item.weapon_profiles || []
          })),
        wargear: data.equipment
          .filter((item: any) => item.equipment_type === 'wargear')
          .map((item: any) => ({
            wargear_name: item.equipment_name,
            wargear_id: item.equipment_id,
            cost: item.cost,
            fighter_weapon_id: item.fighter_equipment_id
          })),
        special_rules: data.special_rules || [],
        advancements: {
          characteristics: {},
          skills: {}
        },
        injuries: [],
        free_skill: data.free_skill || false,
        effects: {
          injuries: [] as FighterEffect[],
          advancements: [] as FighterEffect[],
          bionics: [] as FighterEffect[],
          cybernetics: [] as FighterEffect[],
          user: [] as FighterEffect[]
        },
        base_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        },
        current_stats: {
          movement: data.stats.movement,
          weapon_skill: data.stats.weapon_skill,
          ballistic_skill: data.stats.ballistic_skill,
          strength: data.stats.strength,
          toughness: data.stats.toughness,
          wounds: data.stats.wounds,
          initiative: data.stats.initiative,
          attacks: data.stats.attacks,
          leadership: data.stats.leadership,
          cool: data.stats.cool,
          willpower: data.stats.willpower,
          intelligence: data.stats.intelligence
        }
      } as FighterProps;

      setFighters(prev => [...prev, newFighter]);
      setShowGangAdditionsModal(false);
      setFighterName('');
      setSelectedGangAdditionTypeId('');
      setFighterCost('');
      setSelectedEquipmentIds([]);
      setFetchError(null);

      toast({
        description: `${fighterName} added successfully`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Error adding fighter:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to add fighter');
      return false;
    }
  };

  const handleDeleteFighter = async (fighterId: string) => {
    const fighter = fighters.find(f => f.id === fighterId);
    if (!fighter) return;

    try {
      // Optimistically update UI
      const fighterCost = fighter.credits;
      setFighters(prev => prev.filter(f => f.id !== fighterId));
      setRating(prev => prev - fighterCost);
      onFighterDeleted?.(fighterId, fighterCost);
      
      const response = await fetch(`/api/fighters/${fighterId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Revert optimistic update if the request fails
        setFighters(prev => [...prev, fighter]);
        setRating(prev => prev + fighterCost);
        throw new Error('Failed to delete fighter');
      }

      toast({
        description: "Fighter deleted successfully",
        variant: "default"
      });
    } catch (error) {
      console.error('Error deleting fighter:', error);
      toast({
        title: "Error",
        description: "Failed to delete fighter. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleEditModalOpen = async () => {
    setEditedName(name);
    setEditedCredits('');
    setEditedAlignment(alignment);
    setEditedReputation(reputation?.toString() || '0');
    setEditedMeat(meat?.toString() || '0');
    setEditedExplorationPoints(explorationPoints?.toString() || '0');
    setEditedGangIsVariant(gangIsVariant);
    setEditedGangVariants([...gangVariants]);
    
    try {
      // Fetch all available variants
      const response = await fetch('/api/gang_variant_types');
      if (!response.ok) throw new Error('Failed to fetch variants');
      const data = await response.json();
      setAvailableVariants(data);
    } catch (error) {
      console.error('Error fetching variants:', error);
      toast({
        description: 'Failed to load variants',
        variant: "destructive"
      });
    }
    
    setShowEditModal(true);
  };

  const editModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Gang Name</p>
        <Input
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          className="w-full"
          placeholder="Gang name"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Alignment</p>
        <select
          value={editedAlignment || ''}
          onChange={(e) => handleAlignmentChange(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="">Select Alignment</option>
          <option value="Law Abiding">Law Abiding</option>
          <option value="Outlaw">Outlaw</option>
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Credits</p>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedCredits}
          onChange={(e) => {
            const value = e.target.value;
            setEditedCredits(value);
          }}
          className="flex-1"
          placeholder="Enter amount (use a negative value to subtract)"
        />
        <p className="text-sm text-gray-500">
          Current credits: {credits}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reputation
        </label>
        <Input
          type="tel"
          inputMode="url"
          pattern="-?[0-9]+"
          value={editedReputation}
          onChange={(e) => setEditedReputation(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Alliance</p>
        <select
          value={editedAllianceId || ""}
          onChange={(e) => setEditedAllianceId(e.target.value)}
          onFocus={fetchAlliances}
          className="w-full p-2 border rounded-md"
        >
          {/* Default "None" option */}
          <option value="">None</option>

          {/* Display alliances after they are loaded */}
          {allianceListLoaded ? (
            Object.entries(
              allianceList
                .sort((a, b) => {
                  const rankA = allianceRank[a.alliance_name.toLowerCase()] ?? Infinity;
                  const rankB = allianceRank[b.alliance_name.toLowerCase()] ?? Infinity;
                  return rankA - rankB;
                })
                .reduce((groups, type) => {
                  const rank = allianceRank[type.alliance_name.toLowerCase()] ?? Infinity;
                  let groupLabel = "Other Alliances"; // Default category for unlisted alliances

                  if (rank <= 9) groupLabel = "Criminal Organisations";
                  else if (rank <= 19) groupLabel = "Merchant Guilds";
                  else if (rank <= 29) groupLabel = "Noble Houses";

                  if (!groups[groupLabel]) groups[groupLabel] = [];
                  groups[groupLabel].push(type);
                  return groups;
                }, {} as Record<string, typeof allianceList>)
            ).map(([groupLabel, allianceList]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {allianceList.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.alliance_name}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            <>
              {initialAllianceId && <option value={initialAllianceId}>{initialAllianceName}</option>}
              <option value="" disabled>Loading Alliances...</option>
            </>
          )}
        </select>
      </div>
      {campaigns?.[0]?.has_meat && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Meat
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedMeat}
            onChange={(e) => setEditedMeat(e.target.value)}
          />
        </div>
      )}
      {campaigns?.[0]?.has_exploration_points && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Exploration Points
          </label>
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={editedExplorationPoints}
            onChange={(e) => setEditedExplorationPoints(e.target.value)}
          />
        </div>
      )}
      <div className="mt-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="variant-toggle" className="text-sm font-medium">
            Gang Variants
          </label>
          <Switch
            id="variant-toggle"
            checked={editedGangIsVariant}
            onCheckedChange={setEditedGangIsVariant}
          />
        </div>

        {editedGangIsVariant && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {/* Unaffiliated variants */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Unaffiliated</h3>
              <div className="flex flex-col gap-2">
                {availableVariants
                  .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? Infinity) <= 9)
                  .sort((a, b) =>
                    (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                    (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                  )
                  .map((variant, index, arr) => (
                    <React.Fragment key={variant.id}>
                      {/* Insert separator before 'skirmish' */}
                      {variant.variant.toLowerCase() === "skirmish" && (
                        <div className="border-t border-gray-300" />
                      )}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`variant-${variant.id}`}
                          checked={editedGangVariants.some(v => v.id === variant.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditedGangVariants(prev => [...prev, variant]);
                            } else {
                              setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
                            }
                          }}
                        />
                        <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                          {variant.variant}
                        </label>
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>

            {/* Outlaw/Corrupted variants*/}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Outlaw / Corrupted</h3>
              <div className="flex flex-col gap-2">
                {availableVariants
                  .filter(v => (gangVariantRank[v.variant.toLowerCase()] ?? -1) >= 10)
                  .sort((a, b) =>
                    (gangVariantRank[a.variant.toLowerCase()] ?? Infinity) -
                    (gangVariantRank[b.variant.toLowerCase()] ?? Infinity)
                  )
                  .map(variant => (
                    <div key={variant.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`variant-${variant.id}`}
                        checked={editedGangVariants.some(v => v.id === variant.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditedGangVariants(prev => [...prev, variant]);
                          } else {
                            setEditedGangVariants(prev => prev.filter(v => v.id !== variant.id));
                          }
                        }}
                      />
                      <label htmlFor={`variant-${variant.id}`} className="text-sm cursor-pointer">
                        {variant.variant}
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <DeleteGangButton gangId={id} />
    </div>
  );

  const addFighterModalContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Fighter Name
        </label>
        <Input
          type="text"
          placeholder="Fighter name"
          value={fighterName}
          onChange={(e) => setFighterName(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Fighter Type
        </label>
        <select
          value={selectedFighterTypeId}
          onChange={handleFighterTypeChange}
          className="w-full p-2 border rounded"
        >
          <option value="">Select fighter type</option>
          {/* Modified dropdown options to properly handle sub-types */}
          {Array.from(new Set(fighterTypes.map(type => type.fighter_type))).map(uniqueType => {
            // Find either the selected sub-type or the lowest cost type
            const selectedSubType = selectedSubTypeId ? 
              fighterTypes.find(t => t.id === selectedSubTypeId && t.fighter_type === uniqueType) : null;
            
            // If a sub-type is selected and it's for this fighter type, show that
            if (selectedSubType) {
              return (
                <option key={selectedSubType.id} value={selectedSubType.id}>
                  {uniqueType} ({selectedSubType.fighter_class}) - {selectedSubType.total_cost} credits
                </option>
              );
            }
            
            // Otherwise show the lowest cost option for this fighter type
            const lowestCostFighter = fighterTypes
              .filter(ft => ft.fighter_type === uniqueType)
              .reduce((lowest, current) => 
                current.total_cost < lowest.total_cost ? current : lowest, 
                fighterTypes.find(ft => ft.fighter_type === uniqueType)!
              );
            
            return (
              <option key={lowestCostFighter.id} value={lowestCostFighter.id}>
                {uniqueType} ({lowestCostFighter.fighter_class}) - {lowestCostFighter.total_cost} credits
              </option>
            );
          })}
        </select>
      </div>

      {/* Conditionally show sub-type dropdown if there are available sub-types */}
      {availableSubTypes.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Fighter Sub-Type
          </label>
          <select
            value={selectedSubTypeId}
            onChange={handleSubTypeChange}
            className="w-full p-2 border rounded"
          >
            <option value="">Select fighter sub-type</option>
            {availableSubTypes.map((subType) => (
              <option key={subType.id} value={subType.id}>
                {subType.sub_type_name} - {fighterTypes.find(ft => ft.id === subType.id)?.total_cost} credits
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Cost (credits)
        </label>
        <Input
          type="number"
          value={fighterCost}
          onChange={(e) => setFighterCost(e.target.value)}
          className="w-full"
          min={0}
        />
        {selectedFighterTypeId && (
          <p className="text-sm text-gray-500">
            Base cost: {fighterTypes.find(t => t.id === selectedFighterTypeId)?.total_cost} credits
          </p>
        )}
      </div>

      {fetchError && <p className="text-red-500">{fetchError}</p>}
    </div>
  );

  const handleGangAdditionsModalOpen = async () => {
    // Only fetch if we haven't already loaded the gang addition types
    if (gangAdditionTypes.length === 0) {
      try {
        const response = await fetch(
          'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_fighter_types_with_cost',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              "p_is_gang_addition": true
            })
          }
        );

        if (!response.ok) throw new Error('Failed to fetch gang addition types');
        const data = await response.json();
        
        setGangAdditionTypes(data);
      } catch (error) {
        console.error('Error fetching gang addition types:', error);
        toast({
          description: "Failed to load gang additions",
          variant: "destructive"
        });
        return; // Don't open modal if fetch failed
      }
    }
    setShowGangAdditionsModal(true);
  };

  const renderEquipmentSelection = () => {
    const selectedType = gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId);
    if (!selectedType?.equipment_selection?.weapons) return null;

    const { weapons } = selectedType.equipment_selection;
    const isOptional = weapons.select_type === 'optional';
    const isSingle = weapons.select_type === 'single';
    
    // Group equipment options by category
    const categorizedOptions: Record<string, any[]> = {};
    
    // Check if options exists before attempting to iterate over it
    if (weapons.options && Array.isArray(weapons.options)) {
      console.log('Equipment options:', weapons.options);
      
      weapons.options.forEach(option => {
        const optionAny = option as any;
        
        // Get category name, ensure it has a value or use a default
        const categoryName = optionAny.equipment_category || inferCategoryFromEquipmentName(optionAny.equipment_name || '');
        const categoryKey = categoryName.toLowerCase();
        
        console.log(`Item: ${optionAny.equipment_name}, Category: ${categoryName}, Key: ${categoryKey}`);
        
        // Initialize category array if it doesn't exist
        if (!categorizedOptions[categoryKey]) {
          categorizedOptions[categoryKey] = [];
        }
        
        // Add option to the appropriate category
        categorizedOptions[categoryKey].push({
          ...option,
          displayCategory: categoryName  // Keep original case for display
        });
      });
    }
    
    console.log('Categorized options:', categorizedOptions);

    // Sort categories according to equipmentCategoryRank
    const sortedCategories = Object.keys(categorizedOptions).sort((a, b) => {
      const rankA = equipmentCategoryRank[a] ?? Infinity;
      const rankB = equipmentCategoryRank[b] ?? Infinity;
      return rankA - rankB;
    });
    
    console.log('Sorted categories:', sortedCategories);

    return (
      <div className="space-y-3">
        {weapons.default && weapons.default.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Default Equipment
            </label>
            <div className="space-y-1.5">
              {weapons.default.map((item, index) => {
                // Access equipment_name with type assertion for safety
                const defaultItem = item as any;
                const equipmentName = defaultItem.equipment_name || "Tunnelling claw (Ambot)";
                
                return (
                  <div key={`${item.id}-${index}`} className="flex items-center gap-2">
                    <div className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                      {item.quantity}x {equipmentName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {weapons.options && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {isOptional ? 'Optional Equipment (Replaces one default weapon)' : 'Select Equipment'}
            </label>
            
            {sortedCategories.map(category => {
              const displayCategory = categorizedOptions[category][0].displayCategory;
              
              return (
                <div key={category} className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">
                    {displayCategory}
                  </p>
                  
                  <div className="space-y-1.5">
                    {categorizedOptions[category]
                      .sort((a, b) => {
                        // Sort alphabetically within category
                        const nameA = a.equipment_name || '';
                        const nameB = b.equipment_name || '';
                        return nameA.localeCompare(nameB);
                      })
                      .map((option) => (
                        <div key={option.id} className="flex items-center gap-2">
                          <input
                            type={isSingle ? 'radio' : 'checkbox'}
                            name="equipment-selection"
                            id={option.id}
                            checked={selectedEquipmentIds.includes(option.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (isSingle || isOptional) {
                                  setSelectedEquipmentIds([option.id]);
                                } else {
                                  setSelectedEquipmentIds([...selectedEquipmentIds, option.id]);
                                }
                              } else {
                                setSelectedEquipmentIds(selectedEquipmentIds.filter(id => id !== option.id));
                              }
                            }}
                          />
                          <label htmlFor={option.id} className="text-sm">
                            {option.equipment_name || 'Loading...'}
                            {option.cost > 0 ? ` +${option.cost} credits` : ''}
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleAddFighterClick = async () => {
    if (fighterTypes.length === 0) {
      try {
        const response = await fetch(
          'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_add_fighter_details',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              "p_gang_type_id": gang_type_id
            })
          }
        );

        if (!response.ok) throw new Error('Failed to fetch fighter types');
        
        const data = await response.json();
        const processedTypes = data
          .map((type: any) => ({
            id: type.id,
            fighter_type_id: type.id,
            fighter_type: type.fighter_type,
            fighter_class: type.fighter_class,
            sub_type: type.sub_type,
            fighter_sub_type_id: type.fighter_sub_type_id,
            cost: type.cost,
            total_cost: type.total_cost,
          }))
          .sort((a: FighterType, b: FighterType) => {
            const rankA = fighterClassRank[a.fighter_class?.toLowerCase() || ""] ?? Infinity;
            const rankB = fighterClassRank[b.fighter_class?.toLowerCase() || ""] ?? Infinity;
            if (rankA !== rankB) return rankA - rankB;
            return (a.fighter_type || "").localeCompare(b.fighter_type || "");
          });

        setFighterTypes(processedTypes);
      } catch (error) {
        console.error('Error fetching fighter types:', error);
        toast({
          description: "Failed to load fighter types",
          variant: "destructive"
        });
        return; // Don't open modal if fetch failed
      }
    }
    setShowAddFighterModal(true);
  };

  const handleAddVehicleModalOpen = async () => {
    // Only fetch if we haven't already loaded the vehicle types
    if (vehicleTypes.length === 0) {
      try {
        const response = await fetch(`/api/gangs/${id}/vehicles`);
        if (!response.ok) throw new Error('Failed to fetch vehicle types');
        const data = await response.json();
        setVehicleTypes(data);
      } catch (error) {
        console.error('Error fetching vehicle types:', error);
        setVehicleError('Failed to load vehicle types');
        return; // Don't open modal if fetch failed
      }
    }
    setShowAddVehicleModal(true);
  };

  const handleAddVehicle = async () => {
    if (!selectedVehicleTypeId) {
      setVehicleError('Please select a vehicle type');
      return false;
    }

    const selectedVehicleType = vehicleTypes.find(v => v.id === selectedVehicleTypeId);
    if (!selectedVehicleType) {
      throw new Error('Vehicle type not found');
    }

    const cost = vehicleCost ? parseInt(vehicleCost) : selectedVehicleType.cost;
    const name = vehicleName || selectedVehicleType.vehicle_type;

    try {
      // Optimistically update credits
      const newCredits = credits - cost;
      setCredits(newCredits);

      const response = await fetch(`/api/gangs/${id}/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleTypeId: selectedVehicleTypeId,
          cost: cost,
          vehicleName: name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Revert credits on error
        setCredits(credits);
        throw new Error(data.error || 'Failed to add vehicle');
      }

      // After successful API response, call onVehicleAdd with the new vehicle
      if (onVehicleAdd) {
        const newVehicle: VehicleProps = {
          id: data.id,
          vehicle_name: name,
          cost: cost,
          vehicle_type: selectedVehicleType.vehicle_type,
          gang_id: id,
          fighter_id: null,
          movement: selectedVehicleType.movement,
          front: selectedVehicleType.front,
          side: selectedVehicleType.side,
          rear: selectedVehicleType.rear,
          hull_points: selectedVehicleType.hull_points,
          handling: selectedVehicleType.handling,
          save: selectedVehicleType.save,
          body_slots: selectedVehicleType.body_slots,
          body_slots_occupied: 0,
          drive_slots: selectedVehicleType.drive_slots,
          drive_slots_occupied: 0,
          engine_slots: selectedVehicleType.engine_slots,
          engine_slots_occupied: 0,
          special_rules: selectedVehicleType.special_rules || [],
          created_at: new Date().toISOString(),
          equipment: []
        };
        onVehicleAdd(newVehicle);
      }

      toast({
        description: `${name} added to gang successfully`,
        variant: "default"
      });

      setShowAddVehicleModal(false);
      setSelectedVehicleTypeId('');
      setVehicleCost('');
      setVehicleName('');
      setVehicleError(null);
      return true;
    } catch (error) {
      console.error('Error details:', error);
      setVehicleError(error instanceof Error ? error.message : 'Failed to add vehicle');
      return false;
    }
  };

  const handlePositionsUpdate = async (newPositions: Record<number, string>) => {
    try {
      console.log('Sending updated positions to API:', newPositions);
      
      const response = await fetch(`/api/gangs/${id}/positioning`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ positions: newPositions }),
      });

      if (!response.ok) {
        throw new Error('Failed to update positions');
      }

      const updatedData = await response.json();
      console.log('API response:', updatedData);
      
      // Update the positions state
      setPositions(newPositions);
      
      // Also ensure our fighters array is ordered according to the positions
      if (fighters.length > 0) {
        const orderedFighters = Object.values(newPositions).map(
          fighterId => fighters.find(f => f.id === fighterId)
        ).filter(Boolean) as FighterProps[];
        
        // Update any fighters not included in positions
        const unpositionedFighters = fighters.filter(
          f => !Object.values(newPositions).includes(f.id)
        );
        
        setFighters([...orderedFighters, ...unpositionedFighters]);
      }
    } catch (error) {
      console.error('Error updating positions:', error);
      toast({
        title: "Error",
        description: "Failed to update fighter positions",
        variant: "destructive"
      });
    }
  };

  // Add function to handle fighters reordering
  const handleFightersReorder = (newFighters: FighterProps[]) => {
    setFighters(newFighters);
  };

  const handleGangAdditionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setSelectedGangAdditionTypeId(typeId);
    setSelectedFighterTypeId(typeId);
    if (typeId) {
      const selectedType = gangAdditionTypes.find(t => t.id === typeId);
      setGangAdditionCost(selectedType?.total_cost.toString() || '');
      setFighterCost(selectedType?.total_cost.toString() || '');
    } else {
      setGangAdditionCost('');
      setFighterCost('');
    }
  };

  // Simple helper function to infer category from name when API doesn't provide it
  const inferCategoryFromEquipmentName = (name: string): string => {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('claw') || 
        lowerName.includes('baton') || 
        lowerName.includes('sword') || 
        lowerName.includes('hammer') ||
        lowerName.includes('fist') ||
        lowerName.includes('knife') ||
        lowerName.includes('blade')) {
      return 'Close Combat Weapons';
    }
    
    if (lowerName.includes('gun') || 
        lowerName.includes('pistol') || 
        lowerName.includes('shotgun') ||
        lowerName.includes('rifle') ||
        lowerName.includes('lasgun') ||
        lowerName.includes('blaster')) {
      return 'Special Weapons';
    }
    
    if (lowerName.includes('armour') || 
        lowerName.includes('armor') || 
        lowerName.includes('carapace')) {
      return 'Armour';
    }
    
    return 'Other Equipment';
  };

  return (
    <div className={`space-y-4 print:space-y-[5px] ${viewMode !== 'normal' ? 'w-full max-w-full' : ''}`}>

      <div className="print:flex space-y-4 justify-center print:justify-start print:space-y-0">
        <div id="gang_card" className="bg-white shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black">
          {/* Left Section: Illustration */}
          <div className="hidden sm:flex relative w-[200px] h-[200px] md:w-[250px] md:h-[250px] mt-1 flex-shrink-0 items-center justify-center print:hidden">
            {gang_type_image_url ? (
              <Image
                src={gang_type_image_url}
                alt={name}
                width={180}
                height={180}
                className="absolute rounded-full object-cover mt-1 z-10 w-[180px] h-auto"
                priority={false}
                quality={100}
                onError={handleImageError}
              />
            ) : (
              <div className="absolute w-[180px] h-[180px] rounded-full bg-gray-200 z-10 flex items-center justify-center">
                {name.charAt(0)}
              </div>
            )}
            <Image
              src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1736571990/cogwheel-gang-portrait-3_de5bzo.png"
              alt="Cogwheel"
              width={250}
              height={250}
              className="absolute z-20 w-[250px] h-auto"
              priority
              quality={100}
            />
          </div>

          {/* Right Section: Content */}
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">{name}</h2>
              <div className="flex gap-2">
                {/* View Mode Dropdown */}
                <div className="w-full print:hidden">
                  <select
                    id="view-mode-select"
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value as 'normal' | 'small' | 'medium' | 'large')}
                    className="w-full p-2 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black mb-4"
                  >
                    <option value="normal">Page View</option>
                    <option value="small">Small Cards</option>
                    <option value="medium">Medium Cards</option>
                    <option value="large">Large Cards</option>
                  </select>
                </div>

                <div>
                  {additionalButtons}
                  <button
                    onClick={handleEditModalOpen}
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 print:hidden"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>

            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1 text-sm">
                  Type: <Badge variant="secondary">{gang_type}</Badge>
                </div>
                {campaigns?.[0] && (
                  <div className="flex items-center gap-1 text-sm">
                    Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                      <Link href={`/campaigns/${campaigns[0].campaign_id}`} className="flex items-center">
                        {campaigns[0].campaign_name}
                      </Link>
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
                {gangVariants.length > 0 && gangIsVariant && (
                  <div className="flex items-center gap-1 text-sm">Variants:
                    {gangVariants
                      .filter((variant) => variant.variant !== 'Outlaw')
                      .map((variant) => (
                        <Badge key={variant.id} variant="secondary">
                          {variant.variant}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mt-2">
              <StatItem
                label="Alignment"
                value={alignment}
                isEditing={isEditing}
                editedValue={editedAlignment}
                onChange={handleAlignmentChange}
                type="select"
                options={['Law Abiding', 'Outlaw']}
              />
              <StatItem
                label="Reputation"
                value={reputation}
                isEditing={isEditing}
                editedValue={editedReputation}
                onChange={setEditedReputation}
              />
              <StatItem
                label="Credits"
                value={credits}
                isEditing={isEditing}
                editedValue={editedCredits}
                onChange={setEditedCredits}
              />
              <StatItem
                label="Rating"
                value={rating}
                isEditing={false}
                editedValue={typeof rating === 'number' ? rating.toString() : '0'}
                onChange={() => {}}
              />
              <StatItem
                label="Wealth"
                value={rating + credits}
                isEditing={false}
                editedValue={typeof rating === 'number' ? rating.toString() : '0'}
                onChange={() => {}}
              />
              {allianceName && (
                <StatItem
                  label="Alliance"
                  value={allianceName}
                  isEditing={isEditing}
                  editedValue={editedAllianceName}
                  onChange={setEditedAllianceName}
                />
              )}
              {campaigns?.[0]?.has_meat && (
                <StatItem
                  label="Meat"
                  value={meat}
                  isEditing={isEditing}
                  editedValue={editedMeat}
                  onChange={setEditedMeat}
                />
              )}
              {campaigns?.[0]?.has_exploration_points && (
                <StatItem
                  label="Exploration Points"
                  value={explorationPoints}
                  isEditing={isEditing}
                  editedValue={editedExplorationPoints}
                  onChange={setEditedExplorationPoints}
                />
              )}
            </div>
            <div className="mt-3 flex flex-row item-center justify-between text-xs text-gray-500">
              <span>Created: {formatDate(created_at)}</span>
              <span>Last Updated: {formatDate(lastUpdated)}</span>
            </div>
            <div className="mt-2 flex flex-wrap sm:justify-end justify-center gap-2">
              <Button
                onClick={handleAddFighterClick}
                className="bg-black text-white w-full min-w-[135px] sm:w-auto hover:bg-gray-800 print:hidden"
              >
                Add Fighter
              </Button>
              <Button
                onClick={handleAddVehicleModalOpen}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden"
              >
                Add Vehicle
              </Button>
              <Button
                onClick={handleGangAdditionsModalOpen}
                className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden"
              >
                Gang Additions
              </Button>
            </div>
          </div>

          {showEditModal && (
            <Modal
              title="Edit Gang"
              content={editModalContent}
              onClose={() => {
                setShowEditModal(false);
                setEditedCredits('');
              }}
              onConfirm={handleSave}
              confirmText="Save Changes"
            />
          )}

          {showAddFighterModal && (
            <Modal
              title="Add New Fighter"
              content={addFighterModalContent}
              onClose={() => {
                setShowAddFighterModal(false);
                // Reset all form fields
                setFighterName('');
                setSelectedFighterTypeId('');
                setSelectedSubTypeId(''); // Reset sub-type selection
                setAvailableSubTypes([]); // Clear available sub-types
                setFighterCost('');
                setFetchError(null);
              }}
              onConfirm={handleAddFighter}
              confirmText="Add Fighter"
              confirmDisabled={!selectedFighterTypeId || !fighterName || !fighterCost || 
                (availableSubTypes.length > 0 && !selectedSubTypeId)}
            />
          )}

          {showAddVehicleModal && (
            <Modal
              title="Add Vehicle"
              content={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Vehicle Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Enter vehicle name"
                      value={vehicleName}
                      onChange={(e) => setVehicleName(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Vehicle Type
                    </label>
                    <select
                      value={selectedVehicleTypeId}
                      onChange={(e) => {
                        setSelectedVehicleTypeId(e.target.value);
                        const vehicle = vehicleTypes.find(v => v.id === e.target.value);
                        if (vehicle) {
                          setVehicleCost(vehicle.cost.toString());
                        }
                      }}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select vehicle type</option>
                      {vehicleTypes.map((type: VehicleType) => (
                        <option key={type.id} value={type.id}>
                          {type.vehicle_type} - {type.cost} credits
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Cost (credits)
                    </label>
                    <Input
                      type="number"
                      value={vehicleCost}
                      onChange={(e) => setVehicleCost(e.target.value)}
                      className="w-full"
                      min={0}
                    />
                    {selectedVehicleTypeId && (
                      <p className="text-sm text-gray-500">
                        Base cost: {vehicleTypes.find(v => v.id === selectedVehicleTypeId)?.cost} credits
                      </p>
                    )}
                  </div>

                  {vehicleError && <p className="text-red-500">{vehicleError}</p>}
                </div>
              }
              onClose={() => {
                setShowAddVehicleModal(false);
                setSelectedVehicleTypeId('');
                setVehicleCost('');
                setVehicleName('');
                setVehicleError(null);
              }}
              onConfirm={handleAddVehicle}
              confirmText="Add Vehicle"
              confirmDisabled={!selectedVehicleTypeId || !vehicleName || !vehicleCost}
            />
          )}

          {showGangAdditionsModal && (
            <Modal
              title="Gang Additions"
              content={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Fighter Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Fighter name"
                      value={fighterName}
                      onChange={(e) => setFighterName(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Fighter Class
                    </label>
                    <select
                      value={selectedGangAdditionClass}
                      onChange={handleGangAdditionClassChange}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select Fighter Class</option>

                      {Object.entries(
                        Array.from(new Set(gangAdditionTypes.map(type => type.fighter_class)))
                          .sort((a, b) => {
                            const rankA = gangAdditionRank[a.toLowerCase()] ?? Infinity;
                            const rankB = gangAdditionRank[b.toLowerCase()] ?? Infinity;
                            return rankA - rankB;
                          })
                          .reduce((groups, classType) => {
                            const rank = gangAdditionRank[classType.toLowerCase()] ?? Infinity;
                            let groupLabel = "Misc."; // Default category for unlisted fighter classes

                            if (rank <= 2) groupLabel = "Hangers-on & Brutes";
                            else if (rank <= 10) groupLabel = "Vehicle Crews";
                            else if (rank <= 23) groupLabel = "Hired Guns";

                            if (!groups[groupLabel]) groups[groupLabel] = [];
                            groups[groupLabel].push(classType);
                            return groups;
                          }, {} as Record<string, string[]>)
                      ).map(([groupLabel, classList]) => (
                        <optgroup key={groupLabel} label={groupLabel}>
                          {classList.map(classType => (
                            <option key={classType} value={classType}>
                              {classType}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Fighter Type
                    </label>
                    <select
                      value={selectedGangAdditionTypeId}
                      onChange={handleGangAdditionTypeChange}
                      className="w-full p-2 border rounded"
                      disabled={!selectedGangAdditionClass}
                    >
                      <option value="">Select Fighter Type</option>

                      {Object.entries(
                        filteredGangAdditionTypes
                          .slice() // Create a shallow copy to avoid mutating the original array
                          .sort((a, b) => a.fighter_type.localeCompare(b.fighter_type)) // Alphabetical sorting within groups
                          .reduce((groups, type) => {
                            const groupLabel = type.alignment?.toLowerCase() ?? "unaligned"; // Default to "Unaligned" if null

                            if (!groups[groupLabel]) groups[groupLabel] = [];
                            groups[groupLabel].push(type);
                            return groups;
                          }, {} as Record<string, typeof filteredGangAdditionTypes>)
                      )
                        // Sort optgroup labels by predefined priority
                        .sort(([groupA], [groupB]) => {
                          const alignmentOrder: Record<string, number> = {
                            "law abiding": 1,
                            "outlaw": 2,
                            "unaligned": 3,
                          };

                          return (alignmentOrder[groupA] ?? 4) - (alignmentOrder[groupB] ?? 4);
                        })
                        .map(([groupLabel, fighterList]) => (
                          <optgroup key={groupLabel} label={groupLabel.replace(/\b\w/g, c => c.toUpperCase())}>
                            {fighterList.map(type => (
                              <option key={type.id} value={type.id}>
                                {type.limitation && type.limitation > 0 ? `0-${type.limitation} ` : ''}{type.fighter_type} ({type.total_cost} credits)
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Cost (credits)
                    </label>
                    <Input
                      type="number"
                      value={fighterCost}
                      onChange={(e) => setFighterCost(e.target.value)}
                      className="w-full"
                      min={0}
                    />
                    {selectedGangAdditionTypeId && (
                      <p className="text-sm text-gray-500">
                        Base cost: {gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId)?.total_cost} credits
                      </p>
                    )}
                  </div>

                  {renderEquipmentSelection()}

                  {fetchError && <p className="text-red-500">{fetchError}</p>}
                </div>
              }
              onClose={() => {
                setShowGangAdditionsModal(false);
                setFighterName('');
                setSelectedGangAdditionTypeId('');
                setFighterCost('');
                setSelectedEquipmentIds([]);
                setFetchError(null);
              }}
              onConfirm={handleAddFighter}
              confirmText="Add Fighter"
              confirmDisabled={!selectedGangAdditionTypeId || !fighterName || !fighterCost ||
                (gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId)
                  ?.equipment_selection?.weapons?.select_type === 'single' &&
                  !selectedEquipmentIds.length &&
                  !gangAdditionTypes.find(t => t.id === selectedGangAdditionTypeId)
                    ?.equipment_selection?.weapons?.default)}
            />
          )}
        </div>

        <div id="gang_card_additional_details" className="hidden print:block bg-white shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black truncate">
          <div className="flex-grow w-full">
            <div className="flex justify-between items-start mb-1">
              <h2 className="text-xl font-bold">Additional Details</h2>
            </div>

            <div className="text-gray-600 mb-4">
              <div className="flex flex-wrap gap-4">
                {campaigns && campaigns[0]?.territories.length > 0 && (
                  <div className="flex gap-1 items-center text-sm flex-wrap">
                    Territories:
                    {[...campaigns[0]?.territories]
                      .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                      .map((territory) => (
                        <Badge
                          key={territory.id}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary flex items-center gap-1"
                        >
                          {territory.territory_name}
                          {territory.ruined && <GiAncientRuins className="text-red-500" />}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
              {stash && stash.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center text-sm mt-2">
                  <span>Stash:</span>
                  {stash
                    .slice() // Create a shallow copy to avoid mutating the original array
                    .sort((a, b) => (a.equipment_name ?? "").localeCompare(b.equipment_name ?? "")) // Ensure values are always strings
                    .map((item) => (
                      <Badge key={item.id} variant="outline" className="cursor-pointer hover:bg-secondary">
                        {item.equipment_name} ({item.cost} credits)
                      </Badge>
                  ))}
                </div>
              )}
              {note && (
                <div className="gap-1 text-sm mt-2">
                  Notes:
                  <div className="gap-1 text-sm">
                    <span className="text-black whitespace-pre-wrap">{note}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={`print:visible ${viewMode !== 'normal' ? 'w-full flex flex-wrap gap-2 justify-center items-start px-0 print:gap-0' : ''}`}>
        {fighters.length > 0 ? (
          <DraggableFighters
            fighters={fighters}
            onPositionsUpdate={handlePositionsUpdate}
            onFightersReorder={handleFightersReorder}
            initialPositions={positions}
            viewMode={viewMode}
          />
        ) : (
          <div className="text-white italic text-center">No fighters available.</div>
        )}
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: number | string | null;
  isEditing: boolean;
  editedValue: string;
  onChange: (value: string) => void;
  type?: 'number' | 'select';
  options?: string[];
}

function StatItem({
  label,
  value,
  isEditing,
  editedValue,
  onChange,
  type = 'number',
  options = []
}: StatItemProps) {
  return (
    <div>
      <p className="text-gray-600 text-sm truncate">{label}:</p>
      {isEditing ? (
        type === 'select' ? (
          <select
            value={editedValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full p-2 border rounded text-base sm:text-lg font-semibold"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <Input
            type="number"
            value={editedValue}
            onChange={(e) => onChange(e.target.value)}
            className="text-base sm:text-lg font-semibold w-full"
          />
        )
      ) : (
        <p className="text-base sm:text-base font-semibold">
          {value != null ? value : 0}
        </p>
      )}
    </div>
  );
}
