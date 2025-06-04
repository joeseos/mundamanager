'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { FighterProps, FighterSkills } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import { Button } from "@/components/ui/button";
import GangPageContent from "@/components/gang/gang-page-content";
import Tabs from "@/components/tabs";
import GangInventory from "@/components/gang/stash-tab";
import { GangNotes } from "@/components/gang/notes-tab";
import GangTerritories from "@/components/gang/campaign-tab";
import { Equipment } from "@/types/equipment";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { StashItem } from '@/types/gang';
import GangVehicles from "@/components/gang/vehicles-tab";
import { VehicleProps } from '@/types/vehicle';
import { toast } from "@/components/ui/use-toast";
import AddFighter from "@/components/gang/add-fighter";

// Tab icons
import { FaBox, FaUsers } from "react-icons/fa6";
import { FaTruckMoving } from 'react-icons/fa';
import { FiMap } from "react-icons/fi";
import { LuClipboard } from "react-icons/lu";

// Add this interface at the top of the file
interface FighterTypeResponse {
  id: string;
  fighter_type: string;
  fighter_class: string;
  gang_type: string;
  cost: number;
  gang_type_id: string;
  special_rules: string[];
  note: string;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  attacks: number;
  default_equipment: any[];
  total_cost: number;
}

async function processGangData(gangData: any) {
  const processedFighters = gangData.fighters.map((fighter: any) => {
    // Filter out null equipment entries and process equipment
    const validEquipment = (fighter.equipment?.filter((item: Equipment | null) => item !== null) || []) as Equipment[];
    
    // Only process vehicle data for crew fighters
    const vehicle = fighter.fighter_class === 'Crew' && fighter.vehicles?.[0] ? {
      ...fighter.vehicles[0],
      equipment: fighter.vehicles[0].equipment?.map((item: any) => ({
        ...item,
        vehicle_equipment_profiles: item.vehicle_equipment_profiles || []
      })) || []
    } : undefined;

    // Ensure skills is processed correctly
    const processedSkills: FighterSkills = {};
    
    if (fighter.skills) {
      // If skills is an object with string keys (new format)
      if (typeof fighter.skills === 'object' && !Array.isArray(fighter.skills)) {
        Object.assign(processedSkills, fighter.skills);
      } 
      // If skills is an array (old format), convert to object
      else if (Array.isArray(fighter.skills)) {
        fighter.skills.forEach((skill: any) => {
          if (skill.name) {
            processedSkills[skill.name] = {
              id: skill.id,
              credits_increase: skill.credits_increase,
              xp_cost: skill.xp_cost,
              is_advance: skill.is_advance,
              acquired_at: skill.acquired_at,
              fighter_injury_id: skill.fighter_injury_id
            };
          }
        });
      }
    }

    return {
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      fighter_type_id: fighter.fighter_type_id,
      fighter_type: fighter.fighter_type,
      fighter_class: fighter.fighter_class,
      fighter_sub_type: fighter.fighter_sub_type,
      label: fighter.label,
      credits: fighter.credits,
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
      xp: fighter.xp ?? 0,
      advancements: {
        characteristics: fighter.advancements?.characteristics || {},
        skills: fighter.advancements?.skills || {}
      },
      base_stats: {
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
        intelligence: fighter.intelligence
      },
      current_stats: {
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
        intelligence: fighter.intelligence
      },
      skills: processedSkills,
      effects: fighter.effects || { injuries: [], advancements: [] },
      weapons: validEquipment
        .filter((item: Equipment) => item.equipment_type === 'weapon')
        .map((item: Equipment) => ({
          weapon_name: item.equipment_name,
          weapon_id: item.equipment_id,
          cost: item.cost,
          fighter_weapon_id: item.fighter_weapon_id || item.fighter_equipment_id,
          weapon_profiles: item.weapon_profiles || []
        })) || [],
      wargear: validEquipment
        .filter((item: Equipment) => item.equipment_type === 'wargear')
        .map((item: Equipment) => ({
          wargear_name: item.equipment_name,
          wargear_id: item.equipment_id,
          cost: item.cost,
          fighter_weapon_id: item.fighter_weapon_id
        })) || [],
      vehicles: fighter.vehicles || [],
      special_rules: fighter.special_rules || [],
      note: fighter.note,
      killed: fighter.killed || false,
      retired: fighter.retired || false,
      enslaved: fighter.enslaved || false,
      starved: fighter.starved || false,
      recovery: fighter.recovery || false,
      free_skill: fighter.free_skill || false,
      vehicle,
    };
  });

  // Remove the fighter types fetch and just initialize as empty array
  const processedFighterTypes: FighterType[] = [];
  
  // init or fix positioning for all fighters
  let positioning = gangData.positioning || {};

  // If no positions exist, create initial positions sorted by fighter name
  if (Object.keys(positioning).length === 0) {
    const sortedFighters = [...processedFighters].sort((a, b) => 
      a.fighter_name.localeCompare(b.fighter_name)
    );
    
    positioning = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});
  } else {
    // First, filter out any positions referencing non-existent fighters
    const validFighterIds = new Set(processedFighters.map((f: FighterProps) => f.id));
    const validPositions: Record<string, string> = {};
    
    Object.entries(positioning as Record<string, string>).forEach(([pos, fighterId]) => {
      if (validFighterIds.has(fighterId)) {
        validPositions[pos] = fighterId;
      }
    });

    // Handle existing positions - fix any gaps
    const currentPositions = Object.keys(validPositions).map(pos => Number(pos)).sort((a, b) => a - b);
    let expectedPosition = 0;
    const positionMapping: Record<number, number> = {};

    currentPositions.forEach(position => {
      positionMapping[position] = expectedPosition;
      expectedPosition++;
    });

    // Create new positioning object with corrected positions
    const newPositioning: Record<number, string> = {};
    for (const [pos, fighterId] of Object.entries(validPositions)) {
      newPositioning[positionMapping[Number(pos)] ?? expectedPosition++] = fighterId;
    }
    positioning = newPositioning;

    // make sure each fighter has a position
    processedFighters.forEach((fighter: FighterProps) => {
      if (!Object.values(positioning).includes(fighter.id)) {
        positioning[expectedPosition++] = fighter.id;
      }
    });
  }

  // Check if positions have changed from what's in the database
  const positionsHaveChanged = !gangData.positioning || 
    Object.entries(positioning).some(
      ([id, pos]) => gangData.positioning[id] !== pos
    );

  // Update database if positions have changed
  if (positionsHaveChanged) {
    const supabase = createClient();
    const { error } = await supabase
      .from('gangs')
      .update({ positioning })
      .eq('id', gangData.id);

    if (error) {
      console.error('Error updating positions:', error);
    }
  }

  // Get campaign settings from the campaigns array
  const campaign = gangData.campaigns?.[0];
  
  const processedData = {
    ...gangData,
    alignment: gangData.alignment,
    alliance_name: gangData.alliance_name || "",
    fighters: processedFighters,
    fighterTypes: processedFighterTypes,
    campaigns: gangData.campaigns?.map((campaign: any) => ({
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      role: campaign.role,
      status: campaign.status,
      has_meat: campaign.has_meat ?? false,
      has_exploration_points: campaign.has_exploration_points ?? false,
      has_scavenging_rolls: campaign.has_scavenging_rolls ?? false,
      territories: campaign.territories || []
    })),
    campaign_has_meat: gangData.campaigns?.[0]?.has_meat ?? false,
    campaign_has_exploration_points: gangData.campaigns?.[0]?.has_exploration_points ?? false,
    campaign_has_scavenging_rolls: gangData.campaigns?.[0]?.has_scavenging_rolls ?? false,
    stash: (gangData.stash || []).map((item: any) => ({
      id: item.id,
      equipment_name: item.equipment_name,
      vehicle_name: item.vehicle_name,
      cost: item.cost,
      type: item.type || 'equipment',
      equipment_type: item.equipment_type,
      equipment_category: item.equipment_category,
      vehicle_id: item.vehicle_id
    })),
    vehicles: gangData.vehicles || [],
    positioning,
    gang_variants: gangData.gang_variants?.map((variant: any) => {
      // Handle different possible data structures
      if (variant.gang_variant_types) {
        // If the data comes with nested gang_variant_types
        return {
          id: variant.gang_variant_types.id,
          variant: variant.gang_variant_types.variant
        };
      } else if (variant.id && variant.variant) {
        // If the data is already in the correct format
        return {
          id: variant.id,
          variant: variant.variant
        };
      } else {
        // If we just have an ID string
        return {
          id: variant,
          variant: variant // Temporarily use ID as variant name
        };
      }
    }) || [] // Provide empty array as fallback if gang_variants is undefined
  };

  // Make sure user_id is included in processedData
  processedData.user_id = gangData.user_id;
  
  return processedData;
}

interface GangDataState {
  processedData: {
    id: string;
    name: string;
    gang_type_id: string;
    gang_type: string;
    gang_type_image_url: string;
    gang_colour: string;
    credits: number;
    reputation: number;
    meat: number;
    exploration_points: number;
    rating: number;
    alignment: string;
    alliance_id: string;
    alliance_name: string;
    created_at: string;
    last_updated: string;
    user_id: string;
    fighters: FighterProps[];
    fighterTypes: FighterType[];
    stash: StashItem[];
    vehicles: VehicleProps[];
    note?: string;
    positioning: Record<number, string>;
    campaigns: any[];
    gang_variants: Array<{id: string, variant: string}>;
  };
  stash: StashItem[];
  onStashUpdate: (newStash: StashItem[]) => void;
  onVehicleUpdate: (newVehicles: VehicleProps[]) => void;
  onFighterUpdate: (updatedFighter: FighterProps) => void;

}

export default function GangPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [gangData, setGangData] = useState<GangDataState | null>(null);
  const [fighterTypes, setFighterTypes] = useState<FighterType[]>([]);
  const [showAddFighterModal, setShowAddFighterModal] = useState(false);

  // Memoize the callbacks
  const handleStashUpdate = useCallback((newStash: StashItem[]) => {
    setGangData((prev: GangDataState | null) => {
      if (!prev) return null;
      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          stash: newStash
        },
        stash: newStash
      };
    });
  }, []);

  const handleVehicleUpdate = useCallback((newVehicles: VehicleProps[]) => {
    setGangData((prev: GangDataState | null) => {
      if (!prev) return null;
      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          vehicles: newVehicles
        }
      };
    });
  }, []);

  const handleFighterUpdate = useCallback((updatedFighter: FighterProps) => {
    setGangData((prev: GangDataState | null) => {
      if (!prev) return null;
      
      // Find the previous version of this fighter to compare
      const prevFighter = prev.processedData.fighters.find(f => f.id === updatedFighter.id);
      
      // Calculate rating change from vehicle updates
      let ratingChange = 0;
      
      // If fighter now has a vehicle that it didn't have before
      if (updatedFighter.vehicles?.length && (!prevFighter?.vehicles || prevFighter.vehicles.length === 0)) {
        // Add the vehicle's cost to the rating - we know it's a VehicleProps
        const vehicleCost = (updatedFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange += vehicleCost;
        console.log(`Adding vehicle cost ${vehicleCost} to rating`);
      } 
      // If fighter had a vehicle but no longer does
      else if ((!updatedFighter.vehicles || updatedFighter.vehicles.length === 0) && prevFighter?.vehicles?.length) {
        // Subtract the vehicle's cost from the rating
        const vehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= vehicleCost;
        console.log(`Removing vehicle cost ${vehicleCost} from rating`);
      }
      // If fighter had a vehicle and still has one, but it's different
      else if (updatedFighter.vehicles?.length && prevFighter?.vehicles?.length && 
               updatedFighter.vehicles[0].id !== prevFighter.vehicles[0].id) {
        // Remove old vehicle cost and add new vehicle cost
        const prevVehicleCost = (prevFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        const newVehicleCost = (updatedFighter.vehicles[0] as unknown as VehicleProps).cost || 0;
        ratingChange -= prevVehicleCost;
        ratingChange += newVehicleCost;
        console.log(`Changing vehicle cost from ${prevVehicleCost} to ${newVehicleCost}, net change: ${newVehicleCost - prevVehicleCost}`);
      }

      // Calculate the new rating
      const newRating = prev.processedData.rating + ratingChange;
      console.log(`Updated rating: ${newRating} (was ${prev.processedData.rating}, change: ${ratingChange})`);

      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          fighters: prev.processedData.fighters.map(fighter =>
            fighter.id === updatedFighter.id ? updatedFighter : fighter
          ),
          // Update the rating based on vehicle changes
          rating: newRating
        }
      };
    });
  }, []);

  const handleVehicleAdd = useCallback((newVehicle: VehicleProps) => {
    setGangData((prev: GangDataState | null) => {
      if (!prev) return null;
      return {
        ...prev,
        processedData: {
          ...prev.processedData,
          vehicles: [...prev.processedData.vehicles, newVehicle]
        }
      };
    });
  }, []);

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
              "p_gang_type_id": gangData?.processedData.gang_type_id
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
            equipment_selection: type.equipment_selection,
            default_equipment: type.default_equipment || [],
            special_rules: type.special_rules || []
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

  // Memoize the processed data for the GangPageContent
  const gangPageContentProps = useMemo(() => {
    if (!gangData) return null;
    
    return {
      processedData: gangData.processedData,
      gangData: {
        ...gangData,
        onVehicleAdd: handleVehicleAdd,
        user_id: gangData.processedData.user_id
      }
    };
  }, [gangData, handleVehicleAdd]);

  useEffect(() => {
    let isSubscribed = true;
    
    const fetchGangData = async () => {
      try {
        const response = await fetch(
          'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_gang_details',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              "p_gang_id": params.id
            })
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch gang details');
        }

        const [data] = await response.json();
        // console.log('API Response:', data?.campaigns?.[0]);

        if (!data) {
          return redirect("/");
        }

        const processedData = await processGangData(data);
        // Make sure user_id is included in processedData
        processedData.user_id = data.user_id;
        
        if (isSubscribed) {
          setGangData({
            processedData,
            stash: processedData.stash || [],
            onStashUpdate: handleStashUpdate,
            onVehicleUpdate: handleVehicleUpdate,
            onFighterUpdate: handleFighterUpdate
          });
        }
      } catch (error) {
        console.error('Error fetching gang data:', error);
        if (isSubscribed) {
          // Handle error state if needed
        }
      }
    };

    fetchGangData();

    return () => {
      isSubscribed = false;
    };
  }, [params.id, handleStashUpdate, handleVehicleUpdate, handleFighterUpdate]);

  if (!gangData) return null;

  return (
    <div>
      <Tabs tabTitles={['Gang', 'Stash', 'Vehicles', 'Campaign', 'Notes']}
         tabIcons={[
           <FaUsers key="users" />,
           <FaBox key="box" />,
           <FaTruckMoving key="car" />,
           <FiMap key="map" />,
           <LuClipboard key="note" />
         ]}
        >
        {gangPageContentProps && <GangPageContent {...gangPageContentProps} />}
        <GangInventory
          stash={gangData.stash} 
          fighters={gangData.processedData.fighters}
          title="Stash"
          onStashUpdate={handleStashUpdate}
          onFighterUpdate={handleFighterUpdate}
          vehicles={gangData.processedData.vehicles || []}
        />
        <GangVehicles
          vehicles={gangData.processedData.vehicles || []}
          fighters={gangData.processedData.fighters || []}
          gangId={params.id}
          onVehicleUpdate={handleVehicleUpdate}
          onFighterUpdate={handleFighterUpdate}
        />
        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Campaign</h2>
          <GangTerritories 
            gangId={params.id} 
            campaigns={gangData.processedData.campaigns || []} 
          />
        </div>
        <GangNotes 
          gangId={params.id}
          initialNote={gangData.processedData.note || ''}
        />
      </Tabs>
      
      {showAddFighterModal && (
        <AddFighter
          showModal={showAddFighterModal}
          setShowModal={setShowAddFighterModal}
          fighterTypes={fighterTypes}
          gangId={params.id}
          initialCredits={gangData.processedData.credits}
          onFighterAdded={handleFighterUpdate}
        />
      )}
    </div>
  );
}
