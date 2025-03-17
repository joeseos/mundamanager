import React, { useState, useMemo } from 'react';
import { Button } from './ui/button';
import { FighterStatsTable } from './ui/fighter-stats-table';
import { memo } from 'react';
import { calculateAdjustedStats } from '@/utils/stats';
import { FighterEffects, FighterProps, FighterEffect } from '@/types/fighter';
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
  handling: number | null;
}

// Vehicle equipment interface that extends Equipment
interface VehicleEquipment extends Equipment {
  vehicle_id: string;
  vehicle_equipment_id: string;
}

interface FighterEffectStatModifier {
  id: string;
  fighter_effect_id: string;
  stat_name: string;
  numeric_value: number;
}

interface FighterDetailsCardProps {
  id: string;
  name: string;
  type: string;
  label?: string;
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
  effects: {
    injuries: Array<FighterEffect>;
    advancements: Array<FighterEffect>;
  }
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
    body_slots: number;
    body_slots_occupied: number;
    drive_slots: number;
    drive_slots_occupied: number;
    engine_slots: number;
    engine_slots_occupied: number;
    equipment?: Array<{
      id: string;
      equipment_id: string;
      equipment_name: string;
      equipment_type: string;
      purchase_cost: number;
      original_cost: number;
      weapon_profiles?: WeaponProfile[];
      vehicle_equipment_profiles?: VehicleEquipmentProfile[];
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
    handling: 0,
    save: 0,
  };

  // Start with base stats
  const stats = {
    movement: baseStats.movement || 0,
    front: baseStats.front || 0,
    side: baseStats.side || 0,
    rear: baseStats.rear || 0,
    hull_points: baseStats.hull_points || 0,
    handling: baseStats.handling || 0,
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
            handling: profile.handling,
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
  label,
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
  effects,
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
    effects: {
      injuries: effects?.injuries || [],
      advancements: effects?.advancements || []
    },
    fighter_class,
    base_stats: {
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
      intelligence
    },
    current_stats: {
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
      intelligence
    }
  }), [
    id, name, type, credits, movement, weapon_skill, ballistic_skill,
    strength, toughness, wounds, initiative, attacks, leadership,
    cool, willpower, intelligence, xp, kills, advancements, effects,
    fighter_class
  ]);

  const isCrew = fighter_class === 'Crew';
  
  // Calculate modified stats including effects (injuries/advancements)
  const modifiedStats = useMemo(() => 
    calculateAdjustedStats(fighterData),
    [fighterData]
  );

  // Calculate vehicle stats once
  const vehicleStats = useMemo(() => 
    isCrew ? calculateVehicleStats(vehicles?.[0], vehicleEquipment) : null,
    [isCrew, vehicles, vehicleEquipment]
  );

  // Update stats object to handle crew stats - now using modifiedStats instead of adjustedStats
  const stats = useMemo<Record<string, string | number>>(() => ({
    ...(isCrew ? {
      'M': `${vehicleStats?.movement}"`,
      'Front': vehicleStats?.front,
      'Side': vehicleStats?.side,
      'Rear': vehicleStats?.rear,
      'HP': vehicleStats?.hull_points,
      'Hnd': vehicleStats?.handling ? `${vehicleStats.handling}+` : '*',
      'Sv': `${vehicleStats?.save}+`,
      'BS': modifiedStats.ballistic_skill === 0 ? '-' : `${modifiedStats.ballistic_skill}+`,
      'Ld': `${modifiedStats.leadership}+`,
      'Cl': `${modifiedStats.cool}+`,
      'Wil': `${modifiedStats.willpower}+`,
      'Int': `${modifiedStats.intelligence}+`,
      'XP': xp ?? 0
    } : {
      'M': `${modifiedStats.movement}"`,
      'WS': `${modifiedStats.weapon_skill}+`,
      'BS': modifiedStats.ballistic_skill === 0 ? '-' : `${modifiedStats.ballistic_skill}+`,
      'S': modifiedStats.strength,
      'T': modifiedStats.toughness,
      'W': modifiedStats.wounds,
      'I': `${modifiedStats.initiative}+`,
      'A': modifiedStats.attacks,
      'Ld': `${modifiedStats.leadership}+`,
      'Cl': `${modifiedStats.cool}+`,
      'Wil': `${modifiedStats.willpower}+`,
      'Int': `${modifiedStats.intelligence}+`,
      'XP': xp ?? 0
    })
  }), [isCrew, vehicleStats, vehicles, modifiedStats, xp]);

  return (
    <div className="relative">
      <div className="flex mb-6">
        <div className="flex w-full">
          <div
            className="absolute inset-0 bg-no-repeat bg-cover print:!bg-none"
            style={{
              backgroundImage: "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1735986017/top-bar-stroke-v3_s97f2k.png')",
              width: '100%',
              height: '65px',
              marginTop: '0px',
              marginLeft: '-0.5em',
              zIndex: 0,
              backgroundPosition: 'center',
              backgroundSize: '100% 100%'
            }}>
            <div className="absolute z-10 pl-4 sm:pl-8 flex items-center gap-2 w-[60svw] sm:w-[80%] overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
              {label && (
                <div className="inline-flex items-center rounded-sm bg-white px-1 text-sm font-bold font-mono text-black uppercase print:border-2 print:border-black">
                  {label}
                </div>
              )}
              <div className="flex flex-col items-baseline w-full">
                <div className="text-xl sm:leading-7 sm:text-2xl font-semibold text-white mr-2 print:text-black">{name}</div>
                <div className="text-gray-300 text-xs sm:leading-5 sm:text-base overflow-hidden whitespace-nowrap print:text-gray-500">
                  {type}
                  {fighter_class && ` (${fighter_class})`}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative flex flex-col flex-shrink gap-0 z-11 mr-1 my-2 text-2xl max-h-[60px] flex-wrap place-content-center">
          {killed && <IoSkull className="text-gray-300" />}
          {retired && <MdChair className="text-gray-600" />}
          {enslaved && <GiCrossedChains className="text-sky-200" />}
          {starved && <TbMeatOff className="text-red-500" />}
        </div>
        <div className="bg-[#FFFFFF] rounded-full p-2 shadow-md border-4 border-black flex flex-col items-center justify-center w-16 h-16 flex-shrink-0 relative z-10 print:bg-white print:shadow-none">
          <span className="leading-6 font-bold text-2xl">{Math.round(credits ?? 0)}</span>
          <span className="leading-3 text-xs">Credits</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center mb-2">
        <p className="text-lg text-gray-600">
          Kills: {kills}
        </p>
        <div className="flex flex-wrap sm:justify-end justify-center gap-2">
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