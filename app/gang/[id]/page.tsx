import { redirect } from "next/navigation";
import Gang from "@/components/gang";
import { createClient } from "@/utils/supabase/server";
import { FighterProps } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import { Button } from "@/components/ui/button";
import GangPageContent from "@/components/gang-page-content";
import Tabs from "@/components/tabs";
import GangInventory from "@/components/gang-stash";

// Add this interface at the top of the file
interface FighterTypeResponse {
  id: string;
  fighter_type: string;
  gang_type: string;
  cost: number;
  gang_type_id: string;
  special_rules: string[];
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
      weapons: fighter.equipment
        ?.filter((item: any) => item.equipment_type === 'weapon')
        .map((item: any) => ({
          ...item,
          weapon_profiles: item.weapon_profiles?.map((profile: any) => ({
            ...profile,
            strength: profile.strength
          }))
        })) || [],
      wargear: fighter.equipment
        ?.filter((item: any) => item.equipment_type === 'wargear')
        .map((item: any) => ({
          wargear_name: item.equipment_name,
          wargear_id: item.equipment_id,
          cost: item.cost,
          fighter_weapon_id: item.fighter_equipment_id
        })) || [],
      special_rules: fighter.special_rules || [],
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
  const processedFighterTypes = fighterTypes
    .map((type: FighterTypeResponse) => ({
      id: type.id,
      fighter_type_id: type.id,
      fighter_type: type.fighter_type,
      cost: type.cost,
      total_cost: type.total_cost
    }))
    .sort((a: FighterType, b: FighterType) => (a.cost || 0) - (b.cost || 0)) as FighterType[];

  return {
    ...gangData,
    alignment: gangData.alignment,
    fighters: processedFighters,
    fighterTypes: processedFighterTypes // Use processed fighter types
  };
}

export default async function GangPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

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

    const [gangData] = await response.json();
    
    if (!gangData) {
      redirect("/");
    }

    const processedData = await processGangData(gangData);

    return (
      <div>
        <Tabs>
          <GangPageContent processedData={processedData} gangData={gangData} />
          <GangInventory
            stash={gangData.stash || []} 
            fighters={processedData.fighters}
            title="Stash"
          />
          <div>Settings Content Coming Soon</div>
          <div>History Content Coming Soon</div>
        </Tabs>
      </div>
    );
    
  } catch (error) {
    console.error('Error in GangPage:', error);
    return <div>Error loading gang data</div>;
  }
}
