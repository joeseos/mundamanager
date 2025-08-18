import React, { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { FighterDetailsStatsTable } from '../ui/fighter-details-stats-table';
import { memo } from 'react';
import { calculateAdjustedStats } from '@/utils/stats';
import { FighterProps, FighterEffect, Vehicle } from '@/types/fighter';
import { TbMeatOff } from "react-icons/tb";
import { GiCrossedChains, GiHandcuffs } from "react-icons/gi";
import { IoSkull } from "react-icons/io5";
import { MdChair } from "react-icons/md";
import { FaMedkit } from "react-icons/fa";
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { FighterImageEditModal } from './fighter-image-edit-modal';


// Vehicle equipment profile interface


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
  sub_type?: {
    fighter_sub_type: string;
    fighter_sub_type_id: string;
  };
  alliance_crew_name?: string;
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
  xp: number;
  total_xp?: number;
  advancements?: {
    characteristics: Record<string, any>;
    skills: Record<string, any>;
  };
  onNameUpdate?: (name: string) => void;
  onAddXp?: () => void;
  onEdit?: () => void;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  fighter_class?: string;
  kills: number;
  effects?: { 
    injuries: FighterEffect[]; 
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cyberteknika: FighterEffect[];
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
  };
  vehicles?: Vehicle[];
  vehicleEquipment?: VehicleEquipment[];
  gangId?: string;
  userPermissions: UserPermissions;
  owner_name?: string; // Name of the fighter who owns this fighter (for exotic beasts)
  image_url?: string;
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
    body_slots: 0,
    drive_slots: 0,
    engine_slots: 0,
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
    body_slots: baseStats.body_slots || 0,
    drive_slots: baseStats.drive_slots || 0,
    engine_slots: baseStats.engine_slots || 0,
  };
  
  // Apply modifiers from vehicle effects (both lasting damages and vehicle upgrades)
  if (baseStats.effects) {
    const effectCategories = ["lasting damages", "vehicle upgrades"];
    effectCategories.forEach(categoryName => {
      if (baseStats.effects && baseStats.effects[categoryName]) {
        baseStats.effects[categoryName].forEach((effect: FighterEffect) => {
          if (effect.fighter_effect_modifiers && Array.isArray(effect.fighter_effect_modifiers)) {
            effect.fighter_effect_modifiers.forEach(modifier => {
              // Convert stat_name to lowercase to match our stats object keys
              const statName = modifier.stat_name.toLowerCase();
              
              // Skip slot modifiers - these are used for counting occupied slots, not increasing max slots
              if (statName === 'body_slots' || statName === 'drive_slots' || statName === 'engine_slots') {
                return;
              }
              
              // Only apply if the stat exists in our stats object
              if (statName in stats) {
                // Apply the numeric modifier to the appropriate stat
                stats[statName as keyof typeof stats] += modifier.numeric_value;
              }
            });
          }
        });
      }
    });
  }

  return stats;
};

// Helper function for slot pill colors
const getPillColor = (occupied: number | undefined, total: number | undefined) => {
  const occupiedValue = occupied || 0;
  const totalValue = total || 0;
  
  if (occupiedValue > totalValue) return "bg-red-500";
  if (occupiedValue === totalValue) return "bg-gray-500";
  return "bg-green-500";
};

// Calculate occupied slots from effects system
const calculateOccupiedSlots = (vehicle: any) => {
  let bodyOccupied = 0;
  let driveOccupied = 0;
  let engineOccupied = 0;

  // Count from new effects system - each piece of equipment with vehicle upgrade effects consumes slots
  if (vehicle?.effects) {
    const effectCategories = ["vehicle upgrades"];
    effectCategories.forEach(categoryName => {
      if (vehicle.effects[categoryName]) {
        vehicle.effects[categoryName].forEach((effect: any) => {
          // Check what type of slot this equipment uses based on its slot modifiers
          if (effect.fighter_effect_modifiers && Array.isArray(effect.fighter_effect_modifiers)) {
            let usesBodySlot = false;
            let usesDriveSlot = false;
            let usesEngineSlot = false;

            effect.fighter_effect_modifiers.forEach((modifier: any) => {
              const statName = modifier.stat_name.toLowerCase();
              
              // Check for explicit slot modifiers - this is the only method now
              if (statName === 'body_slots' && modifier.numeric_value > 0) {
                usesBodySlot = true;
              }
              else if (statName === 'drive_slots' && modifier.numeric_value > 0) {
                usesDriveSlot = true;
              }
              else if (statName === 'engine_slots' && modifier.numeric_value > 0) {
                usesEngineSlot = true;
              }
            });

            // Count the slot usage (each effect/equipment uses 1 slot of its type)
            if (usesBodySlot) bodyOccupied++;
            if (usesDriveSlot) driveOccupied++;  
            if (usesEngineSlot) engineOccupied++;
          }
        });
      }
    });
  }

  return { bodyOccupied, driveOccupied, engineOccupied };
};

export const FighterDetailsCard = memo(function FighterDetailsCard({
  id,
  name,
  type,
  sub_type,
  label,
  alliance_crew_name,
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
  onEdit,
  killed,
  retired,
  enslaved,
  starved,
  recovery,
  captured,
  fighter_class,
  kills,
  effects,
  vehicles,
  vehicleEquipment = [],
  gangId,
  userPermissions,
  owner_name,
  image_url
}: FighterDetailsCardProps) {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(image_url);

  // Create fighter data object for stat calculation
  const fighterData = useMemo<FighterProps>(() => ({
    id,
    fighter_name: name,
    fighter_type: type,
    fighter_sub_type: sub_type,
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
      advancements: effects?.advancements || [],
      bionics: effects?.bionics || [],
      cyberteknika: effects?.cyberteknika || [],
      'gene-smithing': effects?.['gene-smithing'] || [],
      'rig-glitches': effects?.['rig-glitches'] || [],
      augmentations: effects?.augmentations || [],
      equipment: effects?.equipment || [],
      user: effects?.user || []
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
    id, name, type, sub_type, credits, movement, weapon_skill, ballistic_skill,
    strength, toughness, wounds, initiative, attacks, leadership,
    cool, willpower, intelligence, xp, kills, advancements, effects,
    fighter_class
  ]);
  const canShowEditButtons = userPermissions.canEdit;
  const isCrew = fighter_class === 'Crew';

  const handleImageClick = () => {
    if (canShowEditButtons) {
      setIsImageModalOpen(true);
    }
  };

  const handleImageUpdate = (newImageUrl: string) => {
    setCurrentImageUrl(newImageUrl);
  };
  
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
      'M': vehicles?.[0] ? `${vehicleStats?.movement}"` : '*',
      'Front': vehicles?.[0] ? vehicleStats?.front : '*',
      'Side': vehicles?.[0] ? vehicleStats?.side : '*',
      'Rear': vehicles?.[0] ? vehicleStats?.rear : '*',
      'HP': vehicles?.[0] ? vehicleStats?.hull_points : '*',
      'Hnd': vehicles?.[0] ? `${vehicleStats?.handling}+` : '*',
      'Sv': vehicles?.[0] ? `${vehicleStats?.save}+` : '*',
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
      <div className="flex items-center mb-20">
        <div className="flex w-full items-center">
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
                  {alliance_crew_name && ` – ${alliance_crew_name}`}
                  {fighter_class && ` (${fighter_class})`}
                  {sub_type?.fighter_sub_type && `, ${sub_type.fighter_sub_type}`}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute right-0 md:top-[-10px] top-0 flex items-center z-20">
          <div className="relative flex flex-col flex-shrink z-11 mr-1 my-2 text-2xl max-h-[60px] flex-wrap place-content-center">
            {killed && <IoSkull className="text-gray-300" />}
            {retired && <MdChair className="text-gray-600" />}
            {enslaved && <GiCrossedChains className="text-sky-200" />}
            {starved && <TbMeatOff className="text-red-500" />}
            {recovery && <FaMedkit className="text-blue-500" />}
            {captured && <GiHandcuffs className="text-red-600" />}
          </div>
        
          {/* Profile picture of the fighter */}
          <div 
            className={`bg-black rounded-full shadow-md border-4 border-black flex flex-col md:size-[85px] size-[64px] relative z-10 print:bg-white print:shadow-none overflow-hidden ${canShowEditButtons ? 'cursor-pointer hover:border-neutral-400 hover:bg-neutral-400 transition-colors' : ''}`}
            onClick={handleImageClick}
          >
          {currentImageUrl ? (
            <img src={currentImageUrl} alt="Fighter" className="object-cover rounded-full" />
          ) : (
            <img src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1754972459/unknown_cropped_web_foy9m7.avif" alt="Fighter" className="object-cover rounded-full" />
          )}
          </div>
          <div className="bg-[#FFFFFF] rounded-full shadow-md border-4 border-black flex flex-col items-center justify-center md:size-[85px] size-[64px] flex-shrink-0 relative z-10 print:bg-white print:shadow-none">
            <span className="leading-6 font-bold md:text-3xl text-2xl">{Math.round(credits ?? 0) === 0 ? '*' : Math.round(credits ?? 0)}</span>
            <span className="leading-3 md:font-bold text-xs">Credits</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center">
        <div className="text-base text-gray-600">
          <div>OOA: {kills}</div>
        </div>

        <div className="flex flex-wrap sm:justify-end justify-center gap-2">
          <Button
            variant="secondary"
            className="bg-black text-white hover:bg-gray-800"
            onClick={() => onAddXp && onAddXp()}
            disabled={!canShowEditButtons}
          >
            Add XP
          </Button>
          <Button
            variant="secondary"
            className="bg-black text-white hover:bg-gray-800"
            onClick={onEdit}
            disabled={!canShowEditButtons}
          >
            Edit Fighter
          </Button>
        </div>
      </div> 
      <div className="mt-2">
        <FighterDetailsStatsTable data={stats} isCrew={isCrew} />
      </div>
      
      {/* Show owner information for owned fighters */}
      {owner_name && (
        <div className="mt-2 text-left">
          <div className="text-sm text-black">
            Owned by <span className="font-semibold">{owner_name}</span>
          </div>
        </div>
      )}
      
        <div className="mt-4">
          {fighter_class === 'Crew' && (
            <p className="text-base text-gray-600">
              {vehicles?.[0]
                ? vehicles[0].vehicle_name
                  ? `Vehicle: ${vehicles[0].vehicle_name} - ${vehicles[0].vehicle_type}`
                  : `Vehicle: ${vehicles[0].vehicle_type || 'None'}`
                : 'Vehicle: None'}
            </p>
          )}
          {fighter_class === 'Crew' && vehicles?.[0] && vehicleStats && (() => {
            const occupiedSlots = calculateOccupiedSlots(vehicles?.[0]);
            return (
              <div className="flex items-center gap-1 mt-2">
                <h3 className="text-base text-gray-600">Upgrade Slots:</h3>
                <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.bodyOccupied, vehicleStats.body_slots)} text-white text-xs font-medium rounded-full`}>Body: {occupiedSlots.bodyOccupied}/{vehicleStats.body_slots}</span>
                <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.driveOccupied, vehicleStats.drive_slots)} text-white text-xs font-medium rounded-full`}>Drive: {occupiedSlots.driveOccupied}/{vehicleStats.drive_slots}</span>
                <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.engineOccupied, vehicleStats.engine_slots)} text-white text-xs font-medium rounded-full`}>Engine: {occupiedSlots.engineOccupied}/{vehicleStats.engine_slots}</span>
              </div>
            );
          })()}
        </div>

      {/* Image Edit Modal */}
      <FighterImageEditModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        currentImageUrl={currentImageUrl}
        fighterId={id}
        gangId={gangId || ''}
        onImageUpdate={handleImageUpdate}
      />
    </div>
  );
}); 