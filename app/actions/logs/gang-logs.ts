'use server'

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { postDiscordEmbeds } from "@/utils/discord";
import { getLogTypeLabel } from "@/utils/log-types";

export interface CreateGangLogParams {
  gang_id: string;
  action_type: string;
  description: string;
  fighter_id?: string;
  vehicle_id?: string;
  user_id?: string;
  /** Posts the log to the campaign's Discord when it shares dice rolls. Defaults to true for `*_roll` action types. */
  dice_roll?: boolean;
}

export interface GangLogActionResult {
  success: boolean;
  error?: string;
}

export async function createGangLog(params: CreateGangLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    // Claims are verified locally; getUser() would be a network round trip per log write
    const userId = params.user_id || await getUserIdFromClaims(supabase);

    if (!userId) {
      throw new Error('User not authenticated');
    }

    // No .select(): RETURNING would also apply the SELECT policy, which campaign
    // members fail for an opponent's gang even though the INSERT policy lets
    // them log there (battle results, territory claims), rolling the insert back.
    const { error } = await supabase
      .from('gang_logs')
      .insert({
        gang_id: params.gang_id,
        user_id: userId,
        action_type: params.action_type,
        description: params.description,
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error creating gang log:', error);
      throw new Error(error.message || 'Failed to create gang log');
    }

    if (params.dice_roll ?? params.action_type.endsWith('_roll')) {
      after(() => postDiceRollToDiscord(supabase, params));
    }

    return { success: true };
  } catch (error) {
    console.error('Error in createGangLog server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create gang log'
    };
  }
}

type DiceRollTarget = {
  gangs: { name: string };
  campaigns: {
    discord_channel_id: string | null;
    discord_channel_type: number;
    discord_dice_roll_channel_id: string | null;
    discord_dice_roll_channel_type: number;
  };
};

/** Posts a gang's roll to its campaign's dice roll channel, or else its Battle Log channel. */
async function postDiceRollToDiscord(supabase: SupabaseClient, params: CreateGangLogParams) {
  const { data: rows, error } = await supabase
    .from('campaign_gangs')
    .select('gangs(name), campaigns!inner(discord_channel_id, discord_channel_type, discord_dice_roll_channel_id, discord_dice_roll_channel_type)')
    .eq('gang_id', params.gang_id)
    .eq('status', 'ACCEPTED')
    .eq('campaigns.discord_dice_rolls', true)
    .returns<DiceRollTarget[]>();
  if (error) {
    console.error('Error loading the Discord dice roll channel:', error);
    return;
  }

  const label = getLogTypeLabel(params.action_type);
  for (const { gangs: gang, campaigns: campaign } of rows) {
    const channel = campaign.discord_dice_roll_channel_id
      ? { id: campaign.discord_dice_roll_channel_id, type: campaign.discord_dice_roll_channel_type }
      : campaign.discord_channel_id && { id: campaign.discord_channel_id, type: campaign.discord_channel_type };
    if (!channel) continue;

    const res = await postDiscordEmbeds(process.env.DISCORD_BOT_TOKEN!, channel, `${gang.name} — ${label}`, [{
      author: { name: gang.name },
      title: `🎲 ${label}`,
      description: params.description,
      color: 0xd4a017,
      timestamp: new Date().toISOString(),
      footer: { text: 'Munda Manager' },
    }]);
    if (!res.ok) console.error('Discord dice roll post failed:', await res.text());
  }
}
