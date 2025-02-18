import React, { useState, useMemo } from 'react';
import { Button } from './ui/button';
import { FighterStatsTable } from './ui/fighter-stats-table';
import { memo } from 'react';
import { calculateAdjustedStats } from '@/utils/stats';
import { FighterProps, Injury } from '@/types/fighter';
import { TbMeatOff } from "react-icons/tb";
import { GiCrossedChains } from "react-icons/gi";
import { IoSkull } from "react-icons/io5";
import { LuArmchair } from "react-icons/lu";
import { MdChair } from "react-icons/md";
import { Equipment, WeaponProfile } from '@/types/equipment';

// Vehicle equipment profile interface
interface VehicleEquipmentProfile {
  id: string;
  equipment_id: string;
  movement: number | null;
  front: number | null;
  side: number | null;
  rear: number | null;
  hull_points: number | null;
  save: number | null;
  profile_name: string;
}

// Vehicle equipment interface that extends Equipment
interface VehicleEquipment extends Equipment {
  vehicle_id: string;
  vehicle_equipment_id: string;
}

interface FighterDetailsCardProps {
  id: string;
  name: string;
  type: string;
  credits: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  xp: number | null;
  total_xp: number | null;
  advancements?: any;
  onNameUpdate: (newName: string) => void;
  onAddXp?: () => void;
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  starved: boolean;
  fighter_class?: string;
  onEdit: () => void;
  kills: number;
  injuries?: Injury[];
  vehicles?: Array<{
    id: string;
    movement: number;
    front: number;
    side: number;
    rear: number;
    hull_points: number;
    handling: number;
    save: number;
    vehicle_type?: string;
    vehicle_name?: string;
    equipment?: Array<{
      id: string;
      equipment_name: string;
      equipment_type: string;
      purchase_cost: number;
      original_cost: number;
      weapon_profiles?: WeaponProfile[];
    }>;
  }>;
  vehicleEquipment?: (Equipment | VehicleEquipment)[]; // Accept both types
  gangId: string;
}

// Update the stats calculation to include vehicle equipment bonuses
const calculateVehicleStats = (baseStats: any, vehicleEquipment: (Equipment | VehicleEquipment)[] = []) => {
  if (!baseStats) return {
    movement: 0,
    front: 0,
    side: 0,
    rear: 0,
    hull_points: 0,
    save: 0,
  };

  // Start with base stats
  const stats = {
    movement: baseStats.movement || 0,
    front: baseStats.front || 0,
    side: baseStats.side || 0,
    rear: baseStats.rear || 0,
    hull_points: baseStats.hull_points || 0,
    save: baseStats.save || 0,
  };

  // Add bonuses from vehicle equipment
  if (Array.isArray(vehicleEquipment)) {
    vehicleEquipment.forEach(equipment => {
      if ('vehicle_equipment_profiles' in equipment && equipment.vehicle_equipment_profiles) {
        equipment.vehicle_equipment_profiles.forEach((profile: VehicleEquipmentProfile) => {
          const statUpdates = {
            movement: profile.movement,
            front: profile.front,
            side: profile.side,
            rear: profile.rear,
            hull_points: profile.hull_points,
            save: profile.save,
          };

          // Update each stat if the profile has a value
          Object.entries(statUpdates).forEach(([key, value]) => {
            if (value !== null) {
              stats[key as keyof typeof stats] += value;
            }
          });
        });
      }
    });
  }

  return stats;
};

export const FighterDetailsCard = memo(function FighterDetailsCard({
  id,
  name,
  type,
  credits,
  movement,
  weapon_skill,
  ballistic_skill,
  strength,
  toughness,
  wounds,
  initiative,
  attacks,
  leadership,
  cool,
  willpower,
  intelligence,
  xp,
  total_xp,
  advancements,
  onNameUpdate,
  onAddXp,
  killed,
  retired,
  enslaved,
  starved,
  fighter_class,
  onEdit,
  kills,
  injuries,
  vehicles,
  vehicleEquipment = [],
  gangId
}: FighterDetailsCardProps) {
  // Create fighter data object for stat calculation
  const fighterData = useMemo<FighterProps>(() => ({
    id,
    fighter_name: name,
    fighter_type: type,
    credits,
    movement,
    weapon_skill,
    ballistic_skill,
    strength,
    toughness,
    wounds,
    initiative,
    attacks,
    leadership,
    cool,
    willpower,
    intelligence,
    xp: xp ?? 0,
    kills,
    advancements: {
      characteristics: advancements?.characteristics || {},
      skills: advancements?.skills || {}
    },
    weapons: [],
    wargear: [],
    special_rules: [],
    injuries: injuries || [],
    fighter_class,
  }), [
    id, name, type, credits, movement, weapon_skill, ballistic_skill,
    strength, toughness, wounds, initiative, attacks, leadership,
    cool, willpower, intelligence, xp, kills, advancements, injuries,
    fighter_class
  ]);

  // Calculate adjusted stats
  const adjustedStats = useMemo(() => calculateAdjustedStats(fighterData), [fighterData]);
  const isCrew = fighter_class === 'Crew';

  // Calculate vehicle stats once
  const vehicleStats = useMemo(() => 
    isCrew ? calculateVehicleStats(vehicles?.[0], vehicleEquipment) : null,
    [isCrew, vehicles, vehicleEquipment]
  );

  // Update stats object to handle crew stats
  const stats = useMemo<Record<string, string | number>>(() => ({
    ...(isCrew ? {
      'M': `${vehicleStats?.movement}"`,
      'Front': vehicleStats?.front,
      'Side': vehicleStats?.side,
      'Rear': vehicleStats?.rear,
      'HP': vehicleStats?.hull_points,
      'Hnd': vehicles?.[0]?.handling ? `${vehicles[0].handling}+` : '*',
      'Sv': `${vehicleStats?.save}+`,
      'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
      'Ld': `${adjustedStats.leadership}+`,
      'Cl': `${adjustedStats.cool}+`,
      'Wil': `${adjustedStats.willpower}+`,
      'Int': `${adjustedStats.intelligence}+`,
      'XP': xp ?? 0
    } : {
      'M': `${adjustedStats.movement}"`,
      'WS': `${adjustedStats.weapon_skill}+`,
      'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
      'S': adjustedStats.strength,
      'T': adjustedStats.toughness,
      'W': adjustedStats.wounds,
      'I': `${adjustedStats.initiative}+`,
      'A': adjustedStats.attacks,
      'Ld': `${adjustedStats.leadership}+`,
      'Cl': `${adjustedStats.cool}+`,
      'Wil': `${adjustedStats.willpower}+`,
      'Int': `${adjustedStats.intelligence}+`,
      'XP': xp ?? 0
    })
  }), [isCrew, vehicleStats, vehicles, adjustedStats, xp]);

  return (
    <div className="relative">
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center mb-4">
        <h1 className="text-2xl font-bold break-words flex-1 mb-2 sm:mb-0 flex items-center gap-2">
          {name}
          {killed && <IoSkull className="text-gray-400" />}
          {retired && <MdChair className="text-gray-600" />}
          {enslaved && <GiCrossedChains className="text-sky-200" />}
          {starved && <TbMeatOff className="text-red-500" />}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="secondary"
            className="bg-black text-white hover:bg-gray-800"
            onClick={() => onAddXp && onAddXp()}
          >
            Add XP
          </Button>
          <Button 
            variant="secondary"
            className="bg-black text-white hover:bg-gray-800"
            onClick={onEdit}
          >
            Edit Fighter
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-lg text-gray-600">
          Type: {type}
          {fighter_class && ` (${fighter_class})`}
        </p>
        <p className="text-lg text-gray-600">
          Credits: {Math.round(credits ?? 0)}
        </p>
        <p className="text-lg text-gray-600">
          Kills: {kills}
        </p>
        {fighter_class === 'Crew' && (
          <p className="text-lg text-gray-600">
            {vehicles?.[0]
              ? vehicles[0].vehicle_name
                ? `Vehicle: ${vehicles[0].vehicle_name} - ${vehicles[0].vehicle_type}`
                : `Vehicle: ${vehicles[0].vehicle_type || 'None'}`
              : 'None'}
          </p>
        )}
      </div>
      <div className="mt-4">
        <FighterStatsTable data={stats} isCrew={isCrew} />
      </div>
    </div>
  );
}); 