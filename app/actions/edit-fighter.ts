'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/utils/auth";

interface EditFighterStatusParams {
  fighter_id: string;
  action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'delete';
  sell_value?: number;
}

interface EditFighterResult {
  success: boolean;
  data?: {
    fighter?: any;
    gang?: {
      id: string;
      credits: number;
    };
    redirectTo?: string;
  };
  error?: string;
}

export async function editFighterStatus(params: EditFighterStatusParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Get fighter information
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(`
        id,
        fighter_name,
        gang_id,
        credits,
        killed,
        retired,
        enslaved,
        starved,
        recovery
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Get gang information
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id, credits')
      .eq('id', fighter.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gang.user_id !== user.id) {
      throw new Error('User does not have permission to edit this fighter');
    }

    const gangId = fighter.gang_id;
    const gangCredits = gang.credits;

    // Handle different actions
    switch (params.action) {
      case 'kill': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            killed: !fighter.killed,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'retire': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            retired: !fighter.retired,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'sell': {
        if (!params.sell_value || params.sell_value < 0) {
          throw new Error('Invalid sell value provided');
        }

        // Update fighter to enslaved and add credits to gang
        const { data: updatedFighter, error: fighterUpdateError } = await supabase
          .from('fighters')
          .update({ 
            enslaved: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (fighterUpdateError) throw fighterUpdateError;

        // Update gang credits
        const { data: updatedGang, error: gangUpdateError } = await supabase
          .from('gangs')
          .update({ 
            credits: gangCredits + params.sell_value,
            last_updated: new Date().toISOString()
          })
          .eq('id', gangId)
          .select('id, credits')
          .single();

        if (gangUpdateError) throw gangUpdateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { 
            fighter: updatedFighter,
            gang: updatedGang
          }
        };
      }

      case 'rescue': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            enslaved: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'starve': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            starved: !fighter.starved,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'recover': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            recovery: !fighter.recovery,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        revalidatePath(`/fighter/${params.fighter_id}`);
        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'delete': {
        // Delete the fighter
        const { error: deleteError } = await supabase
          .from('fighters')
          .delete()
          .eq('id', params.fighter_id);

        if (deleteError) throw deleteError;

        // Update gang credits with fighter's credits
        const { data: updatedGang, error: gangUpdateError } = await supabase
          .from('gangs')
          .update({ 
            credits: gangCredits + fighter.credits,
            last_updated: new Date().toISOString()
          })
          .eq('id', gangId)
          .select('id, credits')
          .single();

        if (gangUpdateError) throw gangUpdateError;

        revalidatePath(`/gang/${gangId}`);

        return {
          success: true,
          data: { 
            gang: updatedGang,
            redirectTo: `/gang/${gangId}`
          }
        };
      }

      default:
        throw new Error('Invalid action specified');
    }

  } catch (error) {
    console.error('Error in editFighterStatus server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 