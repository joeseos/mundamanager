import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Gang from "@/components/gang";
import { FighterProps } from "@/types/fighter";

interface FighterType {
  fighter_type_id: string;
  fighter_type: string;
  cost: number;
}

async function processGangData(gangData: any) {
  if (!gangData) {
    throw new Error("No gang data provided");
  }

  if (!Array.isArray(gangData.fighters)) {
    throw new Error("Invalid fighters data structure");
  }

  const processedFighters = gangData.fighters.map((fighter: any) => ({
    id: fighter.id,
    fighter_name: fighter.fighter_name,
    fighter_type_id: fighter.fighter_type_id,
    fighter_type: fighter.fighter_type,
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
    weapons: fighter.weapons || [],
    wargear: fighter.wargear?.map((item: any) => ({
      wargear_name: item.wargear_name
    })) || [],
    advancements: {
      characteristics: fighter.advancements?.characteristics || {}
    },
  })) as FighterProps[];

  return {
    ...gangData,
    fighters: processedFighters
  };
}

export default async function GangPage() {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return redirect("/");
    }

    const { data: gangsData, error: gangsError } = await supabase
      .from("gangs_with_fighters")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (gangsError) {
      console.error("Database error:", gangsError);
      if (gangsError.message?.includes("fighter_class")) {
        return <div>Error loading gang data. Please contact support.</div>;
      }
      return <div>Failed to load gang data. Please try again.</div>;
    }

    if (!gangsData) {
      return <div>No gang found.</div>;
    }

    const processedData = await processGangData(gangsData);

    return (
      <div className="container mx-auto py-10">
        <Gang 
          {...processedData} 
          initialFighters={processedData.fighters}
          fighterTypes={processedData.fighterTypes || []}
        />
      </div>
    );
  } catch (error) {
    console.error("Error in GangPage:", error);
    
    let errorMessage = "An error occurred. Please try again later.";
    if (error instanceof Error) {
      if (error.message.includes("fighter_class")) {
        errorMessage = "Error loading gang data. Please contact support.";
      } else if (error.message.includes("credits")) {
        errorMessage = "Not enough credits to perform this action.";
      }
    }
    
    return <div>{errorMessage}</div>;
  }
}
