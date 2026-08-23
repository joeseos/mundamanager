import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { FighterDetailsStatsTable } from '../ui/fighter-details-stats-table';
import {
  hasCumulativeXp,
  hasSaveCharacteristic,
  initiativeAndMentalCharacteristicSuffix,
} from '@/types/edition';
import { memo } from 'react';
import { nextTierStartFor } from '@/utils/advancementRanks';
import { calculateAdjustedStats } from '@/utils/effect-modifiers';
import { FighterProps, FighterEffect, Vehicle } from '@/types/fighter';
import { TbMeatOff } from "react-icons/tb";
import { GiHandcuffs, GiImprisoned } from "react-icons/gi";
import { IoSkull } from "react-icons/io5";
import { MdChair } from "react-icons/md";
import { FaMedkit, FaBookDead } from "react-icons/fa";
import { LuLogs } from "react-icons/lu";
import { Equipment } from '@/types/equipment';
import { UserPermissions } from '@/types/user-permissions';
import { FighterImageEditModal } from './fighter-image-edit-modal';
import LogModal from '@/components/log-modal';
import { FighterOoaHistoryModal } from './fighter-ooa-history-modal';

// Vehicle equipment interface that extends Equipment
interface VehicleEquipment extends Equipment {
  vehicle_id: string;
  vehicle_equipment_id: string;
}

interface FighterDetailsCardProps {
  id: string;
  name: string;
  type: string;
  specialisation?: {
    fighter_specialisation: string;
    fighter_specialisation_id: string;
  };
  fighter_variant?: string | null;
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
  save?: number | null;
  edition_slug?: string | null;
  xp: number;
  /** null means N/A: this fighter's type cannot gain XP. */
  starting_xp?: number | null;
  total_xp?: number;
  advancements?: {
    characteristics: Record<string, any>;
    skills: Record<string, any>;
  };
  /**
   * The fighter's actual skill rows. Distinct from `advancements.skills`, which
   * is a parallel shape the server does not populate on first load — counting
   * advancements from it silently misses every skill the fighter already has.
   */
  skills?: Record<string, { is_advance?: boolean }>;
  onNameUpdate?: (name: string) => void;
  onAddXp?: () => void;
  onEdit?: () => void;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  fighter_subtypes: string[];
  kills: number;
  kill_count?: number;
  is_spyrer?: boolean;
  is_vehicle?: boolean;
  effects?: {
    injuries: FighterEffect[];
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cyberteknika: FighterEffect[];
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    'power-boosts': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
    skills: FighterEffect[];
  };
  vehicles?: Vehicle[];
  vehicleEquipment?: VehicleEquipment[];
  gangId?: string;
  /** First campaign the gang belongs to — scopes OOA record edit comboboxes. */
  campaignId?: string;
  userPermissions: UserPermissions;
  owner_name?: string; // Name of the fighter who owns this fighter (for exotic beasts)
  captured_by_gang_name?: string;
  captured_by_gang_id?: string | null;
  image_url?: string;
  fighter_gang_legacy?: {
    id: string;
    fighter_type_id: string;
    name?: string;
  } | null;
  selected_archetype?: {
    id: string;
    name: string;
  } | null;
}

// Update the stats calculation to include vehicle equipment bonuses
const calculateVehicleStats = (baseStats: any) => {
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

  // Apply modifiers from vehicle effects (lasting damages, vehicle upgrades, and user adjustments)
  if (baseStats.effects) {
    const effectCategories = ["lasting damages", "vehicle upgrades", "user"];
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
  specialisation,
  fighter_variant,
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
  save,
  edition_slug,
  xp,
  starting_xp = null,
  advancements,
  skills,
  onAddXp,
  onEdit,
  killed,
  retired,
  enslaved,
  starved,
  recovery,
  captured,
  fighter_subtypes,
  kills,
  kill_count,
  is_spyrer,
  is_vehicle,
  effects,
  vehicles,
  gangId,
  campaignId,
  userPermissions,
  owner_name,
  captured_by_gang_name,
  captured_by_gang_id,
  image_url,
  fighter_gang_legacy,
  selected_archetype
}: FighterDetailsCardProps) {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(image_url);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isOoaHistoryModalOpen, setIsOoaHistoryModalOpen] = useState(false);

  // Create fighter data object for stat calculation
  const fighterData = useMemo<FighterProps>(() => ({
    id,
    fighter_name: name,
    fighter_type: type,
    fighter_specialisation: specialisation,
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
    save,
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
      'power-boosts': effects?.['power-boosts'] || [],
      augmentations: effects?.augmentations || [],
      equipment: effects?.equipment || [],
      user: effects?.user || [],
      skills: effects?.skills || []
    },
    fighter_subtypes,
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
    id, name, type, specialisation, credits, movement, weapon_skill, ballistic_skill,
    strength, toughness, wounds, initiative, attacks, leadership,
    cool, willpower, intelligence, save, xp, kills, advancements, effects,
    fighter_subtypes
  ]);
  const canShowEditButtons = userPermissions.canEdit;
  const isCrew = fighter_subtypes.includes('Crew');
  const isVehicle = is_vehicle ?? false;
  // Only an N23 crew reads its profile off an attached vehicle record. An N26 vehicle is the
  // fighter, so it keeps the ordinary statline. N26 has no Crew subtype today, so the guard is
  // consistency rather than a live case — but the statline and its limits must agree either way.
  const showsVehicleProfile = isCrew && !isVehicle;

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
    showsVehicleProfile ? calculateVehicleStats(vehicles?.[0]) : null,
    [showsVehicleProfile, vehicles]
  );

  const initiativeAndMentalSuffix = initiativeAndMentalCharacteristicSuffix(edition_slug);

  // A model whose type cannot gain XP has no recruitment value, and reads N/A.
  // The number takes over the moment the model actually holds XP, so a group
  // house-ruling XP onto it still sees it.
  // Rank-based editions show progress toward the next Advancement tier.
  const xpDisplay = (() => {
    if (starting_xp == null && !xp) return 'N/A';
    const currentXp = xp ?? 0;
    if (hasCumulativeXp(edition_slug)) {
      const nextTierStart = nextTierStartFor(edition_slug, currentXp);
      return `${currentXp}/${nextTierStart ?? '–'}`;
    }
    return currentXp;
  })();

  // Update stats object to handle crew stats - now using modifiedStats instead of adjustedStats
  const stats = useMemo<Record<string, string | number>>(() => ({
    ...(showsVehicleProfile ? {
      'M': vehicles?.[0] ? `${vehicleStats?.movement}"` : '*',
      'Front': vehicles?.[0] ? vehicleStats?.front : '*',
      'Side': vehicles?.[0] ? vehicleStats?.side : '*',
      'Rear': vehicles?.[0] ? vehicleStats?.rear : '*',
      'HP': vehicles?.[0] ? vehicleStats?.hull_points : '*',
      'Hnd': vehicles?.[0] ? `${vehicleStats?.handling}+` : '*',
      'Sv': vehicles?.[0] ? `${vehicleStats?.save}+` : '*',
      'BS': modifiedStats.ballistic_skill === 0 ? '-' : `${modifiedStats.ballistic_skill}+`,
      'Ld': `${modifiedStats.leadership}${initiativeAndMentalSuffix}`,
      'Cl': `${modifiedStats.cool}${initiativeAndMentalSuffix}`,
      'Wil': `${modifiedStats.willpower}${initiativeAndMentalSuffix}`,
      'Int': `${modifiedStats.intelligence}${initiativeAndMentalSuffix}`,
      'XP': xpDisplay
    } : {
      'M': `${modifiedStats.movement}"`,
      'WS': `${modifiedStats.weapon_skill}+`,
      'BS': modifiedStats.ballistic_skill === 0 ? '-' : `${modifiedStats.ballistic_skill}+`,
      'S': modifiedStats.strength,
      'T': modifiedStats.toughness,
      'W': modifiedStats.wounds,
      'I': `${modifiedStats.initiative}${initiativeAndMentalSuffix}`,
      'A': modifiedStats.attacks,
      ...(hasSaveCharacteristic(edition_slug) && { 'Sv': modifiedStats.save != null ? `${modifiedStats.save}+` : '-' }),
      'Ld': `${modifiedStats.leadership}${initiativeAndMentalSuffix}`,
      'Cl': `${modifiedStats.cool}${initiativeAndMentalSuffix}`,
      'Wil': `${modifiedStats.willpower}${initiativeAndMentalSuffix}`,
      'Int': `${modifiedStats.intelligence}${initiativeAndMentalSuffix}`,
      'XP': xpDisplay
    })
  }), [showsVehicleProfile, vehicleStats, vehicles, modifiedStats, xpDisplay, edition_slug, initiativeAndMentalSuffix]);

  const typeLine = [
    `${type}${alliance_crew_name ? ` – ${alliance_crew_name}` : ''}${fighter_subtypes.length > 0 ? ` (${fighter_subtypes.join(', ')})` : ''}`,
    fighter_variant,
    specialisation?.fighter_specialisation,
  ].filter(Boolean).join(', ');

  return (
    <div className="relative">
      <div className="flex items-center mb-20">
        <div className="flex w-full items-center">
          <div
            className="absolute inset-0 bg-no-repeat bg-cover print:bg-none!"
            style={{
              backgroundImage: "url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png')",
              width: '100%',
              height: '65px',
              marginTop: '0px',
              marginLeft: '-0.5em',
              zIndex: 0,
              backgroundPosition: 'center',
              backgroundSize: '100% 100%'
            }}>
            <div className="absolute z-10 left-0 right-[156px] md:right-[206px] pl-4 sm:pl-8 flex items-center gap-2 overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
              {label && (
                <div className="inline-flex items-center rounded-sm bg-card px-1 text-sm font-bold font-mono text-foreground uppercase print:border-2 print:border-black">
                  {label}
                </div>
              )}
              <div className="flex flex-col items-baseline w-full min-w-0">
                <div className="text-xl sm:leading-7 sm:text-2xl font-semibold text-white mr-2 print:text-foreground truncate w-full">{name}</div>
                <div className="text-gray-300 text-xs sm:leading-5 sm:text-base overflow-hidden text-ellipsis whitespace-nowrap w-full print:text-muted-foreground">
                  {typeLine}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute right-0 md:top-[-10px] top-0 flex items-center z-20">
          <div className="relative flex flex-col shrink z-11 mr-1 my-2 text-2xl max-h-[60px] flex-wrap place-content-center">
            {killed && <IoSkull className="text-gray-300" />}
            {retired && <MdChair className="text-muted-foreground" />}
            {enslaved && <GiImprisoned className="text-red-600" />}
            {starved && <TbMeatOff className="text-red-500" />}
            {recovery && <FaMedkit className="text-blue-500" />}
            {captured && <GiHandcuffs className="text-sky-300" />}
          </div>

          {/* Profile picture of the fighter */}
          <div
            className={`bg-secondary rounded-full shadow-md border-4 border-black flex flex-col md:size-[85px] size-[64px] relative z-10 print:bg-card print:shadow-none overflow-hidden ${canShowEditButtons ? 'cursor-pointer hover:border-neutral-400 transition-colors' : ''}`}
            onClick={handleImageClick}
          >
          {/* eslint-disable @next/next/no-img-element */}
          {currentImageUrl ? (
            <img src={currentImageUrl} alt="Fighter" className="object-cover rounded-full" />
          ) : (
            <img src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/unknown_fighter_cropped_web.webp" alt="Fighter" className="object-cover rounded-full" />
          )}
          {/* eslint-enable @next/next/no-img-element */}
          </div>
          <div className="bg-secondary rounded-full shadow-md border-4 border-black flex flex-col items-center justify-center md:size-[85px] size-[64px] shrink-0 relative z-10 print:bg-card print:shadow-none">
            <span className="leading-none font-bold md:text-3xl text-2xl">{Math.round(credits ?? 0) === 0 ? '*' : Math.round(credits ?? 0)}</span>
            <span className="leading-none md:font-bold text-xs">Credits</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center">
        <div className="text-base text-muted-foreground flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsOoaHistoryModalOpen(true)}
              title="View OOA / Wreck records"
              aria-label="View OOA / Wreck records"
              className="print:hidden text-muted-foreground hover:text-foreground rounded p-0.5"
            >
              <FaBookDead className="w-5 h-5" />
            </button>
            <span className="text-sm"> OOA: {kills}</span>
          </div>
          {is_spyrer && <div>Kills: {kill_count ?? 0}</div>}
        </div>

        <div className="flex flex-wrap sm:justify-end justify-center gap-2">
          {/* Fighter Logs button */}
          <Button
            onClick={() => setIsLogsModalOpen(true)}
            variant="ghost"
            size="icon"
            className="print:hidden"
            title="View Fighter Logs"
            disabled={!canShowEditButtons}
          >
            <LuLogs className="w-[23px] h-[23px]" />
          </Button>

          {/* Add XP button */}
          <Button
            variant="secondary"
            className="bg-neutral-900 text-white hover:bg-gray-800"
            onClick={() => onAddXp && onAddXp()}
            disabled={!canShowEditButtons}
          >
            Add XP
          </Button>

          {/* Edit Fighter button */}
          <Button
            variant="secondary"
            className="bg-neutral-900 text-white hover:bg-gray-800"
            onClick={onEdit}
            disabled={!canShowEditButtons}
          >
            Edit
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <FighterDetailsStatsTable
          data={stats}
          isCrew={showsVehicleProfile}
          editionSlug={edition_slug}
          currentXp={xp ?? 0}
          fighterId={id}
        />
      </div>

      {/* Show owner information for owned fighters */}
      {owner_name && (
        <div className="mt-2 text-left">
          <div className="text-sm text-muted-foreground">
            Owned by: <Badge variant="secondary">{owner_name}</Badge>
          </div>
        </div>
      )}

      {/* Show captured-by gang information */}
      {captured && captured_by_gang_name && (
        <div className="mt-2 text-left">
          <div className="text-sm text-muted-foreground">
            Captured by:{' '}
            {captured_by_gang_id ? (
              <Link href={`/gang/${captured_by_gang_id}`} prefetch={false} className="inline-block">
                <Badge variant="outline" className="hover:bg-secondary/80 cursor-pointer">
                  {captured_by_gang_name}
                </Badge>
              </Link>
            ) : (
              <Badge variant="secondary">{captured_by_gang_name}</Badge>
            )}
          </div>
        </div>
      )}

      {/* Show Gang Legacy information */}
      {fighter_gang_legacy && (
        <div className="mt-2 text-left">
          <div className="text-sm text-muted-foreground">
            Gang Legacy: <Badge variant="secondary">{fighter_gang_legacy.name}</Badge>
          </div>
        </div>
      )}

      {/* Show Archetype information */}
      {selected_archetype?.name && (
        <div className="mt-2 text-left">
          <div className="text-sm text-muted-foreground">
            Archetype: <Badge variant="secondary">{selected_archetype.name}</Badge>
          </div>
        </div>
      )}

      {/* N23 crews have separate vehicle records; N26 vehicles are fighters. */}
      <div className="mt-4">
      {showsVehicleProfile && (
          <div className="text-sm text-muted-foreground">
            Vehicle:{' '}
            {vehicles?.[0]
              ? vehicles[0].vehicle_name
                ? <Badge variant="secondary">{vehicles[0].vehicle_name} - {vehicles[0].vehicle_type}</Badge>
                : <Badge variant="secondary">{vehicles[0].vehicle_type || 'None'}</Badge>
              : <Badge variant="secondary">None</Badge>
            }
          </div>
        )}
        {showsVehicleProfile && vehicles?.[0] && vehicleStats && (() => {
          const occupiedSlots = calculateOccupiedSlots(vehicles?.[0]);
          return (
            <>
            <div className="flex items-center gap-1 mt-1">
              <h3 className="text-sm text-muted-foreground">Upgrades:</h3>
              <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.bodyOccupied, vehicleStats.body_slots)} text-white text-xs font-medium rounded-full`}>Body: {occupiedSlots.bodyOccupied}/{vehicleStats.body_slots}</span>
              <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.driveOccupied, vehicleStats.drive_slots)} text-white text-xs font-medium rounded-full`}>Drive: {occupiedSlots.driveOccupied}/{vehicleStats.drive_slots}</span>
              <span className={`flex items-center justify-center w-24 h-5 ${getPillColor(occupiedSlots.engineOccupied, vehicleStats.engine_slots)} text-white text-xs font-medium rounded-full`}>Engine: {occupiedSlots.engineOccupied}/{vehicleStats.engine_slots}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <h3 className="text-sm text-muted-foreground shrink-0">Weapon Hardpoints:</h3>
              {(vehicles?.[0]?.effects?.['hardpoint'] ?? []).map((hp: FighterEffect) => {
                const data = hp.type_specific_data as { location?: string; operated_by?: string; arcs?: string[] } | null;
                const loc = data?.location?.trim();
                const operatedBy = data?.operated_by?.trim();
                const arcs = Array.isArray(data?.arcs) ? data.arcs : [];
                const arcStr = `Arc (${arcs.join(', ')})`;
                const operatedLabel = operatedBy === 'crew' ? 'Crew Operated' : operatedBy === 'passenger' ? 'Passenger Operated' : operatedBy || '';
                const parts: string[] = [];
                if (loc) parts.push(`${loc}:`);
                else parts.push('Unknown:');
                if (operatedLabel) parts.push(`${operatedLabel} - ${arcStr}`);
                else parts.push(arcStr);
                const label = parts.join(' ');
                return (
                  <Badge key={hp.id} variant="secondary" className="text-xs font-normal">
                    {label}
                  </Badge>
                );
              })}
            </div>
            </>
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

      {/* Fighter Logs Modal */}
      <LogModal
        fetchUrl={`/api/gangs/${gangId || ''}/logs?fighterId=${id}${showsVehicleProfile && vehicles?.[0] ? `&vehicleId=${vehicles[0].id}` : ''}`}
        title={`Activity Logs: ${name}`}
        emptyMessage="No activity logs found for this fighter."
        editionSlug={edition_slug}
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
      />

      {/* OOA / Wreck Records Modal */}
      <FighterOoaHistoryModal
        isOpen={isOoaHistoryModalOpen}
        fighterId={id}
        gangId={gangId}
        campaignId={campaignId}
        canEdit={canShowEditButtons}
        onClose={() => setIsOoaHistoryModalOpen(false)}
      />
    </div>
  );
});
