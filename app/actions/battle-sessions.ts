'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import {
  CACHE_TAGS,
} from '@/utils/cache-tags';
import { logBattleResult } from '@/app/actions/logs/gang-campaign-logs';
import { createBattleLog } from '@/app/actions/campaigns/[id]/battle-logs';
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
  gang_ids?: string[];
}): Promise<{ success: boolean; session_id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();
    const senderName = profile?.username || 'Someone';

    const { data, error } = await supabase
      .from('battle_sessions')
      .insert({
        created_by: user.id,
        campaign_id: params.campaign_id || null,
        scenario: params.scenario || null,
        status: 'pre_battle',
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    const sessionId = data.id;

    if (params.gang_ids && params.gang_ids.length > 0) {
      const { data: gangs } = await supabase
        .from('gangs')
        .select('id, user_id, rating')
        .in('id', params.gang_ids);

      if (gangs && gangs.length > 0) {
        const participants = gangs.map((g) => ({
          battle_session_id: sessionId,
          user_id: g.user_id,
          gang_id: g.id,
          role: 'none' as const,
          gang_rating_snapshot: g.rating ?? 0,
        }));

        await supabase.from('battle_session_participants').insert(participants);

        const otherGangs = gangs.filter((g) => g.user_id && g.user_id !== user.id);

        if (otherGangs.length > 0) {
          await supabase.from('notifications').insert(
            otherGangs.map((g) => ({
              receiver_id: g.user_id,
              sender_id: user.id,
              type: 'invite',
              text: `${senderName} added you to a battle session.`,
              link: `/gang/${g.id}/battle-session/${sessionId}`,
              dismissed: false,
            }))
          );
        }
      }
    }

    return { success: true, session_id: sessionId };
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
    if (session.status === 'completed')
      return { success: false, error: 'Cannot cancel a completed session' };

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

async function updateSessionAsCreator(
  sessionId: string,
  updateFields: Record<string, unknown>,
  options?: { requireStatus?: string; statusError?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { data: session } = await supabase
    .from('battle_sessions')
    .select('created_by, status')
    .eq('id', sessionId)
    .single();

  if (!session) return { success: false, error: 'Session not found' };
  if (session.created_by !== user.id)
    return { success: false, error: 'Only the session creator can perform this action' };
  if (options?.requireStatus && session.status !== options.requireStatus)
    return { success: false, error: options.statusError || 'Invalid session status' };

  const { error } = await supabase
    .from('battle_sessions')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) return { success: false, error: error.message };

  revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
  return { success: true };
}

export async function setSessionScenario(
  sessionId: string,
  scenario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateSessionAsCreator(sessionId, { scenario });
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
    return await updateSessionAsCreator(sessionId, { winner_gang_id: winnerGangId });
  } catch (err) {
    console.error('Error setting winner:', err);
    return { success: false, error: 'Failed to set winner' };
  }
}

export async function advanceRound(
  sessionId: string
): Promise<{ success: boolean; newRound?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status, round')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };

    const nextRound = session.round + 1;

    const { error: updateError } = await supabase
      .from('battle_sessions')
      .update({ round: nextRound, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) return { success: false, error: updateError.message };

    const { data: fighters } = await supabase
      .from('battle_session_fighters')
      .select('id, session_record')
      .eq('battle_session_id', sessionId);

    if (fighters && fighters.length > 0) {
      await Promise.all(
        fighters.map((f) => {
          const record: SessionRecord = {
            xp_earned: f.session_record?.xp_earned ?? 0,
            injuries: f.session_record?.injuries ?? [],
            conditions: f.session_record?.conditions ?? [],
          };
          const hasReady = record.conditions.some((c) => c.key === 'ready');
          if (!hasReady) {
            record.conditions.push({ key: 'ready', name: 'Ready' });
          }
          return supabase
            .from('battle_session_fighters')
            .update({ session_record: record })
            .eq('id', f.id);
        })
      );
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true, newRound: nextRound };
  } catch (err) {
    console.error('Error advancing round:', err);
    return { success: false, error: 'Failed to advance round' };
  }
}

// =============================================================================
// Participant Management
// =============================================================================

export async function startBattle(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateSessionAsCreator(sessionId, { status: 'active' }, {
      requireStatus: 'pre_battle',
      statusError: 'Can only start from pre-battle',
    });
  } catch (err) {
    console.error('Error starting battle:', err);
    return { success: false, error: 'Failed to start battle' };
  }
}

export async function returnToSetup(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateSessionAsCreator(sessionId, { status: 'pre_battle' }, {
      requireStatus: 'active',
      statusError: 'Can only return to pre-battle from active',
    });
  } catch (err) {
    console.error('Error returning to setup:', err);
    return { success: false, error: 'Failed to return to pre-battle' };
  }
}

export async function addParticipant(params: {
  session_id: string;
  gang_id: string;
  user_id: string;
  role?: 'attacker' | 'defender' | 'none';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const currentUser = await getAuthenticatedUser(supabase);

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', currentUser.id)
      .single();
    const senderName = currentProfile?.username || 'Someone';

    // Verify session exists and is active
    const { data: session } = await supabase
      .from('battle_sessions')
      .select('id, status, campaign_id, created_by')
      .eq('id', params.session_id)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'pre_battle')
      return { success: false, error: 'Can only add players during pre-battle' };
    if (session.created_by !== currentUser.id)
      return { success: false, error: 'Only the session creator can add participants' };

    // Validate gang belongs to the specified user
    const { data: gangOwner } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.gang_id)
      .single();
    if (gangOwner?.user_id !== params.user_id)
      return { success: false, error: 'User does not own this gang' };

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
        text: `${senderName} invited you to a battle session.`,
        link: `/gang/${params.gang_id}/battle-session/${params.session_id}`,
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

export async function updateParticipantRole(
  sessionId: string,
  participantId: string,
  role: 'attacker' | 'defender' | 'none'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('id, status, created_by')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'pre_battle')
      return { success: false, error: 'Roles can only be changed during pre-battle' };

    const { data: participant } = await supabase
      .from('battle_session_participants')
      .select('user_id')
      .eq('id', participantId)
      .eq('battle_session_id', sessionId)
      .single();

    if (!participant) return { success: false, error: 'Participant not found' };

    if (participant.user_id !== user.id && session.created_by !== user.id)
      return { success: false, error: 'Not authorized to change this role' };

    const { error } = await supabase
      .from('battle_session_participants')
      .update({ role })
      .eq('id', participantId)
      .eq('battle_session_id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error updating participant role:', err);
    return { success: false, error: 'Failed to update role' };
  }
}

// =============================================================================
// Fighter Management
// =============================================================================

export async function removeFighterFromSession(
  sessionId: string,
  fighterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    if (session?.status !== 'pre_battle')
      return { success: false, error: 'Crew can only be changed during pre-battle' };

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

export async function updateFighterLoadout(
  sessionId: string,
  fighterId: string,
  loadoutId: string | undefined
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    if (session?.status !== 'pre_battle')
      return { success: false, error: 'Crew can only be changed during pre-battle' };

    const { error } = await supabase
      .from('battle_session_fighters')
      .update({ loadout_id: loadoutId ?? null })
      .eq('battle_session_id', sessionId)
      .eq('fighter_id', fighterId);

    if (error) return { success: false, error: error.message };

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));
    return { success: true };
  } catch (err) {
    console.error('Error updating fighter loadout:', err);
    return { success: false, error: 'Failed to update loadout' };
  }
}

export async function bulkAddFightersToSession(params: {
  session_id: string;
  participant_id: string;
  fighter_entries: { fighter_id: string; loadout_id?: string }[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, params.session_id, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };
    if (auth.participantId !== params.participant_id)
      return { success: false, error: 'Not authorized for this participant' };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', params.session_id)
      .single();
    if (session?.status !== 'pre_battle')
      return { success: false, error: 'Crew can only be changed during pre-battle' };

    const { data: participant } = await supabase
      .from('battle_session_participants')
      .select('gang_id')
      .eq('id', auth.participantId)
      .single();
    if (!participant) return { success: false, error: 'Participant not found' };

    const fighterIds = params.fighter_entries.map((e) => e.fighter_id);
    const { data: validFighters } = await supabase
      .from('fighters')
      .select('id')
      .eq('gang_id', participant.gang_id)
      .in('id', fighterIds);
    const validIds = new Set(validFighters?.map((f) => f.id));
    if (fighterIds.some((id) => !validIds.has(id)))
      return { success: false, error: 'One or more fighters do not belong to your gang' };

    const rows = params.fighter_entries.map((entry) => ({
      battle_session_id: params.session_id,
      participant_id: auth.participantId!,
      fighter_id: entry.fighter_id,
      ...(entry.loadout_id ? { loadout_id: entry.loadout_id } : {}),
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

async function withSessionRecord(
  sessionFighterId: string,
  updateFn: (record: SessionRecord) => SessionRecord | { error: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { data: fighter, error: fetchError } = await supabase
    .from('battle_session_fighters')
    .select('session_record, battle_session_id')
    .eq('id', sessionFighterId)
    .single();

  if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

  const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id);
  if (!auth.authorized) return { success: false, error: auth.error };

  const record: SessionRecord = {
    xp_earned: fighter.session_record?.xp_earned ?? 0,
    injuries: fighter.session_record?.injuries ?? [],
    conditions: fighter.session_record?.conditions ?? [],
  };

  const result = updateFn(record);
  if ('error' in result) return { success: false, error: result.error };

  const { error } = await supabase
    .from('battle_session_fighters')
    .update({ session_record: result })
    .eq('id', sessionFighterId);

  if (error) return { success: false, error: error.message };

  revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(fighter.battle_session_id));
  return { success: true };
}

export async function updateSessionXp(params: {
  session_fighter_id: string;
  xp_earned: number;
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => ({
    ...record,
    xp_earned: params.xp_earned,
  }));
}

export async function updateSessionConditions(params: {
  session_fighter_id: string;
  conditions: SessionCondition[];
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => ({
    ...record,
    conditions: params.conditions,
  }));
}

export async function addSessionInjury(params: {
  session_fighter_id: string;
  injury: SessionInjuryRecord;
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => ({
    ...record,
    injuries: [...record.injuries, params.injury],
  }));
}

export async function removeSessionInjury(params: {
  session_fighter_id: string;
  injury_id: string;
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => {
    const idx = record.injuries.findIndex((i) => i.fighter_effect_id === params.injury_id);
    if (idx === -1) return { error: 'Injury not found' };
    return {
      ...record,
      injuries: record.injuries.filter((_, i) => i !== idx),
    };
  });
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

    await supabase
      .from('battle_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', participant.battle_session_id);

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
  sessionId: string,
  options?: { campaign_territory_id?: string; note?: string; cycle?: number | null; reputation_changes?: Record<string, number>; income_changes?: Record<string, number> }
): Promise<{
  success: boolean;
  campaign_battle_id?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();
    const senderName = userProfile?.username || 'Someone';

    const auth = await verifySessionCreator(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status, campaign_id, scenario, winner_gang_id, created_at')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };

    let campaign_battle_id: string | undefined;

    const { data: allParticipants } = await supabase
      .from('battle_session_participants')
      .select('id, gang_id, user_id, role')
      .eq('battle_session_id', sessionId);

    if (session.campaign_id && allParticipants) {
      try {
        const battleLog = await createBattleLog(session.campaign_id, {
          scenario: session.scenario || '',
          attacker_id: allParticipants.find((p) => p.role === 'attacker')?.gang_id || allParticipants[0]?.gang_id || allParticipants[1]?.gang_id || '',
          defender_id: allParticipants.find((p) => p.role === 'defender')?.gang_id || allParticipants[1]?.gang_id || allParticipants[0]?.gang_id || '',
          winner_id: session.winner_gang_id,
          note: options?.note || null,
          participants: allParticipants.map((p) => ({ gang_id: p.gang_id, role: p.role as 'attacker' | 'defender' | 'none' })),
          claimed_territories: options?.campaign_territory_id
            ? [{ campaign_territory_id: options.campaign_territory_id }]
            : [],
          created_at: session.created_at,
          cycle: options?.cycle ?? null,
        });
        campaign_battle_id = battleLog?.id;
      } catch (err) {
        console.error('Error creating campaign battle log:', err);
        return { success: false, error: 'Failed to create campaign battle log' };
      }
    }

    const { data: updated, error } = await supabase
      .from('battle_sessions')
      .update({
        status: 'completed',
        campaign_battle_id: campaign_battle_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select('id');

    if (error || !updated || updated.length === 0) {
      if (campaign_battle_id) {
        await supabase.from('campaign_battles').delete().eq('id', campaign_battle_id);
      }
      return { success: false, error: error?.message || 'Session was already completed' };
    }

    const validParticipantIds = new Set(allParticipants?.map((p) => p.id) ?? []);

    if (options?.reputation_changes) {
      for (const [participantId, repValue] of Object.entries(options.reputation_changes)) {
        if (!validParticipantIds.has(participantId)) continue;

        const { data: part } = await supabase
          .from('battle_session_participants')
          .select('gang_id, reputation_change')
          .eq('id', participantId)
          .single();
        if (!part) continue;

        const delta = repValue - part.reputation_change;
        if (delta === 0) continue;

        const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
        await updateGang({
          gang_id: part.gang_id,
          reputation: Math.abs(delta),
          reputation_operation: operation,
        });
        await supabase
          .from('battle_session_participants')
          .update({ reputation_change: repValue })
          .eq('id', participantId);
      }
    }

    if (options?.income_changes) {
      for (const [participantId, delta] of Object.entries(options.income_changes)) {
        if (!validParticipantIds.has(participantId) || delta === 0) continue;

        const { data: part } = await supabase
          .from('battle_session_participants')
          .select('gang_id, credits_earned')
          .eq('id', participantId)
          .single();
        if (!part) continue;

        const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
        await updateGang({
          gang_id: part.gang_id,
          credits: Math.abs(delta),
          credits_operation: operation,
        });
        await supabase
          .from('battle_session_participants')
          .update({ credits_earned: part.credits_earned + delta })
          .eq('id', participantId);
      }
    }

    revalidateTag(CACHE_TAGS.BASE_BATTLE_SESSION(sessionId));

    if (allParticipants) {
      for (const p of allParticipants) {
        revalidateTag(CACHE_TAGS.GANG_BATTLE_SESSIONS(p.gang_id));
      }

      // Log battle results for non-campaign sessions (campaign logging handled by createBattleLog)
      if (!session.campaign_id) {
        const gangIds = allParticipants.map((p) => p.gang_id);
        const { data: gangNames } = await supabase
          .from('gangs')
          .select('id, name')
          .in('id', gangIds);
        const gangNameMap = new Map(gangNames?.map((g) => [g.id, g.name]) || []);

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
              campaign_name: 'Standalone Battle',
              opponent_name: opponents || 'Unknown',
              scenario: session.scenario || 'Unknown Scenario',
              result: battleResult,
            });
          } catch (logErr) {
            console.error('Error logging battle result:', logErr);
          }
        }
      }

      // Notify participants
      const notifications = allParticipants
        .filter((p) => p.user_id !== user.id)
        .map((p) => ({
          receiver_id: p.user_id,
          sender_id: user.id,
          type: 'info',
          text: `${senderName} completed a battle session.`,
          link: `/gang/${p.gang_id}/battle-session/${sessionId}`,
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

