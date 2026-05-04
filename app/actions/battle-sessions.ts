'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import {
  CACHE_TAGS,
} from '@/utils/cache-tags';
import { logBattleResult } from '@/app/actions/logs/gang-campaign-logs';
import { updateGang } from '@/app/actions/update-gang';
import type {
  SessionCondition,
  SessionInjuryRecord,
  SessionRecord,
} from '@/types/battle-session';

// =============================================================================
// Authorization Helpers
// =============================================================================

async function verifySessionCreator(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
): Promise<{ authorized: boolean; error?: string }> {
  const { data: session } = await supabase
    .from('battle_sessions')
    .select('created_by')
    .eq('id', sessionId)
    .single();

  if (!session) return { authorized: false, error: 'Session not found' };
  if (session.created_by !== userId)
    return { authorized: false, error: 'Only the session creator can perform this action' };
  return { authorized: true };
}

async function verifySessionParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
): Promise<{ authorized: boolean; participantId?: string; error?: string }> {
  const { data: participant } = await supabase
    .from('battle_session_participants')
    .select('id')
    .eq('battle_session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant)
    return { authorized: false, error: 'You are not a participant in this session' };
  return { authorized: true, participantId: participant.id };
}

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

    return { success: true, session_id: data.id };
  } catch (err) {
    console.error('Error creating battle session:', err);
    return { success: false, error: 'Failed to create battle session' };
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

    const { data: participants } = await supabase
      .from('battle_session_participants')
      .select('gang_id')
      .eq('battle_session_id', sessionId);

    const { error } = await supabase
      .from('battle_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    if (participants) {
      for (const p of participants) {
        revalidateTag(CACHE_TAGS.GANG_BATTLE_SESSIONS(p.gang_id));
      }
    }

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
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionCreator(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

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

// =============================================================================
// Invites
// =============================================================================

export async function inviteToSession(params: {
  session_id: string;
  user_id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const currentUser = await getAuthenticatedUser(supabase);

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('id, status, created_by')
      .eq('id', params.session_id)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.created_by !== currentUser.id)
      return { success: false, error: 'Only the session creator can invite players' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };

    await supabase.from('notifications').insert({
      receiver_id: params.user_id,
      sender_id: currentUser.id,
      type: 'invite',
      text: 'You have been invited to a battle session. Click here to join and select your gang.',
      link: `/battle-session/${params.session_id}`,
      dismissed: false,
    });

    return { success: true };
  } catch (err) {
    console.error('Error inviting to session:', err);
    return { success: false, error: 'Failed to invite player' };
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
    revalidateTag(CACHE_TAGS.GANG_BATTLE_SESSIONS(params.gang_id));

    // Send notification if adding someone else
    if (params.user_id !== currentUser.id) {
      await supabase.from('notifications').insert({
        receiver_id: params.user_id,
        sender_id: currentUser.id,
        type: 'invite',
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
    const user = await getAuthenticatedUser(supabase);

    // Allow session creator or self-removal
    const { data: participant } = await supabase
      .from('battle_session_participants')
      .select('user_id, gang_id')
      .eq('id', participantId)
      .eq('battle_session_id', sessionId)
      .single();

    if (!participant) return { success: false, error: 'Participant not found' };

    const isSelfRemoval = participant.user_id === user.id;
    if (!isSelfRemoval) {
      const auth = await verifySessionCreator(supabase, sessionId, user.id);
      if (!auth.authorized) return { success: false, error: 'Only the session creator can remove other participants' };
    }

    const { error } = await supabase
      .from('battle_session_participants')
      .delete()
      .eq('id', participantId)
      .eq('battle_session_id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    revalidateTag(CACHE_TAGS.GANG_BATTLE_SESSIONS(participant.gang_id));
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
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

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
// Session Record — XP & Injury Tracking
// =============================================================================

export async function updateSessionXp(params: {
  session_fighter_id: string;
  xp_earned: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('session_record, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const record: SessionRecord = {
      xp_earned: fighter.session_record?.xp_earned ?? 0,
      injuries: fighter.session_record?.injuries ?? [],
      conditions: fighter.session_record?.conditions ?? [],
    };
    record.xp_earned = params.xp_earned;

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ session_record: record })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error updating session XP:', err);
    return { success: false, error: 'Failed to update session XP' };
  }
}

export async function updateSessionConditions(params: {
  session_fighter_id: string;
  conditions: SessionCondition[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('session_record, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const record: SessionRecord = {
      xp_earned: fighter.session_record?.xp_earned ?? 0,
      injuries: fighter.session_record?.injuries ?? [],
      conditions: fighter.session_record?.conditions ?? [],
    };
    record.conditions = params.conditions;

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ session_record: record })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err) {
    console.error('Error updating session conditions:', err);
    return { success: false, error: 'Failed to update session conditions' };
  }
}

export async function addSessionInjury(params: {
  session_fighter_id: string;
  injury: SessionInjuryRecord;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('session_record, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const record: SessionRecord = {
      xp_earned: fighter.session_record?.xp_earned ?? 0,
      injuries: fighter.session_record?.injuries ?? [],
      conditions: fighter.session_record?.conditions ?? [],
    };
    record.injuries.push(params.injury);

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ session_record: record })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error adding session injury:', err);
    return { success: false, error: 'Failed to add session injury' };
  }
}

export async function removeSessionInjury(params: {
  session_fighter_id: string;
  injury_index: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: fighter, error: fetchError } = await supabase
      .from('battle_session_fighters')
      .select('session_record, battle_session_id')
      .eq('id', params.session_fighter_id)
      .single();

    if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

    const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const record: SessionRecord = {
      xp_earned: fighter.session_record?.xp_earned ?? 0,
      injuries: fighter.session_record?.injuries ?? [],
      conditions: fighter.session_record?.conditions ?? [],
    };
    if (params.injury_index < 0 || params.injury_index >= record.injuries.length)
      return { success: false, error: 'Invalid injury index' };

    record.injuries.splice(params.injury_index, 1);

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ session_record: record })
      .eq('id', params.session_fighter_id);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error removing session injury:', err);
    return { success: false, error: 'Failed to remove session injury' };
  }
}

// =============================================================================
// Gang Outcomes — Applied Directly
// =============================================================================

export async function updateGangOutcome(params: {
  participant_id: string;
  gang_id: string;
  credits_change?: number;
  credits_operation?: 'add' | 'subtract';
  reputation_change?: number;
  reputation_operation?: 'add' | 'subtract';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: participant, error: fetchError } = await supabase
      .from('battle_session_participants')
      .select('battle_session_id, credits_earned, reputation_change')
      .eq('id', params.participant_id)
      .single();

    if (fetchError || !participant)
      return { success: false, error: 'Participant not found' };

    const auth = await verifySessionParticipant(supabase, participant.battle_session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const gangUpdateParams: {
      gang_id: string;
      credits?: number;
      credits_operation?: 'add' | 'subtract';
      reputation?: number;
      reputation_operation?: 'add' | 'subtract';
    } = { gang_id: params.gang_id };
    const sessionUpdate: Record<string, number> = {};

    if (params.credits_change !== undefined && params.credits_operation) {
      gangUpdateParams.credits = params.credits_change;
      gangUpdateParams.credits_operation = params.credits_operation;
      const delta = params.credits_operation === 'add' ? params.credits_change : -params.credits_change;
      sessionUpdate.credits_earned = participant.credits_earned + delta;
    }

    if (params.reputation_change !== undefined && params.reputation_operation) {
      gangUpdateParams.reputation = params.reputation_change;
      gangUpdateParams.reputation_operation = params.reputation_operation;
      const delta = params.reputation_operation === 'add' ? params.reputation_change : -params.reputation_change;
      sessionUpdate.reputation_change = participant.reputation_change + delta;
    }

    const gangResult = await updateGang(gangUpdateParams);
    if (!gangResult.success) return { success: false, error: gangResult.error };

    if (Object.keys(sessionUpdate).length > 0) {
      await supabase
        .from('battle_session_participants')
        .update(sessionUpdate)
        .eq('id', params.participant_id);
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(participant.battle_session_id));
    return { success: true };
  } catch (err) {
    console.error('Error updating gang outcome:', err);
    return { success: false, error: 'Failed to update gang outcome' };
  }
}

// =============================================================================
// Complete Battle Session
// =============================================================================

export async function completeBattleSession(
  sessionId: string
): Promise<{
  success: boolean;
  campaign_battle_id?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionCreator(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status, campaign_id, scenario, winner_gang_id, note, created_at')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };

    let campaign_battle_id: string | undefined;

    if (session.campaign_id) {
      const { data: participants } = await supabase
        .from('battle_session_participants')
        .select('gang_id, role')
        .eq('battle_session_id', sessionId);

      const { data: campaignBattle, error: cbError } = await supabase
        .from('campaign_battles')
        .insert({
          campaign_id: session.campaign_id,
          scenario: session.scenario,
          winner_id: session.winner_gang_id,
          note: session.note,
          participants: JSON.stringify(
            participants?.map((p) => ({ gang_id: p.gang_id, role: p.role })) || []
          ),
          created_at: session.created_at,
          attacker_id: participants?.find((p) => p.role === 'attacker')?.gang_id || null,
          defender_id: participants?.find((p) => p.role === 'defender')?.gang_id || null,
        })
        .select('id')
        .single();

      if (!cbError && campaignBattle) {
        campaign_battle_id = campaignBattle.id;
      }
    }

    const { error } = await supabase
      .from('battle_sessions')
      .update({
        status: 'confirmed',
        campaign_battle_id: campaign_battle_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    if (campaign_battle_id) {
      revalidateTag('campaign-battles');
    }

    // Invalidate for all participants
    const { data: allParticipants } = await supabase
      .from('battle_session_participants')
      .select('gang_id, user_id')
      .eq('battle_session_id', sessionId);

    if (allParticipants) {
      for (const p of allParticipants) {
        revalidateTag(CACHE_TAGS.GANG_BATTLE_SESSIONS(p.gang_id));
      }
    }

    // Log battle results
    if (allParticipants) {
      const gangIds = allParticipants.map((p) => p.gang_id);
      const { data: gangNames } = await supabase
        .from('gangs')
        .select('id, name')
        .in('id', gangIds);
      const gangNameMap = new Map(gangNames?.map((g) => [g.id, g.name]) || []);

      let campaignName = 'Standalone Battle';
      if (session.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('campaign_name')
          .eq('id', session.campaign_id)
          .single();
        campaignName = campaign?.campaign_name || campaignName;
      }

      for (const p of allParticipants) {
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

        const opponents = allParticipants
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

      // Notify participants
      const notifications = allParticipants
        .filter((p) => p.user_id !== user.id)
        .map((p) => ({
          receiver_id: p.user_id,
          sender_id: user.id,
          type: 'info',
          text: 'Battle session has been completed.',
          link: `/battle-session/${sessionId}`,
          dismissed: false,
        }));
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    return { success: true, campaign_battle_id };
  } catch (err) {
    console.error('Error completing battle session:', err);
    return { success: false, error: 'Failed to complete battle session' };
  }
}

// =============================================================================
// Fighter Card Data (for info modal)
// =============================================================================

export async function getFighterCardData(fighterId: string) {
  const {
    getFighterBasic,
    getFighterEquipment,
    getFighterSkills,
    getFighterEffects,
    getFighterTypeInfo,
    getFighterSubTypeInfo,
  } = await import('@/app/lib/shared/fighter-data');

  const supabase = await createClient();

  const basic = await getFighterBasic(fighterId, supabase);
  if (!basic) return null;

  const [equipment, skills, effects, typeInfo, subTypeInfo] = await Promise.all([
    getFighterEquipment(fighterId, supabase),
    getFighterSkills(fighterId, supabase),
    getFighterEffects(fighterId, supabase),
    getFighterTypeInfo(basic.fighter_type_id, supabase),
    basic.fighter_sub_type_id
      ? getFighterSubTypeInfo(basic.fighter_sub_type_id, supabase)
      : Promise.resolve(null),
  ]);

  const weapons = equipment
    .filter((item) => item.equipment_type === 'weapon')
    .map((item) => ({
      fighter_weapon_id: item.fighter_equipment_id,
      weapon_id: item.equipment_id || item.custom_equipment_id || '',
      weapon_name: item.equipment_name,
      cost: item.purchase_cost || 0,
      weapon_profiles: item.weapon_profiles || [],
      is_master_crafted: item.is_master_crafted || false,
      equipment_category: item.equipment_category || undefined,
      effect_names: item.effect_names,
    }));

  const wargear = equipment
    .filter((item) => item.equipment_type === 'wargear')
    .map((item) => ({
      fighter_weapon_id: item.fighter_equipment_id,
      wargear_id: item.equipment_id || item.custom_equipment_id || '',
      wargear_name: item.equipment_name,
      cost: item.purchase_cost || 0,
      is_master_crafted: item.is_master_crafted || false,
    }));

  return {
    id: basic.id,
    fighter_name: basic.fighter_name,
    label: basic.label,
    fighter_type: basic.fighter_type || typeInfo?.fighter_type || 'Unknown',
    fighter_class: basic.fighter_class,
    fighter_sub_type: subTypeInfo ?? undefined,
    alliance_crew_name: typeInfo?.alliance_crew_name,
    xp: basic.xp,
    kills: basic.kills || 0,
    credits: basic.credits,
    movement: basic.movement,
    weapon_skill: basic.weapon_skill,
    ballistic_skill: basic.ballistic_skill,
    strength: basic.strength,
    toughness: basic.toughness,
    wounds: basic.wounds,
    initiative: basic.initiative,
    attacks: basic.attacks,
    leadership: basic.leadership,
    cool: basic.cool,
    willpower: basic.willpower,
    intelligence: basic.intelligence,
    weapons,
    wargear,
    effects,
    skills,
    special_rules: basic.special_rules || [],
    note: basic.note,
    killed: basic.killed || false,
    starved: basic.starved || false,
    retired: basic.retired || false,
    enslaved: basic.enslaved || false,
    recovery: basic.recovery || false,
    captured: basic.captured || false,
    free_skill: basic.free_skill || false,
    image_url: basic.image_url,
  };
}
