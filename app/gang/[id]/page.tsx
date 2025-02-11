'use client';

import { useState, useEffect } from 'react';
import { redirect } from "next/navigation";
import Gang from "@/components/gang";
import { createClient } from "@/utils/supabase/client";
import { FighterProps } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import { Button } from "@/components/ui/button";
import GangPageContent from "@/components/gang-page-content";
import Tabs from "@/components/tabs";
import GangInventory from "@/components/gang-stash";
import { GangNotes } from "@/components/gang-notes";
import GangTerritories from "@/components/gang-territories";
import { Equipment } from "@/types/equipment";
import { fighterClassRank } from "@/utils/fighterClassRank";
import { StashItem } from '@/types/gang';
import GangVehicles from "@/components/gang-vehicles";
import { VehicleProps } from '@/types/vehicle';

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
    
    return {
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      fighter_type_id: fighter.fighter_type_id,
      fighter_type: fighter.fighter_type,
      fighter_class: fighter.fighter_class,
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
      injuries: fighter.injuries || [],
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
      free_skill: fighter.free_skill || false,
    };
  });

  // Fetch fighter types
  const supabase = createClient();
  const response = await fetch(
    'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_fighter_types_with_cost',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        "p_gang_type_id": gangData.gang_type_id
      })
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch fighter types');
  }

  const fighterTypes = await response.json();

  // Map the fighter types to match the expected interface and sort by cost
const processedFighterTypes = (
    fighterTypes
      .map((type: FighterTypeResponse) => ({
        id: type.id,
        fighter_type_id: type.id,
        fighter_type: type.fighter_type,
        fighter_class: type.fighter_class,
        cost: type.cost,
        total_cost: type.total_cost,
      })) as FighterType[]
  ).sort((a, b) => {
    const rankA = fighterClassRank[a.fighter_class?.toLowerCase() || ""] ?? Infinity;
    const rankB = fighterClassRank[b.fighter_class?.toLowerCase() || ""] ?? Infinity;

    if (rankA !== rankB) {
      return rankA - rankB; // Ascending order by rank
    }
    return (a.fighter_type || "").localeCompare(b.fighter_type || ""); // Secondary sorting: By fighter_type
  });

  // Get campaign settings from the campaigns array
  const campaign = gangData.campaigns?.[0];
  
  return {
    ...gangData,
    alignment: gangData.alignment,
    fighters: processedFighters,
    fighterTypes: processedFighterTypes,
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
  };
}

interface GangDataState {
  processedData: {
    id: string;
    name: string;
    gang_type_id: string;
    gang_type: string;
    gang_type_image_url: string;
    credits: number;
    reputation: number;
    meat: number;
    exploration_points: number;
    rating: number;
    alignment: string;
    created_at: string;
    last_updated: string;
    user_id: string;
    fighters: FighterProps[];
    fighterTypes: FighterType[];
    stash: StashItem[];
    vehicles: VehicleProps[];
    note?: string;
  };
  stash: StashItem[];
  onStashUpdate: (newStash: StashItem[]) => void;
  onVehicleUpdate: (newVehicles: VehicleProps[]) => void;
  onFighterUpdate: (updatedFighter: FighterProps) => void;
}

export default function GangPage({ params }: { params: { id: string } }) {
  const [gangData, setGangData] = useState<GangDataState | null>(null);

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
        console.log('API Response:', data?.campaigns?.[0]); // Log the campaign data

        if (!data) {
          return redirect("/");
        }

        const processedData = await processGangData(data);
        console.log('Processed Data:', {
          has_meat: processedData.campaign_has_meat,
          has_exploration: processedData.campaign_has_exploration_points,
          has_scavenging: processedData.campaign_has_scavenging_rolls
        });
        
        if (isSubscribed) {
          setGangData({
            processedData,
            stash: processedData.stash || [],
            onStashUpdate: (newStash: StashItem[]) => {
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
            },
            onVehicleUpdate: (newVehicles: VehicleProps[]) => {
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
            },
            onFighterUpdate: (updatedFighter: FighterProps) => {
              setGangData((prev: GangDataState | null) => {
                if (!prev) return null;
                return {
                  ...prev,
                  processedData: {
                    ...prev.processedData,
                    fighters: prev.processedData.fighters.map(fighter =>
                      fighter.id === updatedFighter.id ? updatedFighter : fighter
                    )
                  }
                };
              });
            }
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
  }, [params.id]);

  // Add a handler for adding new vehicles
  const handleVehicleAdd = (newVehicle: VehicleProps) => {
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
  };

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
        <GangPageContent 
          processedData={gangData.processedData} 
          gangData={{
            ...gangData,
            onVehicleAdd: handleVehicleAdd
          }} 
        />
        <GangInventory
          stash={gangData.stash} 
          fighters={gangData.processedData.fighters}
          title="Stash"
          onStashUpdate={gangData.onStashUpdate}
          vehicles={gangData.processedData.vehicles || []}
        />
        <GangVehicles 
          vehicles={gangData.processedData.vehicles || []} 
          fighters={gangData.processedData.fighters}
          gangId={gangData.processedData.id}
          onVehicleUpdate={gangData.onVehicleUpdate}
          onFighterUpdate={gangData.onFighterUpdate}
        />
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h2 className="text-2xl font-bold mb-4">Territories</h2>
          <GangTerritories gangId={params.id} />
        </div>
        <GangNotes 
          gangId={params.id}
          initialNote={gangData.processedData.note || ''}
        />
      </Tabs>
    </div>
  );
}
