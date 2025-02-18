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
  created_at: string | Date | null;
  last_updated: string | Date | null;
  user_id: string;
  initialFighters: FighterProps[];
  fighterTypes: FighterType[];
  additionalButtons?: React.ReactNode;
  campaigns?: {
    campaign_id: string;
    campaign_name: string;
    role: string | null;
    status: string | null;
    has_meat: boolean;
    has_exploration_points: boolean;
  }[];
  stash: StashItem[];
  onStashUpdate?: (newStash: StashItem[]) => void;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  onVehicleAdd?: (newVehicle: VehicleProps) => void;
  positioning: Record<number, string>;
}

interface FighterType {
  id: string;
  fighter_type: string;
  cost: number;
  total_cost: number;
  fighter_class: string;
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
  created_at, 
  last_updated: initialLastUpdated,
  user_id,
  initialFighters = [],
  fighterTypes,
  additionalButtons,
  campaigns,
  stash,
  onStashUpdate,
  onFighterDeleted,
  onVehicleAdd,
  positioning,
}: GangProps) {
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

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const handleSave = async () => {
    try {
      const creditsDifference = parseInt(editedCredits) || 0;
      const operation = creditsDifference >= 0 ? 'add' : 'subtract';

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
          reputation: parseInt(editedReputation),
          meat: parseInt(editedMeat),
          exploration_points: parseInt(editedExplorationPoints)
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedGang = await response.json();
      
      setName(updatedGang.name);
      setCredits(updatedGang.credits);
      setAlignment(updatedGang.alignment);
      setReputation(updatedGang.reputation);
      setMeat(updatedGang.meat);
      setExplorationPoints(updatedGang.exploration_points);
      setLastUpdated(updatedGang.last_updated);

      toast({
        description: "Gang updated successfully",
        variant: "default"
      });

      setShowEditModal(false);
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
    if (typeId) {
      const selectedType = fighterTypes.find(t => t.id === typeId);
      setFighterCost(selectedType?.total_cost.toString() || '');
    } else {
      setFighterCost('');
    }
  };

  const handleAddFighter = async () => {
    if (!selectedFighterTypeId || !fighterName || !fighterCost) {
      setFetchError('Please fill in all fields');
      return false;
    }

    try {
      let isMounted = true;

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
            p_cost: parseInt(fighterCost)
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.message?.includes('Not enough credits')) {
          throw new Error('Not enough credits to add this fighter');
        }
      }

      const data = await response.json();

      if (!data?.fighter_id) {
        throw new Error('Not enough credits to add this fighter');
      }

      if (isMounted) {
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
          injuries: [],
          special_rules: data.special_rules || [],
          advancements: {
            characteristics: {},
            skills: {}
          },
          free_skill: data.free_skill
        };

        const newPositions = { ...positions };
        const maxPosition = Math.max(...Object.keys(positions).map(Number), -1);
        newPositions[maxPosition + 1] = data.fighter_id;
        setPositions(newPositions);

        await fetch(`/api/gangs/${id}/positioning`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ positions: newPositions }),
        });

        setFighters(prev => [...prev, newFighter]);
        setShowAddFighterModal(false);
        setSelectedFighterTypeId('');
        setFighterName('');
        setFighterCost('');
        setFetchError(null);

        toast({
          description: "Fighter added successfully",
          variant: "default"
        });

        return true;
      }
      return false;
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

  const handleEditModalOpen = () => {
    setEditedName(name);
    setEditedCredits('');
    setEditedAlignment(alignment);
    setEditedReputation(reputation?.toString() || '0');
    setEditedMeat(meat?.toString() || '0');
    setEditedExplorationPoints(explorationPoints?.toString() || '0');
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
          onChange={(e) => setEditedAlignment(e.target.value)}
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
          type="number"
          value={editedCredits}
          onChange={(e) => {
            const value = e.target.value;
            setEditedCredits(value);
          }}
          className="flex-1"
          placeholder="Enter amount (negative to subtract)"
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
          type="number"
          value={editedReputation}
          onChange={(e) => setEditedReputation(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Meat
        </label>
        <Input
          type="number"
          value={editedMeat}
          onChange={(e) => setEditedMeat(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Exploration Points
        </label>
        <Input
          type="number"
          value={editedExplorationPoints}
          onChange={(e) => setEditedExplorationPoints(e.target.value)}
        />
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
          {fighterTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.fighter_type} ({type.fighter_class}) - {type.total_cost} credits
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

  useEffect(() => {
    const fetchVehicleTypes = async () => {
      try {
        const response = await fetch(`/api/gangs/${id}/vehicles`);
        if (!response.ok) throw new Error('Failed to fetch vehicle types');
        const data = await response.json();
        setVehicleTypes(data);
      } catch (error) {
        console.error('Error fetching vehicle types:', error);
        setVehicleError('Failed to load vehicle types');
      }
    };

    fetchVehicleTypes();
  }, [id]);

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

      setPositions(newPositions);
    } catch (error) {
      console.error('Error updating positions:', error);
      toast({
        title: "Error",
        description: "Failed to update fighter positions",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4 print:space-y-[5px]">
      <div className="bg-white shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black">
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
        
          <div className="text-gray-600 mb-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                Type: <Badge variant="secondary">{gang_type}</Badge>
              </div>
              {campaigns?.[0] && (
                <div className="flex items-center gap-2">
                  Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                    <Link href={`/campaigns/${campaigns[0].campaign_id}`} className="flex items-center">
                      {campaigns[0].campaign_name}
                    </Link>
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mt-2">
            <StatItem
              label="Credits"
              value={credits}
              isEditing={isEditing}
              editedValue={editedCredits}
              onChange={setEditedCredits}
            />
            <StatItem
              label="Alignment"
              value={alignment}
              isEditing={isEditing}
              editedValue={editedAlignment}
              onChange={setEditedAlignment}
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
            <StatItem
              label="Rating"
              value={rating}
              isEditing={false}
              editedValue={typeof rating === 'number' ? rating.toString() : '0'}
              onChange={() => {}}
            />
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:justify-between text-sm text-gray-600 space-y-1 sm:space-y-0">
            <span>Created: {formatDate(created_at)}</span>
            <span>Last Updated: {formatDate(lastUpdated)}</span>
          </div>
          <div className="mt-4 flex flex-wrap sm:justify-end justify-center gap-2">
            <Button
              onClick={() => setShowAddVehicleModal(true)}
              className="bg-black text-white w-full min-w-[135px] sm:w-auto hover:bg-gray-800 print:hidden"
            >
              Add Vehicle
            </Button>
            <Button
              onClick={() => setShowAddFighterModal(true)}
              className="bg-black text-white flex-1 min-w-[135px] sm:flex-none hover:bg-gray-800 print:hidden"
            >
              Add Fighter
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
              setFighterName('');
              setSelectedFighterTypeId('');
              setFighterCost('');
              setFetchError(null);
            }}
            onConfirm={handleAddFighter}
            confirmText="Add Fighter"
            confirmDisabled={!selectedFighterTypeId || !fighterName || !fighterCost}
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
                    inputMode="numeric"
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
      </div>

      <div className="print:visible">
        {fighters.length > 0 ? (
          <DraggableFighters 
            fighters={fighters} 
            onPositionsUpdate={handlePositionsUpdate}
            onFightersReorder={setFighters}
            initialPositions={positions}
          />
        ) : (
          <div className="text-white italic">No fighters available.</div>
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
        <p className="text-base sm:text-lg font-semibold">
          {value != null ? value : 0}
        </p>
      )}
    </div>
  );
}
