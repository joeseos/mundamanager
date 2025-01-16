'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { MyFighters } from './my-fighters';
import DeleteGangButton from "./delete-gang-button";
import { Weapon } from '@/types/weapon';
import { FighterProps } from '@/types/fighter';
import { Equipment } from '@/types/equipment';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface GangProps {
  id: string;
  name: string;
  gang_type_id: string;
  gang_type?: string;
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
  }[];
}

interface FighterType {
  id: string;
  fighter_type: string;
  cost: number;
  total_cost: number;
}

export default function Gang({ 
  id, 
  name: initialName, 
  gang_type_id,
  gang_type,
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
  const [editedCredits, setEditedCredits] = useState((initialCredits ?? 0).toString())
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

  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const handleSave = async () => {
    try {
      const newCredits = parseInt(editedCredits);
      const operation = newCredits >= credits ? 'add' : 'subtract';
      const creditsDifference = Math.abs(newCredits - credits);

      const response = await fetch(`/api/gangs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editedName,
          credits: creditsDifference,
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

      return true; // Return true to close the modal
    } catch (error) {
      console.error('Error updating gang:', error);
      
      toast({
        title: "Error",
        description: "Failed to update gang. Please try again.",
        variant: "destructive"
      });

      return false; // Return false to keep the modal open
    }
  };

  const handleAddFighter = async () => {
    if (!selectedFighterTypeId || !fighterName) {
      setFetchError('Please select a fighter type and enter a name');
      return;
    }

    try {
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
            p_fighter_name: fighterName
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.message?.includes('Not enough credits')) {
          throw new Error('Not enough credits to add this fighter');
        }
        throw new Error(errorData.message || 'Failed to add fighter');
      }

      const data = await response.json();

      if (!data?.fighter_id) {
        throw new Error('Not enough credits to add this fighter');
      }

      // Get the fighter type cost
      const fighterType = fighterTypes.find(type => type.id === selectedFighterTypeId);
      if (!fighterType) {
        throw new Error('Fighter type not found');
      }

      // Update gang credits and rating immediately
      const newGangCredits = credits - fighterType.total_cost;
      const newRating = rating + fighterType.total_cost;
      setCredits(newGangCredits);
      setRating(newRating);

      const newFighter: FighterProps = {
        id: data.fighter_id,
        fighter_name: data.fighter_name,
        fighter_type: data.fighter_type,
        fighter_type_id: selectedFighterTypeId,
        fighter_class: data.fighter_class,
        credits: fighterType.total_cost,
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

      setFighters(prevFighters => [...prevFighters, newFighter]);
      setSelectedFighterTypeId('');
      setFighterName('');
      setFetchError(null);

    } catch (error) {
      console.error('Error adding fighter:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to add fighter');
    }
  };

  const handleDeleteFighter = async (fighterId: string) => {
    try {
      const response = await fetch(`/api/fighters/${fighterId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete fighter');
      }

      const data = await response.json();
      setFighters(fighters.filter(fighter => fighter.id !== fighterId));
      setRating(data.gang.rating);
    } catch (error) {
      console.error('Error deleting fighter:', error);
    }
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
          onChange={(e) => setEditedCredits(e.target.value)}
          className="w-full"
          placeholder="Credits"
        />
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

  return (
    <div className="space-y-4">
      <div className="bg-white shadow-md rounded-lg px-8 pt-4 pb-6">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <h2 className="text-2xl font-bold">{name}</h2>
          <div className="flex gap-2">
            {additionalButtons}
            <Button
              onClick={() => setShowEditModal(true)}
              className="bg-black text-white hover:bg-gray-800"
            >
              Edit
            </Button>
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
          <StatItem 
            label="Meat" 
            value={meat} 
            isEditing={isEditing} 
            editedValue={editedMeat} 
            onChange={setEditedMeat} 
          />
          <StatItem 
            label="Exploration Points" 
            value={explorationPoints} 
            isEditing={isEditing} 
            editedValue={editedExplorationPoints} 
            onChange={setEditedExplorationPoints} 
          />
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
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Add Fighter</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="text"
              placeholder="Fighter name"
              value={fighterName}
              onChange={(e) => setFighterName(e.target.value)}
              className="w-full sm:w-2/5"
            />
            <select
              value={selectedFighterTypeId}
              onChange={(e) => setSelectedFighterTypeId(e.target.value)}
              className="w-full sm:w-2/5 p-2 border rounded"
            >
              <option value="">Select fighter type</option>
              {fighterTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.fighter_type} ({type.total_cost} credits)
                </option>
              ))}
            </select>
            <Button 
              onClick={handleAddFighter} 
              disabled={!selectedFighterTypeId || !fighterName}
              className="w-full sm:w-1/5 mt-2 sm:mt-0"
            >
              Add Fighter
            </Button>
          </div>
          {fetchError && <p className="text-red-500 mt-2">{fetchError}</p>}
        </div>

        {showEditModal && (
          <Modal
            title="Edit Gang"
            content={editModalContent}
            onClose={() => setShowEditModal(false)}
            onConfirm={handleSave}
            confirmText="Save Changes"
          />
        )}
      </div>

      <div>
        {fighters.length > 0 ? (
          <MyFighters fighters={fighters} />
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
