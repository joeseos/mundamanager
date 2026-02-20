"use client";

import { useState } from "react";
import Link from "next/link";
import { FighterProps, Vehicle, FighterEffect } from "@/types/fighter";
import { Equipment } from "@/types/equipment";
import { VehicleEquipment } from "@/types/fighter";
import { calculateAdjustedStats } from "@/utils/effect-modifiers";
import WeaponTable from "./fighter-card-weapon-table";
import { StatsTable, StatsType } from "../ui/fighter-card-stats-table";
import { MdCheckBoxOutlineBlank } from "react-icons/md";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import FighterCard from "./fighter-card";
import { Badge } from "@/components/ui/badge";
import { GiAncientRuins } from "react-icons/gi";
import { PatreonSupporterIcon } from "@/components/ui/patreon-supporter-icon";

interface PrintGangProps {
  gang: {
    id: string;
    name: string;
    gang_type: string;
    gang_type_id: string;
    gang_type_image_url: string;
    image_url?: string;
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
    patreon_tier_id?: string;
    patreon_tier_title?: string;
    hidden: boolean;
    positioning: Record<number, string>;
    note?: string;
    /** Pre-filtered list with only active loadout per fighter (computed on server) */
    fightersActiveLoadoutOnly?: FighterProps[];
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

export default function PrintGang({ gang }: PrintGangProps) {
  const {
    name,
    gang_type,
    gang_type_image_url,
    image_url,
    credits,
    rating,
    wealth,
    reputation,
    alignment,
    alliance_name,
    gang_affiliation_name,
    fighters,
    positioning,
    gang_variants,
    stash,
    campaigns,
    note,
    fightersActiveLoadoutOnly = [],
    username,
    patreon_tier_id,
    patreon_tier_title,
    created_at,
    last_updated,
  } = gang;

  // View mode state: "roster" for table view, "cards" for card-based view
  const [viewMode, setViewMode] = useState<"roster" | "cards">("cards");

  // Print style state: "eco" for minimal ink, "fancy" for decorated backgrounds
  const [printStyle, setPrintStyle] = useState<"eco" | "fancy">("eco");

  // Date formatting helper
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate active fighters (gang size) - exclude dead and retired
  const activeFighters = fighters.filter(f => !f.killed && !f.retired);

  // Get campaign resources from first campaign
  const campaignResources = campaigns?.[0]?.resources || [];

  // Print options state
  const [showFightersInRecovery, setShowFightersInRecovery] = useState(false);
  const [showInactiveFighters, setShowInactiveFighters] = useState(false);
  const [showXPBoxes, setShowXPBoxes] = useState(false);
  const [showWFWBoxes, setShowWFWBoxes] = useState(false);
  const [showGangCard, setShowGangCard] = useState(true);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(true);
  const [showInactiveFighterLoadouts, setShowInactiveFighterLoadouts] = useState(false);
  const [cardsGangCardsPosition, setCardsGangCardsPosition] = useState<"before" | "after">("before");

  // Handle print with style
  const handlePrint = () => {
    if (printStyle === 'fancy') {
      document.body.classList.add('fancy-print');
    } else {
      document.body.classList.remove('fancy-print');
    }

    setTimeout(() => {
      window.print();
      document.body.classList.remove('fancy-print');
    }, 100);
  };

  // Order fighters by positioning and filter based on options
  const positionMap: Record<string, number> = {};
  Object.entries(positioning || {}).forEach(([pos, fighterId]) => {
    positionMap[fighterId] = Number(pos);
  });

  // Use pre-filtered list when "Inactive Fighters Loadouts" is off (server-side filter is reliable)
  const sourceFighters =
    !showInactiveFighterLoadouts && fightersActiveLoadoutOnly.length > 0
      ? fightersActiveLoadoutOnly
      : fighters;

  const sortedFighters = [...sourceFighters]
    .filter((f) => {
      // Filter out inactive fighters if option is disabled
      if (!showInactiveFighters && (f.killed || f.enslaved || f.retired)) {
        return false;
      }
      // Filter out fighters in recovery if option is disabled
      if (!showFightersInRecovery && f.recovery) {
        return false;
      }
      // If both options are disabled, only show active fighters (not killed, not enslaved, not retired, not captured, not in recovery)
      if (!showInactiveFighters && !showFightersInRecovery) {
        return !f.killed && !f.enslaved && !f.retired && !f.recovery;
      }
      return true;
    })
    .sort((a, b) => {
      const posA = positionMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const posB = positionMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;
      const loadoutIdA = (a as { active_loadout_id?: string }).active_loadout_id ?? "";
      const loadoutIdB = (b as { active_loadout_id?: string }).active_loadout_id ?? "";
      return loadoutIdA.localeCompare(loadoutIdB);
    });

  return (
    <div className="min-h-screen print:min-h-0 text-foreground w-full">
      <div className="bg-card rounded-lg shadow-md p-4 mb-6 print:hidden print:mb-0">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-xl md:text-2xl font-bold mb-2">Print Options</h2>
          </div>
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
            <strong>Note:</strong> Displayed size on this page is indicative only. You can change the scale of your print in your printer settings.
          </div>
          <div className="flex flex-col gap-4">
            {/* View Mode Toggle */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">View Mode</span>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "cards" ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setViewMode("cards")}
                >
                  Cards
                </Button>
                <Button
                  variant={viewMode === "roster" ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setViewMode("roster")}
                >
                  Roster
                </Button>
              </div>
            </div>
            
            {/* Print Style Selector (Cards view only) */}
            {viewMode === "cards" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Print style</p>
                <div className="flex flex-col gap-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                      printStyle === 'eco' ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="print-style"
                      value="eco"
                      checked={printStyle === 'eco'}
                      onChange={() => setPrintStyle('eco')}
                      className="mt-1 sr-only"
                    />
                    <div>
                      <div className="text-sm font-medium">Eco</div>
                      <div className="text-xs text-muted-foreground">Hide decorative backgrounds to save ink.</div>
                    </div>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                      printStyle === 'fancy' ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="print-style"
                      value="fancy"
                      checked={printStyle === 'fancy'}
                      onChange={() => setPrintStyle('fancy')}
                      className="mt-1 sr-only"
                    />
                    <div>
                      <div className="text-sm font-medium">Fancy</div>
                      <div className="text-xs text-muted-foreground">Include illustrated card backgrounds when printing.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
  
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Include the following:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {viewMode === "cards" && (
                  <>
                    <div className="md:col-span-2 flex items-center gap-3">
                      <p className="text-sm whitespace-nowrap">Cards layout</p>
                      <select
                        value={cardsGangCardsPosition}
                        onChange={(e) => setCardsGangCardsPosition(e.target.value as "before" | "after")}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="before">Gang cards before fighters</option>
                        <option value="after">Gang cards after fighters</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={showGangCard}
                        onCheckedChange={(checked) => setShowGangCard(checked === true)}
                      />
                      <span className="text-sm">Gang Card</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={showAdditionalDetails}
                        onCheckedChange={(checked) => setShowAdditionalDetails(checked === true)}
                      />
                      <span className="text-sm">Additional Details</span>
                    </label>
                  </>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showFightersInRecovery}
                    onCheckedChange={(checked) => setShowFightersInRecovery(checked === true)}
                  />
                  <span className="text-sm">Fighters in Recovery</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showInactiveFighters}
                    onCheckedChange={(checked) => setShowInactiveFighters(checked === true)}
                  />
                  <span className="text-sm">Inactive Fighters (Killed/Retired/Enslaved)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showInactiveFighterLoadouts}
                    onCheckedChange={(checked) => setShowInactiveFighterLoadouts(checked === true)}
                  />
                  <span className="text-sm">Inactive Fighters Loadouts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showXPBoxes}
                    onCheckedChange={(checked) => setShowXPBoxes(checked === true)}
                  />
                  <span className="text-sm">XP Boxes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showWFWBoxes}
                    onCheckedChange={(checked) => setShowWFWBoxes(checked === true)}
                  />
                  <span className="text-sm">Wounds/Flesh Wounds Boxes</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline_cancel" asChild>
              <Link href={`/gang/${gang.id}`}>Cancel</Link>
            </Button>
            <Button
              onClick={handlePrint}
              className="bg-neutral-900 text-white hover:bg-gray-800"
            >
              Print
            </Button>
          </div>
        </div>
      </div>
      {/* Roster View */}
      {viewMode === "roster" && (
        <div className="min-w-fit bg-white text-black border border-black print:border-0 print-gang-roster"
            style={{
              colorScheme: "light",
              ["--background" as any]: "var(--light-background)",
              ["--foreground" as any]: "var(--light-foreground)",
              ["--card" as any]: "var(--light-card)",
              ["--card-foreground" as any]: "var(--light-card-foreground)",
              ["--popover" as any]: "var(--light-popover)",
              ["--popover-foreground" as any]: "var(--light-popover-foreground)",
              ["--primary" as any]: "var(--light-primary)",
              ["--primary-foreground" as any]: "var(--light-primary-foreground)",
              ["--secondary" as any]: "var(--light-secondary)",
              ["--secondary-foreground" as any]: "var(--light-secondary-foreground)",
              ["--muted" as any]: "var(--light-muted)",
              ["--muted-foreground" as any]: "var(--light-muted-foreground)",
              ["--accent" as any]: "var(--light-accent)",
              ["--accent-foreground" as any]: "var(--light-accent-foreground)",
              ["--destructive" as any]: "var(--light-destructive)",
              ["--destructive-foreground" as any]: "var(--light-destructive-foreground)",
              ["--border" as any]: "var(--light-border)",
              ["--input" as any]: "var(--light-input)",
              ["--ring" as any]: "var(--light-ring)",
            }} // Enforce light theme colors for Cards View
          >
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
              max-width: 80px !important;
            }
            .roster-weapons-table table td:first-child,
            .roster-weapons-table table th:first-child {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              max-width: 80px;
            }
          `}</style>
          <table className="w-full table-fixed text-[10px] ">
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

                const fighterRowKey = `${fighter.id}-${(fighter as { active_loadout_id?: string }).active_loadout_id ?? 'default'}`;
                return (
                  <tr key={fighterRowKey}>
                    <td className="border border-black px-1 py-1 text-center align-top">
                      {index + 1}
                    </td>
                    <td className="border border-black px-1 py-1 align-top max-w-[280px]">
                       <div className="flex justify-between gap-2">
                         <div className="font-semibold text-[10px]">
                           {fighter.fighter_name}
                           {(fighter as { active_loadout_name?: string }).active_loadout_name
                             ? ` (${(fighter as { active_loadout_name?: string }).active_loadout_name})`
                             : ""}
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
                         {showWFWBoxes && (
                           <div>
                             {!isCrew && (adjustedStats.wounds > 1 || adjustedStats.toughness > 1) && (
                               <div className="flex items-center gap-2 text-[9px] shrink-0">
                                 {adjustedStats.wounds > 1 && (
                                   <div className="flex items-center gap-1">
                                     <span className="font-semibold whitespace-nowrap">W</span>
                                     <div className="flex items-center gap-0.5">
                                       {Array.from({ length: adjustedStats.wounds - 1 }).map((_, i) => (
                                         <MdCheckBoxOutlineBlank key={`w-${i}`} className="text-black w-2 h-2 shrink-0" />
                                       ))}
                                     </div>
                                   </div>
                                 )}
                                 {adjustedStats.toughness > 1 && (
                                   <div className="flex items-center gap-1">
                                     <span className="font-semibold whitespace-nowrap">FW</span>
                                     <div className="flex items-center gap-0.5">
                                       {Array.from({ length: adjustedStats.toughness - 1 }).map((_, i) => (
                                         <MdCheckBoxOutlineBlank key={`fw-${i}`} className="text-black w-2 h-2 shrink-0" />
                                       ))}
                                     </div>
                                   </div>
                                 )}
                               </div>
                             )}
                             {isCrew && (
                               <div className="flex items-center gap-2 text-[9px] shrink-0">
                                {vehicleStats?.hull_points && vehicleStats.hull_points > 1 && (
                                 <div className="flex items-center gap-1">
                                   <span className="font-semibold whitespace-nowrap">HP</span>
                                   <div className="flex items-center gap-0.5">
                                     {Array.from({ length: vehicleStats.hull_points - 1 }).map((_, i) => (
                                       <MdCheckBoxOutlineBlank key={`w-${i}`} className="text-black w-2 h-2 shrink-0" />
                                     ))}
                                   </div>
                                 </div>
                                 )}
                                 <div className="flex items-center gap-1">
                                   <span className="font-semibold whitespace-nowrap">FW</span>
                                   <div className="flex items-center gap-0.5">
                                     {Array.from({ length: 3 }).map((_, i) => (
                                       <MdCheckBoxOutlineBlank key={`fw-${i}`} className="text-black w-2 h-2 shrink-0" />
                                     ))}
                                   </div>
                                 </div>
                               </div>
                             )}
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
                         {showXPBoxes && (
                           <div className="mt-4 grid gap-x-1 grid-cols-3 text-[9px]">
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">SI</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {Array.from({ length: 6 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`si-${i}`} className="text-black w-2 h-2 shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">OOA</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {Array.from({ length: 6 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`ooa-${i}`} className="text-black w-2 h-2 shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">R/A</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {Array.from({ length: 5 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`rally-${i}`} className="text-black w-2 h-2 shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">Ld/Ch</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {Array.from({ length: 5 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`leader-${i}`} className="text-black w-2 h-2 shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">Misc</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {Array.from({ length: 6 }).map((_, i) => (
                                   <MdCheckBoxOutlineBlank key={`misc-${i}`} className="text-black w-2 h-2 shrink-0" />
                                 ))}
                               </div>
                             </div>
                             <div className="flex items-center gap-1 min-w-0">
                               <span className="font-semibold whitespace-nowrap shrink-0">Participation</span>
                               <div className="flex items-center gap-0.5 shrink-0">
                                 <MdCheckBoxOutlineBlank key="xp-fielded" className="text-black w-2 h-2 shrink-0" />
                               </div>
                             </div>
                           </div>
                         )}
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Cards View */}
      {viewMode === "cards" && (
        <>
          <div
            className="min-w-fit bg-white text-black print:bg-transparent print:min-w-0"
            style={{
              colorScheme: "light",
              ["--background" as any]: "var(--light-background)",
              ["--foreground" as any]: "var(--light-foreground)",
              ["--card" as any]: "var(--light-card)",
              ["--card-foreground" as any]: "var(--light-card-foreground)",
              ["--popover" as any]: "var(--light-popover)",
              ["--popover-foreground" as any]: "var(--light-popover-foreground)",
              ["--primary" as any]: "var(--light-primary)",
              ["--primary-foreground" as any]: "var(--light-primary-foreground)",
              ["--secondary" as any]: "var(--light-secondary)",
              ["--secondary-foreground" as any]: "var(--light-secondary-foreground)",
              ["--muted" as any]: "var(--light-muted)",
              ["--muted-foreground" as any]: "var(--light-muted-foreground)",
              ["--accent" as any]: "var(--light-accent)",
              ["--accent-foreground" as any]: "var(--light-accent-foreground)",
              ["--destructive" as any]: "var(--light-destructive)",
              ["--destructive-foreground" as any]: "var(--light-destructive-foreground)",
              ["--border" as any]: "var(--light-border)",
              ["--input" as any]: "var(--light-input)",
              ["--ring" as any]: "var(--light-ring)",
            }} // Enforce light theme colors for Cards View
          >
            <div className={`print-gang-cards justify-center print:justify-start flex flex-wrap items-start content-start gap-[6px] [&_.fighter-card-bg]:!w-[630px] [&_.fighter-card-bg]:!h-[435px] [&_.fighter-card-bg]:!shadow-none [&_.fighter-card-bg]:!border-[3px] [&_.fighter-card-bg]:break-inside-avoid [&_.fighter-card-bg]:rounded-lg [&_.fighter-card-bg]:!text-base [&_.fighter-card-bg]:!bg-[#faf9f7] [&_.fighter-card-bg]:!text-black [&_.fighter-card-bg:hover]:!scale-100 [&_.fighter-card-bg:hover]:!shadow-none [&_.fighter-card-bg]:!transition-none [&_.fighter-card-bg_.grid]:!gap-y-0 [&_.fighter-card-bg_.grid]:!mt-1 [&_.fighter-card-bg_.inline-flex.rounded-sm]:!border-2 [&_.fighter-card-bg_.inline-flex.rounded-sm]:!border-black [&_.fighter-card-bg_.bg-secondary]:!shadow-none [&_.fighter-card-bg]:!bg-[url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/fighter-card-background-5-light_web_ynpbac.webp')] ${printStyle === 'eco' ? '[&_.fighter-card-bg]:!bg-none [&_.fighter-card-bg]:!bg-transparent [&_.fancy-print-top-bar]:!bg-none [&_.fancy-print-keep-color-heading]:!text-inherit [&_.fancy-print-keep-color-subtitle]:!text-inherit' : '[&_.fancy-print-keep-color-heading]:!text-white [&_.fancy-print-keep-color-subtitle]:!text-gray-300'}`}>
              {cardsGangCardsPosition === "before" && (
                <>
                  {/* Gang Card */}
                  {showGangCard && (
                  <div className="relative w-[630px] h-[435px] border-[3px] border-black rounded-lg p-4 break-inside-avoid text-base text-black fighter-card-bg print-fighter-card overflow-hidden" style={{ backgroundColor: '#faf9f7' }}>
                    {/* Fancy print top bar - matching fighter card structure */}
                    <div className="flex mb-[50px]">
                      <div className="flex w-full">
                        <div
                          className="absolute inset-0 bg-no-repeat bg-cover fancy-print-top-bar mt-2"
                          style={{
                            backgroundImage: "url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png')",
                            width: '100%',
                            height: '65px',
                            zIndex: 0,
                            backgroundPosition: 'center',
                            backgroundSize: '100% 100%'
                          }}>
                          <div className="absolute z-10 pl-4 flex items-center gap-2 w-[80%] overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
                            <div className="flex flex-col items-baseline w-full">
                              <div className="text-2xl font-semibold text-white ml-4 print:text-foreground fancy-print-keep-color-heading">{name}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Gang Image (match fighter card style) */}
                    {(image_url || gang_type_image_url) && (
                      <div className="absolute right-4 md:top-0 top-2 flex items-center z-20">
                        <div className="bg-black rounded-full shadow-md border-4 border-black md:size-[85px] size-[64px] relative z-10 print:bg-card print:shadow-none overflow-hidden shrink-0">
                          <img
                            src={image_url || gang_type_image_url}
                            alt={name}
                            className="object-cover w-full h-full rounded-full"
                          />
                        </div>
                      </div>
                    )}

                    <div className="relative flex-grow w-full">
                      <div className="flex flex-col gap-2 mb-4">
                        {/* Owner */}
                        {username && (
                          <div className="text-muted-foreground">
                            <div className="flex items-center gap-1 text-sm">
                              Owner: 
                              <Badge variant="outline" className="flex items-center gap-1">
                                {patreon_tier_id && (
                                  <PatreonSupporterIcon
                                    patreonTierId={patreon_tier_id}
                                    patreonTierTitle={patreon_tier_title}
                                  />
                                )}
                                {username}
                              </Badge>
                            </div>
                          </div>
                        )}
        
                        {/* Gang Type & Variants */}
                        <div className="text-muted-foreground">
                          <div className="text-muted-foreground text-sm mb-1">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {/* Gang Type */}
                              <div className="flex items-center gap-1">
                                Type: <Badge variant="secondary">{gang_type}</Badge>
                              </div>
                              {/* Gang Variants */}
                              {gang_variants && gang_variants.length > 0 && !(gang_variants.length === 1 && gang_variants[0].variant === 'Outlaw') && (
                                <div className="flex items-center gap-1">
                                  Variants:
                                  {gang_variants
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
        
                          {/* Affiliation */}
                          {gang_affiliation_name && (
                            <div className="text-muted-foreground text-sm mb-1">
                              <div className="flex flex-wrap gap-x-2 gap-y-1">
                                <div className="flex items-center gap-1">
                                  Affiliation: <Badge variant="secondary">{gang_affiliation_name}</Badge>
                                </div>
                              </div>
                            </div>
                          )}
        
                          {/* Alignment & Alliance */}
                          <div className="text-muted-foreground text-sm">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {/* Alignment */}
                              <div className="flex items-center gap-1 text-sm">
                                Alignment: <Badge variant="secondary">{alignment}</Badge>
                              </div>
                              {/* Alliance */}
                              {alliance_name && (
                                <div className="flex items-center gap-1 text-sm">
                                  Alliance: <Badge variant="secondary">{alliance_name}</Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
        
                        {/* Campaign Attributes */}
                        {campaigns?.[0] && (
                          <div className="text-muted-foreground">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {/* Campaign Name */}
                              <div className="flex items-center gap-1 text-sm">
                                Campaign: <Badge variant="outline">
                                  {campaigns[0].campaign_name.length > 30 
                                    ? `${campaigns[0].campaign_name.substring(0, 30)}...` 
                                    : campaigns[0].campaign_name}
                                </Badge>
                              </div>
                              {/* Allegiance */}
                              {campaigns[0].allegiance && (
                                <div className="flex items-center gap-1 text-sm">
                                  Allegiance: <Badge variant="secondary">{campaigns[0].allegiance.name}</Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
        
                      <div className="mt-2">
                        <div className="grid grid-cols-2 gap-x-20 text-sm">
                          {/* 1st Column */}
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Rating:</span>
                              <span className="font-semibold">{rating ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Credits:</span>
                              <span className="font-semibold">{credits ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Wealth:</span>
                              <span className="font-semibold">{wealth ?? 0}</span>
                            </div>
                          </div>
        
                          {/* 2nd Column */}
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Reputation:</span>
                              <span className="font-semibold">{reputation ?? 0}</span>
                            </div>
                            {/* Dynamic Campaign Resources */}
                            {campaignResources.map((resource: { resource_id: string; resource_name: string; quantity: number }) => (
                              <div key={resource.resource_id} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {resource.resource_name.length > 12 
                                    ? `${resource.resource_name.substring(0, 10)}...` 
                                    : resource.resource_name}:
                                </span>
                                <span className="font-semibold">{resource.quantity}</span>
                              </div>
                            ))}
                            {/* Gang Size */}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Gang Size:</span>
                              <span className="font-semibold">{activeFighters.length}</span>
                            </div>
                          </div>
                        </div>
                      </div>
        
                      {/* Created and Last Updated */}
                      <div className="mt-3 flex flex-row item-center justify-between text-xs text-muted-foreground">
                        <span>Created: {formatDate(created_at)}</span>
                        <span>Last Updated: {formatDate(last_updated)}</span>
                      </div>
                    </div>
                  </div>
                  )}
        
                  {/* Additional Details Card */}
                  {showAdditionalDetails && ((campaigns && campaigns[0]?.territories?.length > 0) || (stash && stash.length > 0) || note) && (
                    <div className="relative w-[630px] h-[435px] border-[3px] border-black rounded-lg p-4 break-inside-avoid text-base text-black fighter-card-bg print-fighter-card overflow-hidden" style={{ backgroundColor: '#faf9f7' }}>
                      {/* Fancy print top bar - matching fighter card structure */}
                      <div className="flex mb-[50px]">
                        <div className="flex w-full">
                          <div
                            className="absolute inset-0 bg-no-repeat bg-cover fancy-print-top-bar mt-2"
                            style={{
                              backgroundImage: "url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png')",
                              width: '100%',
                              height: '65px',
                              zIndex: 0,
                              backgroundPosition: 'center',
                              backgroundSize: '100% 100%'
                            }}>
                            <div className="absolute z-10 pl-4 flex items-center gap-2 w-[80%] overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
                              <div className="flex flex-col items-baseline w-full">
                                <div className="text-xl font-semibold text-white ml-4 print:text-foreground fancy-print-keep-color-heading">Additional Details</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="relative flex-grow w-full">
                        <div className="text-muted-foreground mb-4">
                          <div className="flex flex-wrap gap-4">
                            {campaigns && campaigns[0]?.territories?.length > 0 && (
                              <div className="flex gap-1 items-center text-sm flex-wrap">
                                Territories:
                                {[...campaigns[0].territories]
                                  .sort((a: any, b: any) => a.territory_name.localeCompare(b.territory_name))
                                  .map((territory: any) => (
                                    <Badge
                                      key={territory.id}
                                      variant="secondary"
                                      className="flex items-center gap-1"
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
                                .slice()
                                .sort((a: any, b: any) => (a.equipment_name ?? "").localeCompare(b.equipment_name ?? ""))
                                .map((item: any) => (
                                  <Badge key={item.id} variant="outline">
                                    {item.equipment_name} ({item.cost} credits)
                                  </Badge>
                                ))}
                            </div>
                          )}
                          {note && (
                            <div className="gap-1 text-sm mt-2">
                              Notes:
                              <div className="gap-1 text-sm">
                                <div 
                                  className="prose prose-sm max-w-none text-wrap"
                                  dangerouslySetInnerHTML={{ __html: note }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Fighter Cards */}
              <div className="contents">
                {sortedFighters.map((fighter) => {
                  const vehicle = fighter.vehicles && fighter.vehicles.length > 0 
                    ? (fighter.vehicles[0] as unknown as Vehicle)
                    : undefined;

                  const adjustedStats = calculateAdjustedStats(fighter);
                  const isCrew = fighter.fighter_class === "Crew";
                  const vehicleStats = isCrew
                    ? calculateVehicleStats(vehicle, vehicle?.equipment || [])
                    : null;

                  // Create base_stats and current_stats for FighterCard
                  const fighterBaseStats = fighter.base_stats || {
                    movement: fighter.movement,
                    weapon_skill: fighter.weapon_skill,
                    ballistic_skill: fighter.ballistic_skill,
                    strength: fighter.strength,
                    toughness: fighter.toughness,
                    wounds: fighter.wounds,
                    initiative: fighter.initiative,
                    attacks: fighter.attacks,
                    leadership: fighter.leadership,
                    cool: fighter.cool,
                    willpower: fighter.willpower,
                    intelligence: fighter.intelligence,
                  };

                  const fighterCurrentStats = fighter.current_stats || fighterBaseStats;

                  return (
                    <div key={`${fighter.id}-${(fighter as { active_loadout_id?: string }).active_loadout_id ?? 'default'}`} className="w-[630px] break-inside-avoid">
                      <FighterCard
                        id={fighter.id}
                        name={fighter.fighter_name}
                        type={fighter.fighter_type}
                        fighter_class={fighter.fighter_class}
                        fighter_sub_type={fighter.fighter_sub_type}
                        label={fighter.label}
                        credits={fighter.credits}
                        loadout_cost={fighter.loadout_cost}
                        active_loadout_id={fighter.active_loadout_id}
                        movement={fighter.movement}
                        weapon_skill={fighter.weapon_skill}
                        ballistic_skill={fighter.ballistic_skill}
                        strength={fighter.strength}
                        toughness={fighter.toughness}
                        wounds={fighter.wounds}
                        initiative={fighter.initiative}
                        attacks={fighter.attacks}
                        leadership={fighter.leadership}
                        cool={fighter.cool}
                        willpower={fighter.willpower}
                        intelligence={fighter.intelligence}
                        xp={fighter.xp}
                        advancements={fighter.advancements}
                        weapons={fighter.weapons}
                        wargear={fighter.wargear}
                        special_rules={fighter.special_rules}
                        killed={fighter.killed}
                        retired={fighter.retired}
                        enslaved={fighter.enslaved}
                        starved={fighter.starved}
                        recovery={fighter.recovery}
                        captured={fighter.captured}
                        free_skill={fighter.free_skill}
                        kills={fighter.kills ?? 0}
                        skills={fighter.skills}
                        effects={fighter.effects}
                        note={fighter.note}
                        vehicle={vehicle}
                        disableLink={true}
                        viewMode="small"
                        image_url={fighter.image_url}
                        base_stats={fighterBaseStats}
                        current_stats={fighterCurrentStats}
                        owner_name={fighter.owner_name}
                        active_loadout_name={(fighter as any).active_loadout_name}
                      />

                      {(showWFWBoxes || showXPBoxes) && (
                        <div className="-mt-[5px] border-[3px] border-black border-t-0 px-2 py-1 text-[9px] leading-tight bg-card text-black rounded-b-lg">
                          {/* W/FW boxes */}
                          {showWFWBoxes && (
                            <div className="mt-1 flex items-center justify-between gap-2">
                              {!isCrew && (adjustedStats.wounds > 1 || adjustedStats.toughness > 1) && (
                                <div className="flex items-center gap-2 shrink-0">
                                  {adjustedStats.wounds > 1 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[12px] font-semibold whitespace-nowrap">W</span>
                                      <div className="flex items-center gap-0.5">
                                        {Array.from({ length: adjustedStats.wounds - 1 }).map((_, i) => (
                                          <MdCheckBoxOutlineBlank key={`w-${fighter.id}-${i}`} className="w-3 h-3 shrink-0" />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {adjustedStats.toughness > 1 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[12px] font-semibold whitespace-nowrap">FW</span>
                                      <div className="flex items-center gap-0.5">
                                        {Array.from({ length: adjustedStats.toughness - 1 }).map((_, i) => (
                                          <MdCheckBoxOutlineBlank key={`fw-${fighter.id}-${i}`} className="w-3 h-3 shrink-0" />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {isCrew && (
                                <div className="flex items-center gap-2 shrink-0">
                                  {vehicleStats?.hull_points && vehicleStats.hull_points > 1 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[12px] font-semibold whitespace-nowrap">HP</span>
                                      <div className="flex items-center gap-0.5">
                                        {Array.from({ length: vehicleStats.hull_points - 1 }).map((_, i) => (
                                          <MdCheckBoxOutlineBlank key={`w-crew-${fighter.id}-${i}`} className="w-3 h-3 shrink-0" />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[12px] font-semibold whitespace-nowrap">FW</span>
                                    <div className="flex items-center gap-0.5">
                                      {Array.from({ length: 3 }).map((_, i) => (
                                        <MdCheckBoxOutlineBlank key={`fw-crew-${fighter.id}-${i}`} className="w-3 h-3 shrink-0" />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* XP boxes */}
                          {showXPBoxes && (
                            <div className="mt-1 flex items-start gap-1">
                              <span className="text-[12px] font-semibold whitespace-nowrap">XP:</span>
                              <div className="grid grid-cols-5 gap-x-2 gap-y-1">
                              {[
                                { label: 'SI', count: 6, key: 'si' },
                                { label: 'OOA', count: 6, key: 'ooa' },
                                { label: 'R/A', count: 5, key: 'ra' },
                                { label: 'Ld/Ch', count: 5, key: 'ldch' },
                                { label: 'Misc', count: 6, key: 'misc' },
                              ].map((group) => (
                                <div key={group.key} className="flex items-center gap-1 min-w-0">
                                  <span className="text-[12px] font-semibold whitespace-nowrap shrink-0">{group.label}</span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {Array.from({ length: group.count }).map((_, i) => (
                                      <MdCheckBoxOutlineBlank key={`${group.key}-${fighter.id}-${i}`} className="w-3 h-3 shrink-0" />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {cardsGangCardsPosition === "after" && (
                <>
                  {/* Gang Card */}
                  {showGangCard && (
                  <div className="relative w-[630px] h-[435px] border-[3px] border-black rounded-lg p-4 break-inside-avoid text-base text-black fighter-card-bg print-fighter-card overflow-hidden" style={{ backgroundColor: '#faf9f7' }}>
                {/* Fancy print top bar - matching fighter card structure */}
                <div className="flex mb-[50px]">
                  <div className="flex w-full">
                    <div
                      className="absolute inset-0 bg-no-repeat bg-cover fancy-print-top-bar mt-2"
                      style={{
                        backgroundImage: "url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png')",
                        width: '100%',
                        height: '65px',
                        zIndex: 0,
                        backgroundPosition: 'center',
                        backgroundSize: '100% 100%'
                      }}>
                      <div className="absolute z-10 pl-4 flex items-center gap-2 w-[80%] overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
                        <div className="flex flex-col items-baseline w-full">
                          <div className="text-2xl font-semibold text-white ml-4 print:text-foreground fancy-print-keep-color-heading">{name}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Gang Image (match fighter card style) */}
                {(image_url || gang_type_image_url) && (
                  <div className="absolute right-2 top-2 flex items-center z-20">
                    <div className="bg-black rounded-full shadow-md border-4 border-black md:size-[85px] size-[64px] relative z-10 print:bg-card print:shadow-none overflow-hidden shrink-0">
                      <img
                        src={image_url || gang_type_image_url}
                        alt={name}
                        className="object-cover w-full h-full rounded-full"
                      />
                    </div>
                  </div>
                )}

                <div className="relative flex-grow w-full">
                  <div className="flex flex-col gap-2 mb-4">
                    {/* Owner */}
                    {username && (
                      <div className="text-muted-foreground">
                        <div className="flex items-center gap-1 text-sm">
                          Owner: 
                          <Badge variant="outline" className="flex items-center gap-1">
                            {patreon_tier_id && (
                              <PatreonSupporterIcon
                                patreonTierId={patreon_tier_id}
                                patreonTierTitle={patreon_tier_title}
                              />
                            )}
                            {username}
                          </Badge>
                        </div>
                      </div>
                    )}
    
                    {/* Gang Type & Variants */}
                    <div className="text-muted-foreground">
                      <div className="text-muted-foreground text-sm mb-1">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {/* Gang Type */}
                          <div className="flex items-center gap-1">
                            Type: <Badge variant="secondary">{gang_type}</Badge>
                          </div>
                          {/* Gang Variants */}
                          {gang_variants && gang_variants.length > 0 && !(gang_variants.length === 1 && gang_variants[0].variant === 'Outlaw') && (
                            <div className="flex items-center gap-1">
                              Variants:
                              {gang_variants
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
    
                      {/* Affiliation */}
                      {gang_affiliation_name && (
                        <div className="text-muted-foreground text-sm mb-1">
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            <div className="flex items-center gap-1">
                              Affiliation: <Badge variant="secondary">{gang_affiliation_name}</Badge>
                            </div>
                          </div>
                        </div>
                      )}
    
                      {/* Alignment & Alliance */}
                      <div className="text-muted-foreground text-sm">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {/* Alignment */}
                          <div className="flex items-center gap-1 text-sm">
                            Alignment: <Badge variant="secondary">{alignment}</Badge>
                          </div>
                          {/* Alliance */}
                          {alliance_name && (
                            <div className="flex items-center gap-1 text-sm">
                              Alliance: <Badge variant="secondary">{alliance_name}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
    
                    {/* Campaign Attributes */}
                    {campaigns?.[0] && (
                      <div className="text-muted-foreground">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {/* Campaign Name */}
                          <div className="flex items-center gap-1 text-sm">
                            Campaign: <Badge variant="outline">
                              {campaigns[0].campaign_name.length > 30 
                                ? `${campaigns[0].campaign_name.substring(0, 30)}...` 
                                : campaigns[0].campaign_name}
                            </Badge>
                          </div>
                          {/* Allegiance */}
                          {campaigns[0].allegiance && (
                            <div className="flex items-center gap-1 text-sm">
                              Allegiance: <Badge variant="secondary">{campaigns[0].allegiance.name}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
    
                  <div className="mt-2">
                    <div className="grid grid-cols-2 gap-x-20 text-sm">
                      {/* 1st Column */}
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rating:</span>
                          <span className="font-semibold">{rating ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Credits:</span>
                          <span className="font-semibold">{credits ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Wealth:</span>
                          <span className="font-semibold">{wealth ?? 0}</span>
                        </div>
                      </div>
    
                      {/* 2nd Column */}
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reputation:</span>
                          <span className="font-semibold">{reputation ?? 0}</span>
                        </div>
                        {/* Dynamic Campaign Resources */}
                        {campaignResources.map((resource: { resource_id: string; resource_name: string; quantity: number }) => (
                          <div key={resource.resource_id} className="flex justify-between">
                            <span className="text-muted-foreground">
                              {resource.resource_name.length > 12 
                                ? `${resource.resource_name.substring(0, 10)}...` 
                                : resource.resource_name}:
                            </span>
                            <span className="font-semibold">{resource.quantity}</span>
                          </div>
                        ))}
                        {/* Gang Size */}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gang Size:</span>
                          <span className="font-semibold">{activeFighters.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
    
                  {/* Created and Last Updated */}
                  <div className="mt-3 flex flex-row item-center justify-between text-xs text-muted-foreground">
                    <span>Created: {formatDate(created_at)}</span>
                    <span>Last Updated: {formatDate(last_updated)}</span>
                  </div>
                </div>
                  </div>
                  )}
    
                  {/* Additional Details Card */}
                  {showAdditionalDetails && ((campaigns && campaigns[0]?.territories?.length > 0) || (stash && stash.length > 0) || note) && (
                    <div className="relative w-[630px] h-[435px] border-[3px] border-black rounded-lg p-4 break-inside-avoid text-base text-black fighter-card-bg print-fighter-card overflow-hidden" style={{ backgroundColor: '#faf9f7' }}>
                  {/* Fancy print top bar - matching fighter card structure */}
                  <div className="flex mb-[50px]">
                    <div className="flex w-full">
                      <div
                        className="absolute inset-0 bg-no-repeat bg-cover fancy-print-top-bar mt-2"
                        style={{
                          backgroundImage: "url('https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/top-bar-stroke-v3_s97f2k.png')",
                          width: '100%',
                          height: '65px',
                          zIndex: 0,
                          backgroundPosition: 'center',
                          backgroundSize: '100% 100%'
                        }}>
                        <div className="absolute z-10 pl-4 flex items-center gap-2 w-[80%] overflow-hidden whitespace-nowrap" style={{ height: '62px', marginTop: '0px' }}>
                          <div className="flex flex-col items-baseline w-full">
                            <div className="text-2xl font-semibold text-white ml-4 print:text-foreground fancy-print-keep-color-heading">Additional Details</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="relative flex-grow w-full">
                    <div className="text-muted-foreground mb-4">
                      <div className="flex flex-wrap gap-4">
                        {campaigns && campaigns[0]?.territories?.length > 0 && (
                          <div className="flex gap-1 items-center text-sm flex-wrap">
                            Territories:
                            {[...campaigns[0].territories]
                              .sort((a: any, b: any) => a.territory_name.localeCompare(b.territory_name))
                              .map((territory: any) => (
                                <Badge
                                  key={territory.id}
                                  variant="secondary"
                                  className="flex items-center gap-1"
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
                            .slice()
                            .sort((a: any, b: any) => (a.equipment_name ?? "").localeCompare(b.equipment_name ?? ""))
                            .map((item: any) => (
                              <Badge key={item.id} variant="outline">
                                {item.equipment_name} ({item.cost} credits)
                              </Badge>
                            ))}
                        </div>
                      )}
                      {note && (
                        <div className="gap-1 text-sm mt-2">
                          Notes:
                          <div className="gap-1 text-sm">
                            <div 
                              className="prose prose-sm max-w-none text-wrap"
                              dangerouslySetInnerHTML={{ __html: note }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

                </>
              )}
    
            </div>
          </div>
        </>
      )}
    </div>
  );
}
