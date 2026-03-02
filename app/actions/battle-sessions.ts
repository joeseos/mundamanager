'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import {
  CACHE_TAGS,
  invalidateFighterAdvancement,
  invalidateGangFinancials,
} from '@/utils/cache-tags';
import { logBattleResult } from '@/app/actions/logs/gang-campaign-logs';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import type {
  BattleSession,
  BattleSessionFull,
  PendingInjury,
} from '@/types/battle-session';

// =============================================================================
// Session Lifecycle
// =============================================================================

export async function createBattleSession(params: {
  campaign_id?: string;
  scenario?: string;
}): Promise<{ success: boolean; session_id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data, error } = await supabase
      .from('battle_sessions')
      .insert({
        created_by: user.id,
        campaign_id: params.campaign_id || null,
        scenario: params.scenario || null,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.USER_BATTLE_SESSIONS(user.id));

    return { success: true, session_id: data.id };
  } catch (err) {
    console.error('Error creating battle session:', err);
    return { success: false, error: 'Failed to create battle session' };
  }
}

export async function getBattleSession(
  sessionId: string
): Promise<BattleSessionFull | null> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from('battle_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) return null;

    // Fetch campaign name if applicable
    let campaign_name: string | undefined;
    if (session.campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', session.campaign_id)
        .single();
      campaign_name = campaign?.campaign_name;
    }

    // Fetch participants with gang and profile data
    const { data: participants } = await supabase
      .from('battle_session_participants')
      .select('*')
      .eq('battle_session_id', sessionId);

    if (!participants || participants.length === 0) {
      return {
        ...session,
        participants: [],
        campaign_name,
      };
    }

    // Batch fetch gang data
    const gangIds = participants.map((p) => p.gang_id);
    const userIds = participants.map((p) => p.user_id);

    const [{ data: gangs }, { data: profiles }] = await Promise.all([
      supabase
        .from('gangs')
        .select('id, name, gang_colour, rating')
        .in('id', gangIds),
      supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds),
    ]);

    const gangMap = new Map(gangs?.map((g) => [g.id, g]) || []);
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    // Fetch all fighters for this session
    const { data: fighters } = await supabase
      .from('battle_session_fighters')
      .select('*')
      .eq('battle_session_id', sessionId);

    // Batch fetch fighter details
    let fighterMap = new Map<string, any>();
    if (fighters && fighters.length > 0) {
      const fighterIds = fighters.map((f) => f.fighter_id);
      const { data: fighterDetails } = await supabase
        .from('fighters')
        .select('id, fighter_name, credits')
        .in('id', fighterIds);

      // Enrich with total cost in parallel
      const enriched = await Promise.all(
        (fighterDetails ?? []).map(async (f) => ({
          ...f,
          total_cost: await getFighterTotalCost(f.id, supabase),
        }))
      );
      fighterMap = new Map(enriched.map((f) => [f.id, f]));
    }

    // Group fighters by participant
    const fightersByParticipant = new Map<string, any[]>();
    for (const f of fighters || []) {
      const list = fightersByParticipant.get(f.participant_id) || [];
      list.push({
        ...f,
        pending_injuries: f.pending_injuries || [],
        fighter: fighterMap.get(f.fighter_id) || undefined,
      });
      fightersByParticipant.set(f.participant_id, list);
    }

    // Assemble full participants
    const fullParticipants = participants.map((p) => ({
      ...p,
      gang: gangMap.get(p.gang_id) || undefined,
      profile: profileMap.get(p.user_id)
        ? { username: profileMap.get(p.user_id)!.username }
        : undefined,
      fighters: fightersByParticipant.get(p.id) || [],
    }));

    return {
      ...session,
      participants: fullParticipants,
      campaign_name,
    };
  } catch (err) {
    console.error('Error fetching battle session:', err);
    return null;
  }
}

export async function getUserBattleSessions(): Promise<BattleSession[]> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Get sessions where user is creator or participant
    const { data: participantSessions } = await supabase
      .from('battle_session_participants')
      .select('battle_session_id')
      .eq('user_id', user.id);

    const participantSessionIds =
      participantSessions?.map((p) => p.battle_session_id) || [];

    const { data: sessions } = await supabase
      .from('battle_sessions')
      .select('*')
      .or(
        `created_by.eq.${user.id}${participantSessionIds.length > 0 ? `,id.in.(${participantSessionIds.join(',')})` : ''}`
      )
      .order('updated_at', { ascending: false });

    return sessions || [];
  } catch (err) {
    console.error('Error fetching user battle sessions:', err);
    return [];
  }
}

export async function moveToReview(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify ownership
    const { data: session } = await supabase
      .from('battle_sessions')
      .select('created_by, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.created_by !== user.id)
      return { success: false, error: 'Only the session creator can move to review' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not in active status' };

    const { error } = await supabase
      .from('battle_sessions')
      .update({ status: 'review', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));

    // Send notification to all participants
    const { data: participants } = await supabase
      .from('battle_session_participants')
      .select('user_id')
      .eq('battle_session_id', sessionId)
      .neq('user_id', user.id);

    if (participants) {
      const notifications = participants.map((p) => ({
        receiver_id: p.user_id,
        sender_id: user.id,
        type: 'info',
        text: 'The battle has moved to the review phase. Please review and confirm your results.',
        link: `/battle-session/${sessionId}`,
        dismissed: false,
      }));
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Error moving to review:', err);
    return { success: false, error: 'Failed to move to review' };
  }
}

export async function cancelBattleSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('created_by, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.created_by !== user.id)
      return { success: false, error: 'Only the session creator can cancel' };
    if (session.status === 'confirmed')
      return { success: false, error: 'Cannot cancel a confirmed session' };

    const { error } = await supabase
      .from('battle_sessions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    revalidateTag(CACHE_TAGS.USER_BATTLE_SESSIONS(user.id));

    return { success: true };
  } catch (err) {
    console.error('Error cancelling battle session:', err);
    return { success: false, error: 'Failed to cancel session' };
  }
}

export async function setSessionScenario(
  sessionId: string,
  scenario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('battle_sessions')
      .update({ scenario, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error setting scenario:', err);
    return { success: false, error: 'Failed to set scenario' };
  }
}

export async function setSessionWinner(
  sessionId: string,
  winnerGangId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('battle_sessions')
      .update({
        winner_gang_id: winnerGangId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error setting winner:', err);
    return { success: false, error: 'Failed to set winner' };
  }
}

// =============================================================================
// Participant Management
// =============================================================================

export async function addParticipant(params: {
  session_id: string;
  gang_id: string;
  user_id: string;
  role?: 'attacker' | 'defender' | 'none';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const currentUser = await getAuthenticatedUser(supabase);

    // Verify session exists and is active
    const { data: session } = await supabase
      .from('battle_sessions')
      .select('id, status, campaign_id, created_by')
      .eq('id', params.session_id)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };

    // If campaign session, validate gang is in the campaign
    if (session.campaign_id) {
      const { data: campaignGang } = await supabase
        .from('campaign_gangs')
        .select('id')
        .eq('campaign_id', session.campaign_id)
        .eq('gang_id', params.gang_id)
        .maybeSingle();

      if (!campaignGang)
        return { success: false, error: 'Gang is not in this campaign' };
    }

    // Snapshot gang rating
    const { data: gangData } = await supabase
      .from('gangs')
      .select('rating')
      .eq('id', params.gang_id)
      .single();

    const { error } = await supabase
      .from('battle_session_participants')
      .insert({
        battle_session_id: params.session_id,
        user_id: params.user_id,
        gang_id: params.gang_id,
        role: params.role || 'none',
        gang_rating_snapshot: gangData?.rating ?? 0,
      });

    if (error) {
      if (error.code === '23505')
        return { success: false, error: 'Gang is already in this session' };
      return { success: false, error: error.message };
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(params.session_id));

    // Send notification if adding someone else
    if (params.user_id !== currentUser.id) {
      await supabase.from('notifications').insert({
        receiver_id: params.user_id,
        sender_id: currentUser.id,
        type: 'battle_invite',
        text: 'You have been invited to a battle session.',
        link: `/battle-session/${params.session_id}`,
        dismissed: false,
      });
    }

    return { success: true };
  } catch (err) {
    console.error('Error adding participant:', err);
    return { success: false, error: 'Failed to add participant' };
  }
}

export async function removeParticipant(
  sessionId: string,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('battle_session_participants')
      .delete()
      .eq('id', participantId)
      .eq('battle_session_id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error removing participant:', err);
    return { success: false, error: 'Failed to remove participant' };
  }
}

// =============================================================================
// Fighter Management
// =============================================================================

export async function addFighterToSession(params: {
  session_id: string;
  participant_id: string;
  fighter_id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('battle_session_fighters')
      .insert({
        battle_session_id: params.session_id,
        participant_id: params.participant_id,
        fighter_id: params.fighter_id,
      });

    if (error) {
      if (error.code === '23505')
        return { success: false, error: 'Fighter is already in this session' };
      return { success: false, error: error.message };
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(params.session_id));
    return { success: true };
  } catch (err) {
    console.error('Error adding fighter to session:', err);
    return { success: false, error: 'Failed to add fighter' };
  }
}

export async function removeFighterFromSession(
  sessionId: string,
  fighterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('battle_session_fighters')
      .delete()
      .eq('battle_session_id', sessionId)
      .eq('fighter_id', fighterId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error removing fighter:', err);
    return { success: false, error: 'Failed to remove fighter' };
  }
}

export async function bulkAddFightersToSession(params: {
  session_id: string;
  participant_id: string;
  fighter_ids: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const rows = params.fighter_ids.map((fighter_id) => ({
      battle_session_id: params.session_id,
      participant_id: params.participant_id,
      fighter_id,
    }));

    const { error } = await supabase
      .from('battle_session_fighters')
      .upsert(rows, { onConflict: 'battle_session_id,fighter_id' });

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(params.session_id));
    return { success: true };
  } catch (err) {
    console.error('Error bulk adding fighters:', err);
    return { success: false, error: 'Failed to add fighters' };
  }
}

// =============================================================================
// Battle Outcomes
// =============================================================================

export async function updateFighterOutcome(params: {
  session_fighter_id: string;
  xp_earned?: number;
  out_of_action?: boolean;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const updateData: Record<string, any> = {};
    if (params.xp_earned !== undefined) updateData.xp_earned = params.xp_earned;
    if (params.out_of_action !== undefined)
      updateData.out_of_action = params.out_of_action;
    if (params.note !== undefined) updateData.note = params.note;

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const { error } = await supabase
      .from('battle_session_fighters')
      .update(updateData)
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error updating fighter outcome:', err);
    return { success: false, error: 'Failed to update fighter outcome' };
  }
}

export async function addPendingInjury(params: {
  session_fighter_id: string;
  fighter_effect_type_id: string;
  effect_name: string;
  send_to_recovery?: boolean;
  set_captured?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // Fetch current injuries
    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('pending_injuries, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const injuries: PendingInjury[] = fighter.pending_injuries || [];
    injuries.push({
      fighter_effect_type_id: params.fighter_effect_type_id,
      effect_name: params.effect_name,
      send_to_recovery: params.send_to_recovery ?? false,
      set_captured: params.set_captured ?? false,
    });

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ pending_injuries: injuries })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error adding pending injury:', err);
    return { success: false, error: 'Failed to add injury' };
  }
}

export async function removePendingInjury(params: {
  session_fighter_id: string;
  injury_index: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('pending_injuries, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const injuries: PendingInjury[] = fighter.pending_injuries || [];
    if (params.injury_index < 0 || params.injury_index >= injuries.length)
      return { success: false, error: 'Invalid injury index' };

    injuries.splice(params.injury_index, 1);

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ pending_injuries: injuries })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error removing pending injury:', err);
    return { success: false, error: 'Failed to remove injury' };
  }
}

export async function updateGangOutcome(params: {
  participant_id: string;
  credits_earned?: number;
  reputation_change?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const updateData: Record<string, any> = {};
    if (params.credits_earned !== undefined)
      updateData.credits_earned = params.credits_earned;
    if (params.reputation_change !== undefined)
      updateData.reputation_change = params.reputation_change;

    const { data: participant, error: fetchError } = await supabase
      .from('battle_session_participants')
      .select('battle_session_id')
      .eq('id', params.participant_id)
      .single();

    if (fetchError || !participant)
      return { success: false, error: 'Participant not found' };

    const { error } = await supabase
      .from('battle_session_participants')
      .update(updateData)
      .eq('id', params.participant_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(
      CACHE_TAGS.BASE_BATTLE_SESSION(participant.battle_session_id)
    );
    return { success: true };
  } catch (err) {
    console.error('Error updating gang outcome:', err);
    return { success: false, error: 'Failed to update gang outcome' };
  }
}

// =============================================================================
// Confirmation & Apply
// =============================================================================

export async function confirmBattleResults(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Update current user's confirmation
    const { error } = await supabase
      .from('battle_session_participants')
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
      })
      .eq('battle_session_id', sessionId)
      .eq('user_id', user.id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));

    // Notify unconfirmed participants
    const { data: unconfirmed } = await supabase
      .from('battle_session_participants')
      .select('user_id')
      .eq('battle_session_id', sessionId)
      .eq('confirmed', false);

    if (unconfirmed && unconfirmed.length > 0) {
      const notifications = unconfirmed.map((p) => ({
        receiver_id: p.user_id,
        sender_id: user.id,
        type: 'info',
        text: 'A player has confirmed their battle results. Waiting on your confirmation.',
        link: `/battle-session/${sessionId}`,
        dismissed: false,
      }));
      await supabase.from('notifications').insert(notifications);
    }

    return { success: true };
  } catch (err) {
    console.error('Error confirming battle results:', err);
    return { success: false, error: 'Failed to confirm results' };
  }
}

export async function applyBattleResults(
  sessionId: string
): Promise<{
  success: boolean;
  campaign_battle_id?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Call the atomic RPC
    const { data, error } = await supabase.rpc(
      'apply_battle_session_results',
      { in_session_id: sessionId }
    );

    if (error) return { success: false, error: error.message };

    const result = data as { success: boolean; campaign_battle_id: string | null };

    // Fetch session data for cache invalidation and logging
    const { data: participants } = await supabase
      .from('battle_session_participants')
      .select('user_id, gang_id, credits_earned, reputation_change')
      .eq('battle_session_id', sessionId);

    const { data: fighters } = await supabase
      .from('battle_session_fighters')
      .select('fighter_id, xp_earned, pending_injuries, participant_id')
      .eq('battle_session_id', sessionId);

    // Invalidate caches for affected gangs and fighters
    if (participants) {
      for (const p of participants) {
        if (p.credits_earned !== 0 || p.reputation_change !== 0) {
          invalidateGangFinancials(p.gang_id);
        }
      }
    }

    if (fighters) {
      // Build participant→gang lookup
      const participantMap = new Map<string, string>();
      if (participants) {
        const { data: partRows } = await supabase
          .from('battle_session_participants')
          .select('id, gang_id')
          .eq('battle_session_id', sessionId);
        partRows?.forEach((pr) => participantMap.set(pr.id, pr.gang_id));
      }

      for (const f of fighters) {
        const gangId = participantMap.get(f.participant_id);
        if (gangId && (f.xp_earned > 0 || (f.pending_injuries?.length ?? 0) > 0)) {
          invalidateFighterAdvancement({
            fighterId: f.fighter_id,
            gangId,
            advancementType: f.pending_injuries?.length > 0 ? 'injury' : 'stat',
          });
        }
      }
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    revalidateTag(CACHE_TAGS.USER_BATTLE_SESSIONS(user.id));
    if (result.campaign_battle_id) {
      revalidateTag('campaign-battles');
    }

    // Log battle results for each participant
    const { data: session } = await supabase
      .from('battle_sessions')
      .select('scenario, winner_gang_id, campaign_id')
      .eq('id', sessionId)
      .single();

    if (session && participants) {
      // Fetch gang names for logging
      const gangIds = participants.map((p) => p.gang_id);
      const { data: gangNames } = await supabase
        .from('gangs')
        .select('id, name')
        .in('id', gangIds);
      const gangNameMap = new Map(
        gangNames?.map((g) => [g.id, g.name]) || []
      );

      let campaignName = 'Standalone Battle';
      if (session.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('campaign_name')
          .eq('id', session.campaign_id)
          .single();
        campaignName = campaign?.campaign_name || campaignName;
      }

      for (const p of participants) {
        const gangName = gangNameMap.get(p.gang_id);
        if (!gangName) continue;

        let battleResult: 'won' | 'lost' | 'draw';
        if (session.winner_gang_id === null) {
          battleResult = 'draw';
        } else if (session.winner_gang_id === p.gang_id) {
          battleResult = 'won';
        } else {
          battleResult = 'lost';
        }

        const opponents = participants
          .filter((op) => op.gang_id !== p.gang_id)
          .map((op) => gangNameMap.get(op.gang_id))
          .filter(Boolean)
          .join(', ');

        try {
          await logBattleResult({
            gang_id: p.gang_id,
            gang_name: gangName,
            campaign_name: campaignName,
            opponent_name: opponents || 'Unknown',
            scenario: session.scenario || 'Unknown Scenario',
            result: battleResult,
          });
        } catch (logErr) {
          console.error('Error logging battle result:', logErr);
        }
      }
    }

    // Notify all participants that results were applied
    if (participants) {
      const notifications = participants
        .filter((p) => p.user_id !== user.id)
        .map((p) => ({
          receiver_id: p.user_id,
          sender_id: user.id,
          type: 'info',
          text: 'Battle results have been applied. Check your gang for updates.',
          link: `/gang/${p.gang_id}`,
          dismissed: false,
        }));
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    return {
      success: true,
      campaign_battle_id: result.campaign_battle_id || undefined,
    };
  } catch (err) {
    console.error('Error applying battle results:', err);
    return { success: false, error: 'Failed to apply battle results' };
  }
}
