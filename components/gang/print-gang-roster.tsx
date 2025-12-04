"use client";

import { FighterProps, Vehicle, FighterEffect } from "@/types/fighter";
import { Equipment } from "@/types/equipment";
import { VehicleEquipment } from "@/types/fighter";
import { calculateAdjustedStats } from "@/utils/effect-modifiers";
import WeaponTable from "./fighter-card-weapon-table";
import { Weapon } from "@/types/weapon";
import { StatsTable, StatsType } from "../ui/fighter-card-stats-table";
import { MdCheckBoxOutlineBlank } from "react-icons/md";

interface GangRosterProps {
  gang: {
    id: string;
    name: string;
    gang_type: string;
    gang_type_id: string;
    gang_type_image_url: string;
    gang_colour: string | null;
    credits: number | null;
    reputation: number | null;
    meat: number | null;
    scavenging_rolls: number | null;
    exploration_points: number | null;
    power: number | null;
    sustenance: number | null;
    salvage: number | null;
    rating: number | null;
    wealth: number | null;
    alignment: string;
    alliance_name: string | null;
    gang_affiliation_name: string | null;
    created_at: string | Date | null;
    last_updated: string | Date | null;
    fighters: FighterProps[];
    stash: any[];
    campaigns: any[];
    gang_variants: Array<{ id: string; variant: string }>;
    username?: string;
    hidden: boolean;
    positioning: Record<number, string>;
  };
}

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

  // Apply modifiers from vehicle effects (lasting damages, vehicle upgrades, and user adjustments)
  if (baseStats.effects) {
    const effectCategories = ["lasting damages", "vehicle upgrades", "user"];
    effectCategories.forEach((categoryName) => {
      if (baseStats.effects && baseStats.effects[categoryName]) {
        baseStats.effects[categoryName].forEach((effect: FighterEffect) => {
          if (
            effect.fighter_effect_modifiers &&
            Array.isArray(effect.fighter_effect_modifiers)
          ) {
            effect.fighter_effect_modifiers.forEach((modifier) => {
              // Convert stat_name to lowercase to match our stats object keys
              const statName = modifier.stat_name.toLowerCase();

              // Skip slot modifiers - these are used for counting occupied slots, not increasing max slots
              if (
                statName === "body_slots" ||
                statName === "drive_slots" ||
                statName === "engine_slots"
              ) {
                return;
              }

              // Only apply if the stat exists in our stats object
              if (statName in stats) {
                // Apply the numeric modifier to the appropriate stat
                stats[statName as keyof typeof stats] +=
                  modifier.numeric_value;
              }
            });
          }
        });
      }
    });
  }

  return stats;
};

export default function GangRoster({ gang }: GangRosterProps) {
  const {
    name,
    gang_type,
    credits,
    rating,
    wealth,
    reputation,
    alliance_name,
    gang_affiliation_name,
    fighters,
    positioning,
    gang_variants,
  } = gang;

  // Order fighters by positioning and filter to active ones
  const positionMap: Record<string, number> = {};
  Object.entries(positioning || {}).forEach(([pos, fighterId]) => {
    positionMap[fighterId] = Number(pos);
  });

  const sortedFighters = [...fighters]
    .filter(
      (f) => !f.killed && !f.enslaved && !f.retired && !f.captured, // active only
    )
    .sort((a, b) => {
      const posA = positionMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const posB = positionMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-white text-black border border-black print:border-0">
        {/* Header */}
        <div className="border-b border-black px-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-tight">{name}</h1>
              <span className="text-xs uppercase tracking-wide">
                {gang_type}
                {gang_variants && gang_variants.length > 0
                  ? ` (${gang_variants.map((v) => v.variant).join(", ")})`
                  : ""}
              </span>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Credits:</span>
                <span>{credits ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Rating:</span>
                <span>{rating ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Wealth:</span>
                <span>{wealth ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Reputation:</span>
                <span>{reputation ?? 0}</span>
              </div>
            </div>
          </div>
          {alliance_name && (
            <p className="text-xs uppercase tracking-wide">
              Alliance: {alliance_name}
            </p>
          )}
          {gang_affiliation_name && (
            <p className="text-xs uppercase tracking-wide">
              {gang_affiliation_name}
            </p>
          )}
        </div>

        {/* Fighters table */}
        <div>
          <style>{`
            .roster-weapons-table colgroup col:first-child {
              width: 80px !important;
            }
            .roster-weapons-table table td:first-child,
            .roster-weapons-table table th:first-child {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              max-width: 80px;
            }
          `}</style>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="border border-black px-1 py-1 text-center w-6">ID</th>
                <th className="border border-black px-1 py-1 text-left w-[280px]">
                  Name
                </th>
                <th className="border border-black px-1 py-1 text-center w-[300px]">
                  Weapons
                </th>
                <th className="border border-black px-1 py-1 text-left w-[260px]">
                  Wargear, Injuries & XP
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFighters.map((fighter, index) => {
                const adjustedStats = calculateAdjustedStats(fighter);
                const isCrew = fighter.fighter_class === "Crew";
                const vehicle = fighter.vehicles && fighter.vehicles.length > 0 
                  ? (fighter.vehicles[0] as unknown as Vehicle)
                  : undefined;
                const vehicleStats = isCrew ? calculateVehicleStats(vehicle, vehicle?.equipment || []) : null;

                const wargearText =
                  fighter.wargear && fighter.wargear.length > 0
                    ? fighter.wargear
                        .slice()
                        .sort((a, b) =>
                          a.wargear_name.localeCompare(b.wargear_name),
                        )
                        .map((w) => w.wargear_name)
                        .join(", ")
                    : "";

                const skillNames: string[] = [];
                if (fighter.advancements?.skills) {
                  skillNames.push(...Object.keys(fighter.advancements.skills));
                }
                if (fighter.skills) {
                  skillNames.push(...Object.keys(fighter.skills));
                }
                const skillsText =
                  skillNames.length > 0
                    ? Array.from(new Set(skillNames))
                        .sort((a, b) => a.localeCompare(b))
                        .join(", ")
                    : "";

                const injuriesText =
                  fighter.effects?.injuries && fighter.effects.injuries.length > 0
                    ? Object.entries(
                        fighter.effects.injuries
                          .slice()
                          .sort((a, b) => {
                            const dA = a.created_at
                              ? new Date(a.created_at).getTime()
                              : 0;
                            const dB = b.created_at
                              ? new Date(b.created_at).getTime()
                              : 0;
                            return dA - dB;
                          })
                          .reduce<Record<string, number>>((acc, injury) => {
                            acc[injury.effect_name] =
                              (acc[injury.effect_name] || 0) + 1;
                            return acc;
                          }, {}),
                      )
                        .map(([name, count]) =>
                          count > 1 ? `${name} (x${count})` : name,
                        )
                        .join(", ")
                    : "";

                const specialRulesText =
                  fighter.special_rules && fighter.special_rules.length > 0
                    ? fighter.special_rules.join(", ")
                    : "";

                const vehicleRulesText =
                  isCrew && vehicle && Array.isArray(vehicle.special_rules) && vehicle.special_rules.length > 0
                    ? vehicle.special_rules.join(", ")
                    : "";

                // Get vehicle equipment (excluding weapons, which are shown in the Weapons column)
                const vehicleEquipmentText =
                  isCrew && vehicle && vehicle.equipment && vehicle.equipment.length > 0
                    ? Object.entries(
                        vehicle.equipment
                          .filter(
                            (item): item is Equipment & Partial<VehicleEquipment> =>
                              (item.equipment_type === 'vehicle_upgrade' || item.equipment_type === 'wargear')
                          )
                          .slice()
                          .sort((a, b) => (a.equipment_name || '').localeCompare(b.equipment_name || ''))
                          .reduce<Record<string, number>>((acc, item) => {
                            const name = item.equipment_name || '';
                            acc[name] = (acc[name] || 0) + 1;
                            return acc;
                          }, {})
                      )
                        .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                        .join(", ")
                    : "";

                // Get vehicle lasting damages (for crew members)
                const vehicleLastingDamagesText =
                  isCrew && vehicle && vehicle.effects && vehicle.effects["lasting damages"] && vehicle.effects["lasting damages"].length > 0
                    ? Object.entries(
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
                        .join(", ")
                    : "";

                // Get rig glitches (for fighters)
                const rigGlitchesText =
                  fighter.effects && fighter.effects['rig-glitches'] && fighter.effects['rig-glitches'].length > 0
                    ? Object.entries(
                        fighter.effects['rig-glitches']
                          .slice()
                          .sort((a, b) => {
                            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                            return dateA - dateB;
                          })
                          .reduce<Record<string, number>>((acc, glitch) => {
                            acc[glitch.effect_name] = (acc[glitch.effect_name] || 0) + 1;
                            return acc;
                          }, {})
                      )
                        .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
                        .join(", ")
                    : "";

                // Create stats object for StatsTable component (same format as fighter-card.tsx, but without XP)
                const stats = (isCrew
                  ? {
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
                      'Int': `${adjustedStats.intelligence}+`
                    }
                  : {
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
                      'Int': `${adjustedStats.intelligence}+`
                    }) as StatsType;

                return (
                  <tr key={fighter.id}>
                    <td className="border border-black px-1 py-1 text-center align-top">
                      {index + 1}
                    </td>
                    <td className="border border-black px-1 py-1 align-top max-w-[280px]">
                       <div className="flex justify-between gap-2">
                         <div className="font-semibold text-[10px]">
                           {fighter.fighter_name}
                         </div>
                         <div className="text-[10px] font-semibold whitespace-nowrap">
                           Rating: {fighter.credits ?? 0}
                         </div>
                       </div>
                       <div className="text-[9px] mt-[1px] flex items-center justify-between gap-2">
                         <div>
                           {fighter.fighter_type}
                           {fighter.fighter_class
                             ? ` • ${fighter.fighter_class}`
                             : ""}
                         </div>
                         {/* W/FW boxes */}
                         {!isCrew && (adjustedStats.wounds > 1 || adjustedStats.toughness > 1) && (
                           <div className="flex items-center gap-2 text-[9px] flex-shrink-0">
                             {adjustedStats.wounds > 1 && (
                               <div className="flex items-center gap-1">
                                 <span className="font-semibold whitespace-nowrap">W:</span>
                                 <div className="flex items-center gap-0.5">
                                   {Array.from({ length: adjustedStats.wounds - 1 }).map((_, i) => (
                                     <MdCheckBoxOutlineBlank key={`w-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                                   ))}
                                 </div>
                               </div>
                             )}
                             {adjustedStats.toughness > 1 && (
                               <div className="flex items-center gap-1">
                                 <span className="font-semibold whitespace-nowrap">FW:</span>
                                 <div className="flex items-center gap-0.5">
                                   {Array.from({ length: adjustedStats.toughness - 1 }).map((_, i) => (
                                     <MdCheckBoxOutlineBlank key={`fw-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                                   ))}
                                 </div>
                               </div>
                             )}
                           </div>
                         )}
                         {isCrew && (
                           <div className="flex items-center gap-2 text-[9px] flex-shrink-0">
                             <div className="flex items-center gap-1">
                               <span className="font-semibold whitespace-nowrap">W:</span>
                               <div className="flex items-center gap-0.5">
                                 {Array.from({ length: 3 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`w-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1">
                               <span className="font-semibold whitespace-nowrap">FW:</span>
                               <div className="flex items-center gap-0.5">
                                 {Array.from({ length: 3 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`fw-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                                 ))}
                               </div>
                             </div>
                           </div>
                         )}
                       </div>
                       <div className="mt-1 [&_table]:text-[9px] [&_th]:text-[9px] [&_td]:text-[9px]">
                         <StatsTable data={stats} isCrew={isCrew} viewMode="small" />
                       </div>
                       {skillsText && (
                         <div className="mt-1 text-[10px]">
                           <span className="font-semibold">Skills:</span>{" "}
                           <span>{skillsText}</span>
                         </div>
                       )}
                    </td>
                    <td className="border border-black px-1 py-1 align-top w-[300px]">
                      {(() => {
                        // Get vehicle weapons for crew members (same logic as fighter-card.tsx)
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
                            })) as unknown as any[];
                        };

                        const vehicleWeapons = isCrew && vehicle ? getVehicleWeapons(vehicle) : [];

                        // Show fighter weapons
                        if (!isCrew && fighter.weapons && fighter.weapons.length > 0) {
                          return (
                            <div className="roster-weapons-table [&_table]:text-[9px] [&_th]:text-[9px] [&_td]:text-[9px]">
                              <WeaponTable weapons={fighter.weapons} viewMode="large" />
                            </div>
                          );
                        }

                        // Show crew weapons
                        if (isCrew && fighter.weapons && fighter.weapons.length > 0) {
                          return (
                            <div className="roster-weapons-table [&_table]:text-[9px] [&_th]:text-[9px] [&_td]:text-[9px]">
                              <WeaponTable weapons={fighter.weapons} entity="crew" viewMode="large" />
                            </div>
                          );
                        }

                        // Show vehicle weapons for crew
                        if (isCrew && vehicleWeapons.length > 0) {
                          return (
                            <div className="roster-weapons-table [&_table]:text-[9px] [&_th]:text-[9px] [&_td]:text-[9px]">
                              <WeaponTable weapons={vehicleWeapons} entity="vehicle" viewMode="small" />
                            </div>
                          );
                        }

                        return <span className="text-[9px]">—</span>;
                      })()}
                    </td>
                    <td className="border border-black px-1 py-1 align-top">
                       <div className="space-y-[2px] text-[10px]">
                         {wargearText && (
                           <div>
                             <span className="font-semibold">Wargear:</span>{" "}
                             <span>{wargearText}</span>
                           </div>
                         )}
                         {vehicleEquipmentText && (
                           <div>
                             <span className="font-semibold">Vehicle Equipment:</span>{" "}
                             <span>{vehicleEquipmentText}</span>
                           </div>
                         )}
                         {vehicleRulesText && (
                           <div>
                             <span className="font-semibold">Vehicle Rules:</span>{" "}
                             <span>{vehicleRulesText}</span>
                           </div>
                         )}
                         {vehicleLastingDamagesText && (
                           <div>
                             <span className="font-semibold">Damage:</span>{" "}
                             <span>{vehicleLastingDamagesText}</span>
                           </div>
                         )}
                         {specialRulesText && (
                           <div>
                             <span className="font-semibold">Rules:</span>{" "}
                             <span>{specialRulesText}</span>
                           </div>
                         )}
                         {rigGlitchesText && (
                           <div>
                             <span className="font-semibold">Rig Glitches:</span>{" "}
                             <span>{rigGlitchesText}</span>
                           </div>
                         )}
                         {injuriesText && (
                           <div>
                             <span className="font-semibold">Injuries:</span>{" "}
                             <span>{injuriesText}</span>
                           </div>
                         )}
                         {!wargearText && !vehicleEquipmentText && !vehicleLastingDamagesText && !rigGlitchesText && !skillsText && !injuriesText && !specialRulesText && !vehicleRulesText && (
                           <div>—</div>
                         )}
                         {/* XP boxes */}
                         <div className="mt-4 grid gap-x-1 grid-cols-3 text-[9px]">
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">SI</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               {Array.from({ length: 6 }).map((_, i) => (
                                 <MdCheckBoxOutlineBlank key={`si-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                               ))}
                             </div>
                           </div>
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">OOA</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               {Array.from({ length: 6 }).map((_, i) => (
                                 <MdCheckBoxOutlineBlank key={`ooa-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                               ))}
                             </div>
                           </div>
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">R/A</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               {Array.from({ length: 5 }).map((_, i) => (
                                 <MdCheckBoxOutlineBlank key={`rally-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                               ))}
                             </div>
                           </div>
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">Ld/Ch</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               {Array.from({ length: 5 }).map((_, i) => (
                                 <MdCheckBoxOutlineBlank key={`leader-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                               ))}
                             </div>
                           </div>
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">Misc</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               {Array.from({ length: 6 }).map((_, i) => (
                                 <MdCheckBoxOutlineBlank key={`misc-${i}`} className="text-black w-2 h-2 flex-shrink-0" />
                               ))}
                             </div>
                           </div>
                           <div className="flex items-center gap-1 min-w-0">
                             <span className="font-semibold whitespace-nowrap flex-shrink-0">Participation</span>
                             <div className="flex items-center gap-0.5 flex-shrink-0">
                               <MdCheckBoxOutlineBlank key="xp-fielded" className="text-black w-2 h-2 flex-shrink-0" />
                             </div>
                           </div>
                         </div>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
