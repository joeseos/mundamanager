import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { SupabaseClient } from "@supabase/supabase-js";
import { cache } from 'react';

export type Gang = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  rating: number;
  created_at: string;
  last_updated: string;
};

// Type for raw gang data from Supabase with nested gang_types
type RawGangData = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  created_at: string;
  last_updated: string;
  gang_types: {
    image_url: string;
  };
};

type Fighter = {
  id: string;
  credits: number;
  cost_adjustment: number;
  fighter_equipment?: Array<{ purchase_cost: number }>;
  fighter_skills?: Array<{ credits_increase: number }>;
  fighter_effects?: Array<{ type_specific_data: { credits_increase?: number } }>;
  vehicles?: Array<{
    id: string;
    cost: number;
    fighter_equipment?: Array<{ purchase_cost: number }>;
    fighter_effects?: Array<{ type_specific_data: { credits_increase?: number } }>;
  }>;
};

type FighterWithRating = {
  id: string;
  rating: number;
};

// Use React's cache for Server Component memoization
export const getUserGangs = cache(async function fetchUserGangs(): Promise<Gang[]> {
  console.log("Server: Fetching user gangs");
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    // Use more efficient joins with Supabase's PostgreSQL capabilities
    const { data, error: gangsError } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_type_id,
        credits,
        reputation,
        meat,
        exploration_points,
        created_at,
        last_updated,
        gang_types!gang_type_id(image_url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (gangsError) {
      console.error('Error fetching gangs:', gangsError);
      throw gangsError;
    }

    if (!data || data.length === 0) {
      console.log("Server: No gangs found");
      return [];
    }

    console.log(`Server: Found ${data.length} gangs`);

    // Calculate gang ratings in parallel using a more efficient approach
    const gangsWithRatings = await Promise.all(data.map(async (gang: any) => {
      try {
        const fighters = await getFightersWithRating(supabase, gang.id);
        const totalRating = fighters.reduce((sum: number, fighter: FighterWithRating) => sum + fighter.rating, 0);

        return {
          id: gang.id,
          name: gang.name,
          gang_type: gang.gang_type,
          gang_type_id: gang.gang_type_id,
          image_url: gang.gang_types?.image_url || '',
          credits: gang.credits,
          reputation: gang.reputation,
          meat: gang.meat,
          exploration_points: gang.exploration_points,
          rating: totalRating,
          created_at: gang.created_at,
          last_updated: gang.last_updated
        } as Gang;
      } catch (fighterError) {
        console.error(`Error processing gang ${gang.id}:`, fighterError);
        
        // Return gang with zero rating in case of error
        return {
          id: gang.id,
          name: gang.name,
          gang_type: gang.gang_type,
          gang_type_id: gang.gang_type_id,
          image_url: gang.gang_types?.image_url || '',
          credits: gang.credits,
          reputation: gang.reputation,
          meat: gang.meat,
          exploration_points: gang.exploration_points,
          rating: 0,
          created_at: gang.created_at,
          last_updated: gang.last_updated
        } as Gang;
      }
    }));

    console.log(`Server: Processed ${gangsWithRatings.length} gangs with ratings`);
    return gangsWithRatings;
  } catch (error) {
    console.error('Unexpected error in getUserGangs:', error);
    
    // Log to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // captureException(error) // Using your error reporting service
    }
    
    return [];
  }
});

// Extract fighter rating calculation to a separate function
async function getFightersWithRating(
  supabase: SupabaseClient, 
  gangId: string
): Promise<FighterWithRating[]> {
  try {
    // Get all fighters with their equipment, characteristics, skills in one query
    const { data: fighters, error } = await supabase
      .from('fighters')
      .select(`
        id, 
        credits, 
        cost_adjustment,
        fighter_equipment(purchase_cost),
        fighter_skills(credits_increase),
        fighter_effects(type_specific_data)
      `)
      .eq('gang_id', gangId)
      .eq('killed', false)
      .eq('retired', false)
      .eq('enslaved', false);

    if (error) {
      console.error(`Error fetching fighters data for gang ${gangId}:`, error);
      throw error;
    }

    if (!fighters || fighters.length === 0) {
      return [];
    }

    // Get vehicles assigned to fighters separately
    const fighterIds = fighters.map(f => f.id);
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select(`
        id,
        fighter_id,
        cost,
        fighter_equipment(purchase_cost),
        fighter_effects(type_specific_data)
      `)
      .in('fighter_id', fighterIds);

    if (vehiclesError) {
      console.error(`Error fetching vehicles data for gang ${gangId}:`, vehiclesError);
      throw vehiclesError;
    }

    // Group vehicles by fighter_id
    const vehiclesByFighter = vehicles?.reduce((acc, vehicle) => {
      if (vehicle.fighter_id) {
        if (!acc[vehicle.fighter_id]) {
          acc[vehicle.fighter_id] = [];
        }
        acc[vehicle.fighter_id].push(vehicle);
      }
      return acc;
    }, {} as Record<string, any[]>) || {};

    return (fighters as Fighter[]).map((fighter) => {
      try {
        let rating = (fighter.credits || 0) + (fighter.cost_adjustment || 0);
        
        // Add equipment costs
        if (fighter.fighter_equipment) {
          const equipmentCost = fighter.fighter_equipment.reduce((sum: number, eq: { purchase_cost: number }) => 
            sum + (eq.purchase_cost || 0), 0);
          rating += equipmentCost;
          console.log(`Fighter ${fighter.id}: equipment cost = ${equipmentCost}`);
        }
        
        // Add skills costs
        if (fighter.fighter_skills) {
          const skillsCost = fighter.fighter_skills.reduce((sum: number, skill: { credits_increase: number }) => 
            sum + (skill.credits_increase || 0), 0);
          rating += skillsCost;
          console.log(`Fighter ${fighter.id}: skills cost = ${skillsCost}`);
        }
        
        // Add effects costs (includes characteristic advancements)
        if (fighter.fighter_effects) {
          const effectsCost = fighter.fighter_effects.reduce((sum: number, effect: { type_specific_data: { credits_increase?: number } }) => {
            const creditsIncrease = effect.type_specific_data?.credits_increase;
            return sum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
          }, 0);
          rating += effectsCost;
          console.log(`Fighter ${fighter.id}: effects cost = ${effectsCost}`);
        }
        
        // Add vehicle costs (only vehicles assigned to this fighter)
        const fighterVehicles = vehiclesByFighter[fighter.id] || [];
        let vehicleCost = 0;
        fighterVehicles.forEach((vehicle) => {
          vehicleCost += (vehicle.cost || 0);
          // Add vehicle equipment costs (matching get_gang_details.sql calculation)
          if (vehicle.fighter_equipment) {
            vehicleCost += vehicle.fighter_equipment.reduce((sum: number, eq: { purchase_cost: number }) => 
              sum + (eq.purchase_cost || 0), 0);
          }
          // Add vehicle effects costs (matching get_gang_details.sql calculation)
          if (vehicle.fighter_effects) {
            vehicleCost += vehicle.fighter_effects.reduce((sum: number, effect: { type_specific_data: { credits_increase?: number } }) => {
              const creditsIncrease = effect.type_specific_data?.credits_increase;
              return sum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
            }, 0);
          }
        });
        rating += vehicleCost;
        console.log(`Fighter ${fighter.id}: vehicle cost = ${vehicleCost}, total rating = ${rating}`);
        
        return { id: fighter.id, rating };
      } catch (calculationError) {
        console.error(`Error calculating rating for fighter ${fighter.id}:`, calculationError);
        return { id: fighter.id, rating: 0 };
      }
    });
  } catch (error) {
    console.error(`Unexpected error in getFightersWithRating for gang ${gangId}:`, error);
    return [];
  }
} 