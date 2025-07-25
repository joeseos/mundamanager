import React, { useEffect, useRef, useState, memo, useMemo } from 'react';
import { StatsTable, StatsType } from '../ui/fighter-card-stats-table';
import WeaponTable from './fighter-card-weapon-table';
import Link from 'next/link';
import { Equipment } from '@/types/equipment';
import { FighterProps, FighterEffect, Vehicle, VehicleEquipment, FighterSkills } from '@/types/fighter';
import { calculateAdjustedStats } from '@/utils/stats';
import { TbMeatOff } from "react-icons/tb";
import { GiCrossedChains } from "react-icons/gi";
import { IoSkull } from "react-icons/io5";
import { LuArmchair } from "react-icons/lu";
import { MdChair } from "react-icons/md";
import { FaMedkit } from "react-icons/fa";
import { WeaponProfile as EquipmentWeaponProfile } from '@/types/equipment';
import { WeaponProfile as WeaponTypeProfile, Weapon } from '@/types/weapon';

interface FighterCardProps extends Omit<FighterProps, 'fighter_name' | 'fighter_type' | 'vehicles' | 'skills' | 'effects'> {
  name: string;  // maps to fighter_name
  type: string;  // maps to fighter_type
  label?: string;
  fighter_class?: string;
  fighter_sub_type?: { fighter_sub_type: string; fighter_sub_type_id: string } | null;
  alliance_crew_name?: string;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  free_skill?: boolean;
  kills: number;
  skills?: FighterSkills;
  special_rules?: string[];
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
  note?: string;
  vehicle?: Vehicle;
  disableLink?: boolean;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
  owner_name?: string;  // Name of the fighter who owns this fighter (for exotic beasts)
  image_url?: string;
}

type FighterCardData = Omit<FighterProps, 'vehicles'> & {
  label?: string;
  note?: string;
};

const calculateVehicleStats = (
  baseStats: Vehicle | undefined, 
  vehicleEquipment: Array<Equipment & Partial<VehicleEquipment>> = []
) => {
  if (!baseStats) return null;

  const stats = {
    movement: baseStats.movement ?? 0,
    front: baseStats.front ?? 0,
    side: baseStats.side ?? 0,
    rear: baseStats.rear ?? 0,
    hull_points: baseStats.hull_points ?? 0,
    handling: baseStats.handling ?? 0,
    save: baseStats.save ?? 0,
    body_slots: baseStats.body_slots ?? 0,
    drive_slots: baseStats.drive_slots ?? 0,
    engine_slots: baseStats.engine_slots ?? 0,
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

const FighterCard = memo(function FighterCard({
  id,
  name,
  type,
  label,
  fighter_class,
  fighter_sub_type,
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
  advancements,
  weapons,
  wargear,
  special_rules,
  killed,
  retired,
  enslaved,
  starved,
  recovery,
  free_skill,
  kills = 0,  // Default value
  skills = {},  // Add default value
  effects,
  note,
  vehicle,
  disableLink = false,
  viewMode = 'normal',
  owner_name,
  image_url,
}: FighterCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);
  const isCrew = fighter_class === 'Crew';

  // View Mode card size
  const sizeStyles = {
    small: 'w-[520px] aspect-[1.448/1]',
    medium: 'w-[615px] aspect-[1.448/1]',
    large: 'w-[800px] aspect-[1.448/1]',
  };

  // Move getVehicleWeapons function before its usage
  const getVehicleWeapons = (vehicle: Vehicle | undefined) => {
    if (!vehicle?.equipment) return [];
    
    return vehicle.equipment
      .filter(item => item.equipment_type === 'weapon')
      .map(weapon => ({
        fighter_weapon_id: weapon.fighter_weapon_id || weapon.vehicle_weapon_id || weapon.equipment_id,
        weapon_id: weapon.equipment_id,
        weapon_name: weapon.is_master_crafted || weapon.master_crafted 
          ? `${weapon.equipment_name} (Master-crafted)`
          : weapon.equipment_name,
        weapon_profiles: weapon.weapon_profiles?.map(profile => ({
          ...profile,
          range_short: profile.range_short,
          range_long: profile.range_long,
          strength: profile.strength,
          ap: profile.ap,
          damage: profile.damage,
          ammo: profile.ammo,
          acc_short: profile.acc_short,
          acc_long: profile.acc_long,
          traits: profile.traits || '',
          id: profile.id,
          profile_name: profile.profile_name,
          is_master_crafted: (profile as any).is_master_crafted || !!weapon.master_crafted || !!weapon.is_master_crafted
        })) || [],
        cost: weapon.cost
      })) as unknown as Weapon[];
  };

  // Only calculate vehicle stats for crew members
  const vehicleStats = useMemo(() => {
    if (!isCrew) return null;
    return calculateVehicleStats(vehicle, vehicle?.equipment || []);
  }, [isCrew, vehicle]);

  // Get vehicle weapons only for crew members
  const vehicleWeapons = useMemo(() => {
    if (!isCrew || !vehicle) return [];
    return getVehicleWeapons(vehicle);
  }, [isCrew, vehicle]);

  // Get vehicle upgrades only for crew members
  const vehicleUpgrades = useMemo(() => {
    if (!isCrew || !vehicle) return [];
    return vehicle.equipment?.filter(
      (item): item is (Equipment & Partial<VehicleEquipment>) => 
        item.equipment_type === 'vehicle_upgrade' || 
        item.equipment_type === 'wargear'
    ) || [];
  }, [isCrew, vehicle]);

  // Create fighter data object for stat calculation
  const fighterData = useMemo(() => {
    return {
      id,
      fighter_name: name,
      fighter_type: type,
      fighter_class,
      fighter_sub_type,
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
      kills,
      skills: skills, // Direct assignment since skills is already in the correct format
      advancements: {
        characteristics: advancements?.characteristics || {},
        skills: advancements?.skills || {}
      },
      weapons,
      wargear,
      special_rules: special_rules || [],
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
    };
  }, [
    id, name, type, fighter_class, fighter_sub_type, credits, movement, weapon_skill,
    ballistic_skill, strength, toughness, wounds, initiative,
    attacks, leadership, cool, willpower, intelligence, xp,
    kills, advancements, weapons, wargear, special_rules, effects, skills
  ]);

  // Replace adjustedStats with modifiedStats
  const adjustedStats = useMemo(() => calculateAdjustedStats(fighterData), [fighterData]);

  // Update stats calculation to use modifiedStats
  const stats = useMemo((): StatsType => {
    if (isCrew) {
      return {
        'M': vehicleStats ? `${vehicleStats.movement}"` : '*',
        'Front': vehicleStats ? vehicleStats.front : '*',
        'Side': vehicleStats ? vehicleStats.side : '*',
        'Rear': vehicleStats ? vehicleStats.rear : '*',
        'HP': vehicleStats ? vehicleStats.hull_points : '*',
        'Hnd': vehicleStats ? `${vehicleStats.handling}+` : '*',
        'Sv': vehicleStats ? `${vehicleStats.save}+` : '*',
        'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
        'Ld': `${adjustedStats.leadership}+`,
        'Cl': `${adjustedStats.cool}+`,
        'Wil': `${adjustedStats.willpower}+`,
        'Int': `${adjustedStats.intelligence}+`,
        'XP': xp
      };
    }
    
    return {
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
      'XP': xp
    };
  }, [isCrew, vehicleStats, adjustedStats, xp]);

  const isInactive = killed || retired || enslaved || recovery;

  // Determine a unique and valid id for the fighter card based on its status.
  // The combined state 'is_inactive_and_recovery' takes precedence over the individual states.
  const fighterCardId =
    isInactive && recovery
      ? 'is_inactive_and_recovery' // If both `isInactive` and `recovery` are true, the id will be 'is_inactive_and_recovery'.
      : isInactive
      ? 'is_inactive' // If only `isInactive` is true, the id will be 'is_inactive'.
      : recovery
      ? 'is_recovery' // If only `recovery` is true, the id will be 'is_recovery'.
      : undefined;


  useEffect(() => {
    const checkHeight = () => {
      if (contentRef.current) {
        setTimeout(() => {
          const contentHeight = contentRef.current?.clientHeight || 0;
          const contentWidth = contentRef.current?.clientWidth || 0;
          const text = contentRef.current?.textContent || '';
          const shouldBeMultiline = contentHeight > 24 && text.length > (contentWidth / 8);
          setIsMultiline(shouldBeMultiline);
        }, 0);
      }
    };

    const observer = new MutationObserver(checkHeight);

    if (contentRef.current) {
      observer.observe(contentRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }

    checkHeight();
    window.addEventListener('resize', checkHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkHeight);
    };
  }, [special_rules]);

  const cardContent = (
    <div
      id={fighterCardId}
      className={`relative rounded-lg overflow-hidden shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border-2 border-black print:hover:scale-[1] print:print-fighter-card print:inline-block
        ${viewMode === 'normal' ? 'p-4' : `${sizeStyles[viewMode]} p-2 flex-shrink-0`}`}
        style={{
          backgroundImage: "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1747057650/fighter-card-background-4-web_pm2scj.avif')",
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
      <div className={`flex ${viewMode === 'normal' ? 'mb-[80px]' : 'mb-[80px]'}`}>
        <div className="flex w-full">
          <div
            className={`absolute inset-0 bg-no-repeat bg-cover print:!bg-none ${viewMode === 'normal' ? 'mt-4' : 'mt-2'}`}
            style={{
              backgroundImage: "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1735986017/top-bar-stroke-v3_s97f2k.png')",
              width: '100%',
              height: '65px',
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
                  {alliance_crew_name && ` - ${alliance_crew_name}`}
                  {fighter_class && ` (${fighter_class})`}
                  {fighter_sub_type && fighter_sub_type.fighter_sub_type ? `, ${fighter_sub_type.fighter_sub_type}` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={`absolute right-0 md:mr-4 mr-2 md:top-[-8px] top-0 flex items-center z-20 ${viewMode === 'normal' ? 'mt-4' : 'mt-2'}`}>
          <div className="relative flex flex-col flex-shrink gap-0 z-11 mr-1 my-2 text-2xl max-h-[60px] flex-wrap place-content-center">
            {killed && <IoSkull className="text-gray-300" />}
            {retired && <MdChair className="text-gray-600" />}
            {enslaved && <GiCrossedChains className="text-sky-200" />}
            {starved && <TbMeatOff className="text-red-500" />}
            {recovery && <FaMedkit className="text-blue-500" />}
          </div>
          {/* Render image if image_url is present, before credits box */}
          {image_url && (
            <div className="bg-black rounded-full shadow-md border-4 border-black md:size-[85px] size-[64px] relative z-10 print:bg-white print:shadow-none overflow-hidden flex-shrink-0">
              <img src={image_url} alt="Fighter" className="object-cover rounded-full" />
            </div>
          )}
          {!isInactive && (
            <div className="bg-[#F0F0F0] rounded-full shadow-md border-4 border-black flex flex-col items-center justify-center md:size-[85px] size-[64px] flex-shrink-0 relative z-10 print:bg-white print:shadow-none">
              <span className="leading-6 font-bold md:text-3xl text-2xl">{credits === 0 ? '*' : credits}</span>
              <span className="leading-3 md:font-bold text-xs">Credits</span>
            </div>
          )}
        </div>
      </div>
        
      {!isInactive && (
        <>
          <div>
            <StatsTable data={stats} isCrew={isCrew} viewMode={viewMode} />
          </div>

          {/* Show owner information for owned fighters */}
          {owner_name && (
            <div className={`${viewMode === 'normal' ? 'mt-2' : 'mt-1'} text-left`}>
              <div className="text-sm text-black">
                Owned by <span className="font-semibold">{owner_name}</span>
              </div>
            </div>
          )}

          {/* Show fighter weapons */}
          {!isCrew && weapons && weapons.length > 0 && (
            <div className={`${owner_name ? 'mt-0' : (viewMode === 'normal' ? 'mt-2' : 'mt-0')}`}>
              <WeaponTable weapons={weapons} viewMode={viewMode}/>
            </div>
          )}

          {/* Show crew weapons */}
          {isCrew && weapons && weapons.length > 0 && (
            <div className={`${owner_name ? 'mt-0' : (viewMode === 'normal' ? 'mt-2' : 'mt-0')}`}>
              <WeaponTable weapons={weapons} entity="crew" viewMode={viewMode} />
            </div>
          )}

          {/* Add vehicle weapons section */}
          {isCrew && vehicleWeapons.length > 0 && (
            <div className={`${viewMode === 'normal' ? 'mt-2' : 'mt-0'}`}>
              <WeaponTable weapons={vehicleWeapons} entity="vehicle" viewMode={viewMode} />
            </div>
          )}

          <div className={`grid gap-y-2 mt-3 ${isMultiline ? 'grid-cols-[4.5rem,1fr]' : 'grid-cols-[6rem,1fr]'} print:gap-y-0`}>
            {isCrew && vehicle && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Vehicle</div>
                <div className="min-w-[0px] text-sm break-words">
                  {vehicle?.vehicle_name ?? 'Unknown'} - {vehicle?.vehicle_type ?? 'Unknown'}
                </div>

                {vehicleUpgrades && vehicleUpgrades.length > 0 && (
                  <>
                    <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Equipment</div>
                    <div className="min-w-[0px] text-sm break-words">
                      {Object.entries(
                        vehicleUpgrades
                          .slice()
                          .sort((a, b) => (a.equipment_name || '').localeCompare(b.equipment_name || ''))
                          .reduce<Record<string, number>>((acc, item) => {
                            const name = item.equipment_name || '';
                            acc[name] = (acc[name] || 0) + 1;
                            return acc;
                          }, {})
                      )
                        .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                        .join(', ')}
                    </div>
                  </>
                )}

                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Vehicle Rules</div>
                <div className="min-w-[0px] text-sm break-words">
                  {Array.isArray(vehicle?.special_rules) ? vehicle.special_rules.join(', ') : ''}
                </div>

                {/* Vehicle effect, lasting damage */}
                {vehicle.effects && vehicle.effects["lasting damages"] && vehicle.effects["lasting damages"].length > 0 && (
                  <>
                    <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Damage</div>
                    <div className="min-w-[0px] text-sm break-words">
                      {Object.entries(
                        vehicle.effects["lasting damages"]
                          .slice()
                          .sort((a, b) => {
                            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                            return dateA - dateB;
                          })
                          .reduce<Record<string, number>>((acc, damage) => {
                            acc[damage.effect_name] = (acc[damage.effect_name] || 0) + 1;
                            return acc;
                          }, {})
                      )
                        .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                        .join(', ')}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Horizontal bar: only visible when both sections are present */}
            {isCrew && vehicle &&
              (
                ((special_rules?.length ?? 0) > 0) ||
                ((wargear?.length ?? 0) > 0) ||
                (advancements?.skills && Object.keys(advancements.skills).length > 0) ||
                free_skill
              ) && (
                <>
                  <div className="min-w-[0px] font-bold text-sm pr-4 border-t border-gray-400"></div>
                  <div className="border-t border-gray-400" />
                </>
              )
            }

            {wargear && wargear.length > 0 && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Wargear</div>
                <div className="min-w-[0px] text-sm break-words">
                  {Object.entries(
                    wargear
                      .slice() // avoid mutating original array
                      .sort((a, b) => a.wargear_name.localeCompare(b.wargear_name))
                      .reduce<Record<string, number>>((acc, item) => {
                        acc[item.wargear_name] = (acc[item.wargear_name] || 0) + 1;
                        return acc;
                      }, {}))
                    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                    .join(', ')}
                </div>
              </>
            )}

            {/* Display skills from both advancements and the new skills structure */}
            {((advancements?.skills && Object.keys(advancements.skills).length > 0) ||
              (skills && Object.keys(skills).length > 0) ||
              free_skill) && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Skills</div>
                <div className="min-w-[0px] text-sm break-words">
                  {(() => {
                    const skillNames = [
                      ...(advancements?.skills ? Object.keys(advancements.skills) : []),
                      ...(skills ? Object.keys(skills) : [])
                    ].filter(Boolean);
                    const skillsText = skillNames.sort((a, b) => a.localeCompare(b)).join(', ');
                    return (
                      <>
                        {skillsText}
                        {free_skill && (
                          <div className="flex items-center gap-2 text-amber-700 mt-1">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="w-4 h-4"
                            >
                              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                            Starting skill missing.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {special_rules && special_rules.length > 0 && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4">
                  {isMultiline ? (
                    <>
                      Special<br />Rules
                    </>
                  ) : (
                    <span className="whitespace-nowrap">Special Rules</span>
                  )}
                </div>
                <div className="min-w-[0px] text-sm break-words">
                  {special_rules.join(', ')}
                </div>
              </>
            )}

            {effects && effects.injuries && effects.injuries.length > 0 && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Injuries</div>
                <div className="min-w-[0px] text-sm break-words">
                  {Object.entries(
                    effects.injuries
                      .slice()
                      .sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return dateA - dateB;
                      })
                      .reduce<Record<string, number>>((acc, injury) => {
                        acc[injury.effect_name] = (acc[injury.effect_name] || 0) + 1;
                        return acc;
                      }, {})
                  )
                    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                    .join(', ')}
                </div>
              </>
            )}

            {note && (
              <>
                <div className="min-w-[0px] font-bold text-sm pr-4 whitespace-nowrap">Notes</div>
                <div className="min-w-[0px] text-sm break-words">{note}</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
  //this link check is needed to prevent the card from being clickable when it's being dragged. Unless there is some other way to do this?
  return disableLink ? cardContent : (
    <Link href={`/fighter/${id}`}>
      {cardContent}
    </Link>
  );
});

export default FighterCard;
