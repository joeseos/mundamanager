'use server';

import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
import { after } from 'next/server';
import { updateGang } from '@/app/actions/update-gang';
import type {
  BattleSessionFull,
  SessionCondition,
  SessionInjuryRecord,
  SessionRecord,
} from '@/types/battle-session';
import { fetchBattleSessionDirect } from '@/app/lib/battle-sessions/get-battle-session-data';
import { checkCampaignArbitrator } from '@/utils/user-permissions';

// =============================================================================
// Data Fetching
// =============================================================================

export async function fetchBattleSession(sessionId: string): Promise<BattleSessionFull | null> {
  const supabase = await createClient();
  return fetchBattleSessionDirect(sessionId, supabase);
}

// =============================================================================
// Authorization Helpers
// =============================================================================

// Site admins and campaign OWNERs/ARBITRATORs can act on any session in their
// campaign. Mirrors the RLS policies on the battle session tables
// (private.is_admin() OR private.is_arb(campaign_id)) and the gang page
// permission model.
async function isSessionArbitrator(
  userId: string,
  campaignId: string | null
): Promise<boolean> {
  return checkCampaignArbitrator(userId, campaignId);
}

async function canManageSession(
  userId: string,
  session: { created_by: string; campaign_id: string | null }
): Promise<boolean> {
  if (session.created_by === userId) return true;
  return isSessionArbitrator(userId, session.campaign_id);
}

async function verifySessionManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
): Promise<{ authorized: boolean; error?: string }> {
  const { data: session } = await supabase
    .from('battle_sessions')
    .select('created_by, campaign_id')
    .eq('id', sessionId)
    .single();

  if (!session) return { authorized: false, error: 'Session not found' };
  if (!(await canManageSession(userId, session)))
    return { authorized: false, error: 'Only the session creator or an arbitrator can perform this action' };
  return { authorized: true };
}

// Arbitrators (not the session creator) may act on another player's
// participant slot — same rights they have over that player's gang page.
async function isArbitratorForSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data: session } = await supabase
    .from('battle_sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .single();
  if (!session) return false;
  return isSessionArbitrator(userId, session.campaign_id);
}

// Authorizes the user's own participant slot, or any slot for arbitrators.
// NOTE: callers that need a participant row MUST pass `participantId` — the
// no-participantId form authorizes session-wide actions and returns no
// participantId when the caller is an arbitrator without a gang in the session.
async function verifySessionParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string,
  participantId?: string
): Promise<{ authorized: boolean; participantId?: string; error?: string }> {
  if (participantId) {
    const { data: participant } = await supabase
      .from('battle_session_participants')
      .select('id, user_id, battle_sessions(campaign_id)')
      .eq('id', participantId)
      .eq('battle_session_id', sessionId)
      .maybeSingle();

    if (!participant)
      return { authorized: false, error: 'You are not a participant in this session' };
    if (participant.user_id !== userId) {
      const session = Array.isArray(participant.battle_sessions)
        ? participant.battle_sessions[0]
        : participant.battle_sessions;
      if (!(await isSessionArbitrator(userId, session?.campaign_id ?? null)))
        return { authorized: false, error: 'You are not a participant in this session' };
    }
    return { authorized: true, participantId: participant.id };
  }

  const { data: participants } = await supabase
    .from('battle_session_participants')
    .select('id')
    .eq('battle_session_id', sessionId)
    .eq('user_id', userId)
    .limit(1);

  const participant = participants?.[0];
  if (participant) return { authorized: true, participantId: participant.id };

  if (await isArbitratorForSession(supabase, sessionId, userId))
    return { authorized: true };
  return { authorized: false, error: 'You are not a participant in this battle session' };
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
        revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
        for (const g of gangs) {
          revalidateTag(TAGS.gangBattleSessions(g.id), { expire: 0 });
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
      .select('created_by, campaign_id, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };
    if (!(await canManageSession(user.id, session)))
      return { success: false, error: 'Only the session creator or an arbitrator can cancel' };
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

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    if (participants) {
      for (const p of participants) {
        revalidateTag(TAGS.gangBattleSessions(p.gang_id), { expire: 0 });
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Error cancelling battle session:', err);
    return { success: false, error: 'Failed to cancel session' };
  }
}

async function updateSessionAsManager(
  sessionId: string,
  updateFields: Record<string, unknown>,
  options?: { requireStatus?: string; statusError?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { data: session } = await supabase
    .from('battle_sessions')
    .select('created_by, campaign_id, status')
    .eq('id', sessionId)
    .single();

  if (!session) return { success: false, error: 'Session not found' };
  if (!(await canManageSession(user.id, session)))
    return { success: false, error: 'Only the session creator or an arbitrator can perform this action' };
  if (options?.requireStatus && session.status !== options.requireStatus)
    return { success: false, error: options.statusError || 'Invalid session status' };

  const { error } = await supabase
    .from('battle_sessions')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) return { success: false, error: error.message };

  revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
  return { success: true };
}

export async function setSessionScenario(
  sessionId: string,
  scenario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateSessionAsManager(sessionId, { scenario });
  } catch (err) {
    console.error('Error setting scenario:', err);
    return { success: false, error: 'Failed to set scenario' };
  }
}

/**
 * Multi-winner support: persist `is_winner` and `claimed_territory` flags on
 * each `battle_session_participants` row, and keep `battle_sessions.winner_gang_id`
 * in sync with the territory claimer (or the first winner) as a legacy fallback.
 *
 * Pass an empty array (or omit `winners`) to record a draw — every flag is cleared
 * and `winner_gang_id` is set to NULL.
 */
export async function setSessionWinners(
  sessionId: string,
  winners: Array<{ gang_id: string; claimed_territory?: boolean }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionManager(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const claimers = winners.filter((w) => w.claimed_territory === true);
    if (claimers.length > 1) {
      return { success: false, error: 'Only one winner can claim a territory' };
    }
    const claimerGangId = claimers[0]?.gang_id ?? null;

    const { data: sessionParticipants } = await supabase
      .from('battle_session_participants')
      .select('id, gang_id')
      .eq('battle_session_id', sessionId);

    if (!sessionParticipants) {
      return { success: false, error: 'Session has no participants' };
    }

    const winnerGangSet = new Set(winners.map((w) => w.gang_id));
    const invalidWinner = winners.find(
      (w) => !sessionParticipants.some((p) => p.gang_id === w.gang_id)
    );
    if (invalidWinner) {
      return { success: false, error: 'A selected winner is not a session participant' };
    }

    // Update each participant row. Doing this row-by-row keeps things simple
    // and avoids the awkward CASE statement that a single SQL update would need
    // to write different values for is_winner / claimed_territory per row.
    const updateResults = await Promise.all(
      sessionParticipants.map((p) =>
        supabase
          .from('battle_session_participants')
          .update({
            is_winner: winnerGangSet.has(p.gang_id),
            claimed_territory: claimerGangId !== null && p.gang_id === claimerGangId,
          })
          .eq('id', p.id)
      )
    );
    const failedUpdate = updateResults.find((r) => r.error);
    if (failedUpdate) {
      return {
        success: false,
        error: `Failed to update participant flags: ${failedUpdate.error!.message}`,
      };
    }

    // Legacy winner_gang_id: prefer the territory claimer; otherwise the first
    // winner; NULL for draws. Mirrors the campaign battle action.
    const legacyWinnerGangId: string | null =
      claimerGangId ?? winners[0]?.gang_id ?? null;
    const { error: sessionUpdateError } = await supabase
      .from('battle_sessions')
      .update({
        winner_gang_id: legacyWinnerGangId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (sessionUpdateError) {
      return { success: false, error: `Failed to update session: ${sessionUpdateError.message}` };
    }

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    return { success: true };
  } catch (err) {
    console.error('Error setting session winners:', err);
    return { success: false, error: 'Failed to set winners' };
  }
}

/**
 * @deprecated Use `setSessionWinners` to support multi-winner battles. This
 * thin shim is kept so existing callers that only know about a single winner
 * (or want to record a draw via `null`) continue to work.
 */
export async function setSessionWinner(
  sessionId: string,
  winnerGangId: string | null
): Promise<{ success: boolean; error?: string }> {
  return setSessionWinners(
    sessionId,
    winnerGangId ? [{ gang_id: winnerGangId, claimed_territory: false }] : []
  );
}

export async function advanceRound(
  sessionId: string,
  direction: 'forward' | 'back' = 'forward'
): Promise<{ success: boolean; newRound?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const serviceSupabase = createServiceRoleClient();

    const { data: session, error: sessionError } = await serviceSupabase
      .from('battle_sessions')
      .select('status, round')
      .eq('id', sessionId)
      .single();

    if (sessionError) return { success: false, error: sessionError.message };
    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'active')
      return { success: false, error: 'Session is not active' };
    if (direction === 'back' && session.round <= 1)
      return { success: false, error: 'Already at round 1' };

    const nextRound = direction === 'forward' ? session.round + 1 : session.round - 1;

    const { error: updateError } = await serviceSupabase
      .from('battle_sessions')
      .update({ round: nextRound, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) return { success: false, error: updateError.message };

    const { data: fighters, error: fightersError } = await serviceSupabase
      .from('battle_session_fighters')
      .select('id, fighter_id, session_record')
      .eq('battle_session_id', sessionId);

    if (fightersError) {
      console.error('[advanceRound] Failed to load fighters after round advanced:', {
        sessionId,
        newRound: nextRound,
        error: fightersError.message,
      });
    } else if (fighters && fighters.length > 0) {
      const fighterIds = fighters.map((f) => f.fighter_id);
      const { data: fighterDetails, error: fighterDetailsError } = await serviceSupabase
        .from('fighters')
        .select('id, special_rules')
        .in('id', fighterIds);

      if (fighterDetailsError) {
        console.error('[advanceRound] Failed to load fighter details after round advanced:', {
          sessionId,
          newRound: nextRound,
          error: fighterDetailsError.message,
        });
      } else {
        const rulesMap = new Map(
          (fighterDetails ?? []).map((f: any) => [f.id, f.special_rules as string[] | null])
        );
        const DUAL_ACTIVATION_RULES = ['Spyre Hunter', 'Aranthian Beauty Plating'];

        const activationResults = await Promise.all(
          fighters.map((f) => {
            const rules = rulesMap.get(f.fighter_id);
            const isDual = rules?.some((r) => DUAL_ACTIVATION_RULES.includes(r)) ?? false;
            // Injured fighters are out of action and get no fresh activation;
            // players can still grant one manually via updateActivations
            const isInjured = (f.session_record?.injuries?.length ?? 0) > 0;
            const record: SessionRecord = {
              xp_earned: f.session_record?.xp_earned ?? 0,
              injuries: f.session_record?.injuries ?? [],
              conditions: f.session_record?.conditions ?? [],
              note: f.session_record?.note,
              activations: isInjured ? 0 : isDual ? 2 : 1,
            };
            return serviceSupabase
              .from('battle_session_fighters')
              .update({ session_record: record })
              .eq('id', f.id);
          })
        );

        const activationErrors = activationResults
          .map((result) => result.error)
          .filter((error): error is NonNullable<typeof error> => Boolean(error));
        if (activationErrors.length > 0) {
          console.error('[advanceRound] Activation refresh failed after round advanced:', {
            sessionId,
            newRound: nextRound,
            errors: activationErrors.map((error) => error.message),
          });
        }
      }
    }

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    return { success: true, newRound: nextRound };
  } catch (err) {
    console.error('Error changing round:', err);
    return { success: false, error: 'Failed to change round' };
  }
}

// =============================================================================
// Participant Management
// =============================================================================

export async function toggleParticipantReady(
  sessionId: string,
  participantId: string
): Promise<{ success: boolean; battleStarted?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id, participantId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    if (!session || (session.status !== 'pre_battle' && session.status !== 'post_battle'))
      return { success: false, error: 'Can only toggle ready during pre-battle or post-battle' };

    const { data: myParticipant } = await supabase
      .from('battle_session_participants')
      .select('id, ready')
      .eq('id', participantId)
      .eq('battle_session_id', sessionId)
      .single();
    if (!myParticipant) return { success: false, error: 'Participant not found' };

    const newReady = !myParticipant.ready;
    await supabase
      .from('battle_session_participants')
      .update({ ready: newReady })
      .eq('id', myParticipant.id);

    let battleStarted = false;
    if (newReady && session.status === 'pre_battle') {
      const { data: allParticipants } = await supabase
        .from('battle_session_participants')
        .select('ready')
        .eq('battle_session_id', sessionId);

      const allReady =
        allParticipants &&
        allParticipants.length >= 2 &&
        allParticipants.every((p) => p.ready);

      if (allReady) {
        const { data: started } = await supabase
          .from('battle_sessions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('status', 'pre_battle')
          .select('id');
        battleStarted = (started?.length ?? 0) > 0;
      }
    }

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    return { success: true, battleStarted };
  } catch (err) {
    console.error('Error toggling ready:', err);
    return { success: false, error: 'Failed to toggle ready' };
  }
}

export async function changeSessionPhase(
  sessionId: string,
  direction: 'forward' | 'back'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionManager(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false, error: 'Session not found' };

    const transitions: Record<string, Record<string, string>> = {
      forward: { active: 'post_battle' },
      back: { active: 'pre_battle', post_battle: 'active' },
    };
    const targetStatus = transitions[direction]?.[session.status];
    if (!targetStatus)
      return { success: false, error: 'Invalid phase transition' };

    const { error } = await supabase
      .from('battle_sessions')
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };

    await supabase
      .from('battle_session_participants')
      .update({ ready: false })
      .eq('battle_session_id', sessionId);

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    return { success: true };
  } catch (err) {
    console.error('Error changing session phase:', err);
    return { success: false, error: 'Failed to change session phase' };
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
    if (!(await canManageSession(currentUser.id, session)))
      return { success: false, error: 'Only the session creator or an arbitrator can add participants' };

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

    await supabase
      .from('battle_session_participants')
      .update({ ready: false })
      .eq('battle_session_id', params.session_id);

    revalidateTag(TAGS.battleSession(params.session_id), { expire: 0 });
    revalidateTag(TAGS.gangBattleSessions(params.gang_id), { expire: 0 });

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
      const auth = await verifySessionManager(supabase, sessionId, user.id);
      if (!auth.authorized) return { success: false, error: 'Only the session creator or an arbitrator can remove other participants' };
    }

    const { error } = await supabase
      .from('battle_session_participants')
      .delete()
      .eq('id', participantId)
      .eq('battle_session_id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    revalidateTag(TAGS.gangBattleSessions(participant.gang_id), { expire: 0 });
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
      .select('id, status, created_by, campaign_id')
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

    if (participant.user_id !== user.id && !(await canManageSession(user.id, session)))
      return { success: false, error: 'Not authorized to change this role' };

    const { error } = await supabase
      .from('battle_session_participants')
      .update({ role })
      .eq('id', participantId)
      .eq('battle_session_id', sessionId);

    if (error) return { success: false, error: error.message };

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
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
  fighterId: string,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id, participantId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    if (session?.status !== 'pre_battle')
      return { success: false, error: 'Crew can only be changed during pre-battle' };

    const { data: deleted, error } = await supabase
      .from('battle_session_fighters')
      .delete()
      .eq('battle_session_id', sessionId)
      .eq('fighter_id', fighterId)
      .eq('participant_id', auth.participantId!)
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!deleted || deleted.length === 0)
      return { success: false, error: 'Fighter not found in your crew' };

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
    return { success: true };
  } catch (err) {
    console.error('Error removing fighter:', err);
    return { success: false, error: 'Failed to remove fighter' };
  }
}

export async function updateFighterLoadout(
  sessionId: string,
  fighterId: string,
  loadoutId: string | undefined,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionParticipant(supabase, sessionId, user.id, participantId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const { data: session } = await supabase
      .from('battle_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    if (session?.status !== 'pre_battle')
      return { success: false, error: 'Crew can only be changed during pre-battle' };

    const { data: updated, error } = await supabase
      .from('battle_session_fighters')
      .update({ loadout_id: loadoutId ?? null })
      .eq('battle_session_id', sessionId)
      .eq('fighter_id', fighterId)
      .eq('participant_id', auth.participantId!)
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!updated || updated.length === 0)
      return { success: false, error: 'Fighter not found in your crew' };

    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });
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

    const auth = await verifySessionParticipant(supabase, params.session_id, user.id, params.participant_id);
    if (!auth.authorized) return { success: false, error: auth.error };

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
      .select('id, special_rules')
      .eq('gang_id', participant.gang_id)
      .in('id', fighterIds);
    const validIds = new Set(validFighters?.map((f) => f.id));
    if (fighterIds.some((id) => !validIds.has(id)))
      return { success: false, error: 'One or more fighters do not belong to your gang' };

    const DUAL_ACTIVATION_RULES = ['Spyre Hunter', 'Aranthian Beauty Plating'];
    const rulesMap = new Map(
      (validFighters ?? []).map((f: any) => [f.id, f.special_rules as string[] | null])
    );

    const rows = params.fighter_entries.map((entry) => {
      const rules = rulesMap.get(entry.fighter_id);
      const isDual = rules?.some((r) => DUAL_ACTIVATION_RULES.includes(r)) ?? false;
      return {
        battle_session_id: params.session_id,
        participant_id: auth.participantId!,
        fighter_id: entry.fighter_id,
        ...(entry.loadout_id ? { loadout_id: entry.loadout_id } : {}),
        session_record: {
          xp_earned: 0,
          injuries: [],
          conditions: [],
          activations: isDual ? 2 : 1,
        },
      };
    });

    const { error } = await supabase
      .from('battle_session_fighters')
      .upsert(rows, { onConflict: 'battle_session_id,fighter_id' });

    if (error) return { success: false, error: error.message };

    revalidateTag(TAGS.battleSession(params.session_id), { expire: 0 });
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
    .select('session_record, battle_session_id, participant_id')
    .eq('id', sessionFighterId)
    .single();

  if (fetchError || !fighter) return { success: false, error: 'Fighter not found' };

  const auth = await verifySessionParticipant(supabase, fighter.battle_session_id, user.id, fighter.participant_id);
  if (!auth.authorized) return { success: false, error: auth.error };

  const record: SessionRecord = {
    xp_earned: fighter.session_record?.xp_earned ?? 0,
    injuries: fighter.session_record?.injuries ?? [],
    conditions: fighter.session_record?.conditions ?? [],
    note: fighter.session_record?.note,
    activations: fighter.session_record?.activations ?? 1,
  };

  const result = updateFn(record);
  if ('error' in result) return { success: false, error: result.error };

  const { error } = await supabase
    .from('battle_session_fighters')
    .update({ session_record: result })
    .eq('id', sessionFighterId);

  if (error) return { success: false, error: error.message };

  revalidateTag(TAGS.battleSession(fighter.battle_session_id), { expire: 0 });
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

export async function updateActivations(params: {
  session_fighter_id: string;
  activations: number;
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => ({
    ...record,
    activations: params.activations,
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

export async function updateSessionNote(params: {
  session_fighter_id: string;
  note: string;
}): Promise<{ success: boolean; error?: string }> {
  return withSessionRecord(params.session_fighter_id, (record) => ({
    ...record,
    note: params.note || undefined,
  }));
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

    const auth = await verifySessionParticipant(supabase, participant.battle_session_id, user.id, params.participant_id);
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

    revalidateTag(TAGS.battleSession(participant.battle_session_id), { expire: 0 });
    return { success: true };
  } catch (err) {
    console.error('Error updating gang outcome:', err);
    return { success: false, error: 'Failed to update gang outcome' };
  }
}

// =============================================================================
// Resource Outcomes — Campaign Resources
// =============================================================================

export async function updateParticipantResources(params: {
  participant_id: string;
  gang_id: string;
  campaign_gang_id: string;
  resource: {
    resource_id: string;
    resource_name: string;
    is_custom: boolean;
    quantity_delta: number;
  };
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: participant, error: fetchError } = await supabase
      .from('battle_session_participants')
      .select('battle_session_id, resource_changes')
      .eq('id', params.participant_id)
      .single();

    if (fetchError || !participant)
      return { success: false, error: 'Participant not found' };

    const auth = await verifySessionParticipant(supabase, participant.battle_session_id, user.id, params.participant_id);
    if (!auth.authorized) return { success: false, error: auth.error };

    const gangResult = await updateGang({
      gang_id: params.gang_id,
      campaign_gang_id: params.campaign_gang_id,
      resources: [params.resource],
    });
    if (!gangResult.success) return { success: false, error: gangResult.error };

    const existing: Array<{
      resource_id: string;
      resource_name: string;
      is_custom: boolean;
      quantity_delta: number;
    }> = participant.resource_changes ?? [];

    const idx = existing.findIndex((r) => r.resource_id === params.resource.resource_id);
    if (idx >= 0) {
      existing[idx] = {
        ...existing[idx],
        quantity_delta: existing[idx].quantity_delta + params.resource.quantity_delta,
      };
    } else {
      existing.push({
        resource_id: params.resource.resource_id,
        resource_name: params.resource.resource_name,
        is_custom: params.resource.is_custom,
        quantity_delta: params.resource.quantity_delta,
      });
    }

    await supabase
      .from('battle_session_participants')
      .update({ resource_changes: existing })
      .eq('id', params.participant_id);

    await supabase
      .from('battle_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', participant.battle_session_id);

    revalidateTag(TAGS.battleSession(participant.battle_session_id), { expire: 0 });
    return { success: true };
  } catch (err) {
    console.error('Error updating participant resources:', err);
    return { success: false, error: 'Failed to update resources' };
  }
}

// =============================================================================
// Complete Battle Session
// =============================================================================

export async function completeBattleSession(
  sessionId: string,
  options?: { campaign_territory_id?: string; note?: string; cycle?: number | null }
): Promise<{
  success: boolean;
  campaign_battle_id?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const auth = await verifySessionManager(supabase, sessionId, user.id);
    if (!auth.authorized) return { success: false, error: auth.error };

    // Parallel fetch: session, participants, profile, and territory name (if applicable)
    const [
      { data: session },
      { data: allParticipants, error: participantsError },
      { data: userProfile },
      territoryResult,
    ] = await Promise.all([
      supabase
        .from('battle_sessions')
        .select('status, campaign_id, scenario, winner_gang_id, created_at')
        .eq('id', sessionId)
        .single(),
      supabase
        .from('battle_session_participants')
        .select('id, gang_id, user_id, role, is_winner, claimed_territory')
        .eq('battle_session_id', sessionId),
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      options?.campaign_territory_id
        ? supabase
            .from('campaign_territories')
            .select('territory_name, territory_id')
            .eq('id', options.campaign_territory_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'post_battle')
      return { success: false, error: 'Session must be in post-battle to complete' };
    if (participantsError || !allParticipants)
      return { success: false, error: 'Failed to load session participants' };

    const senderName = userProfile?.username || 'Someone';
    const claimed_territory = territoryResult?.data?.territory_name ?? null;
    const territoryIsCustom = territoryResult?.data ? !territoryResult.data.territory_id : false;

    // Derive the effective winner set
    const flaggedWinnerIds: string[] =
      allParticipants
        .filter((p) => p.is_winner === true)
        .map((p) => p.gang_id);
    const effectiveWinnerIds: string[] =
      flaggedWinnerIds.length > 0
        ? flaggedWinnerIds
        : session.winner_gang_id
          ? [session.winner_gang_id]
          : [];
    const winnerGangSet = new Set(effectiveWinnerIds);
    const claimerGangId: string | null =
      allParticipants.find((p) => p.claimed_territory === true)?.gang_id
      ?? session.winner_gang_id
      ?? null;
    const legacyWinnerId: string | null =
      claimerGangId ?? effectiveWinnerIds[0] ?? null;

    // --- Campaign battle log (inline insert, no createBattleLog call) ---
    let campaign_battle_id: string | undefined;
    if (session.campaign_id) {
      const battleParticipants = allParticipants.map((p) => ({
        role: p.role,
        gang_id: p.gang_id,
        is_winner: winnerGangSet.has(p.gang_id),
        claimed_territory: claimerGangId !== null && p.gang_id === claimerGangId,
      }));

      const { data: battle, error: battleError } = await supabase
        .from('campaign_battles')
        .insert([
          {
            campaign_id: session.campaign_id,
            scenario: session.scenario || '',
            winner_id: legacyWinnerId,
            note: options?.note || null,
            participants: JSON.stringify(battleParticipants),
            created_at: session.created_at ?? new Date().toISOString(),
            campaign_territory_id: options?.campaign_territory_id || null,
            cycle: options?.cycle ?? null,
          },
        ])
        .select('id')
        .single();

      if (battleError) {
        console.error('Error creating campaign battle log:', battleError);
        return { success: false, error: 'Failed to create campaign battle log' };
      }
      campaign_battle_id = battle.id;

      // Claim territory in same flow
      if (options?.campaign_territory_id && claimerGangId) {
        const { error: claimError } = await supabase
          .from('campaign_territories')
          .update({ gang_id: claimerGangId })
          .eq('id', options.campaign_territory_id)
          .eq('campaign_id', session.campaign_id);

        if (claimError) {
          const { error: deleteError } = await supabase.from('campaign_battles').delete().eq('id', campaign_battle_id);
          if (deleteError) console.error('Failed to rollback campaign battle after territory claim error:', deleteError);
          return { success: false, error: `Failed to claim territory: ${claimError.message}` };
        }
      }
    }

    // --- Core state change ---
    const { data: updated, error } = await supabase
      .from('battle_sessions')
      .update({
        status: 'completed',
        campaign_battle_id: campaign_battle_id || null,
        claimed_territory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'post_battle')
      .select('id');

    if (error || !updated || updated.length === 0) {
      if (campaign_battle_id) {
        const { error: deleteError } = await supabase.from('campaign_battles').delete().eq('id', campaign_battle_id);
        if (deleteError) console.error('Failed to rollback campaign battle after session update error:', deleteError);
      }
      return { success: false, error: error?.message || 'Session was already completed' };
    }

    // Invalidate session cache so the client renders the completed state
    revalidateTag(TAGS.battleSession(sessionId), { expire: 0 });

    // === Everything below runs AFTER the response is sent ===
    after(async () => {
      try {
        // Fetch gang names + owner IDs for logging (one query)
        const gangIds = allParticipants.map((p) => p.gang_id);
        const { data: gangs } = await supabase
          .from('gangs')
          .select('id, name, user_id')
          .in('id', gangIds);
        const gangMap = new Map<string, { id: string; name: string; user_id: string }>(
          gangs?.map((g) => [g.id, g]) || []
        );

        let resolvedCampaignName = 'Standalone Battle';
        if (session.campaign_id) {
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('campaign_name')
            .eq('id', session.campaign_id)
            .single();
          resolvedCampaignName = campaign?.campaign_name || 'Campaign';
        }

        // Build all gang logs in one batch
        const logs: { gang_id: string; user_id: string; action_type: string; description: string; created_at: string }[] = [];

        for (const p of allParticipants) {
          const gang = gangMap.get(p.gang_id);
          if (!gang) continue;

          let result: 'won' | 'lost' | 'draw';
          if (winnerGangSet.size === 0) {
            result = 'draw';
          } else if (winnerGangSet.has(p.gang_id)) {
            result = 'won';
          } else {
            result = 'lost';
          }

          const opponents = allParticipants
            .filter((op) => op.gang_id !== p.gang_id)
            .map((op) => gangMap.get(op.gang_id)?.name)
            .filter(Boolean)
            .join(', ');

          const roleText =
            p.role === 'attacker'
              ? 'attacked'
              : p.role === 'defender'
                ? 'defended against'
                : 'fought';
          const resultText =
            result === 'won' ? 'Victory!' : result === 'lost' ? 'Defeat' : 'Draw';

          logs.push({
            gang_id: p.gang_id,
            user_id: gang.user_id,
            action_type: `battle_${result}`,
            description: `Gang "${gang.name}" ${roleText} "${opponents || 'Unknown'}" in "${session.scenario || 'Unknown Scenario'}" (Campaign: ${resolvedCampaignName}). Result: ${resultText}`,
            created_at: new Date().toISOString(),
          });
        }

        // Territory claim log — added to same batch
        if (options?.campaign_territory_id && claimerGangId && claimed_territory) {
          const claimer = gangMap.get(claimerGangId);
          if (claimer) {
            const territoryType = territoryIsCustom ? 'custom territory' : 'territory';
            logs.push({
              gang_id: claimerGangId,
              user_id: claimer.user_id,
              action_type: 'territory_claimed',
              description: `Gang "${claimer.name}" claimed ${territoryType} "${claimed_territory}" in campaign "${resolvedCampaignName}"`,
              created_at: new Date().toISOString(),
            });
          }
        }

        if (logs.length > 0) {
          await supabase.from('gang_logs').insert(logs);
        }

        // Notifications — one insert
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

        // Deferred cache invalidation
        for (const p of allParticipants) {
          revalidateTag(TAGS.gangBattleSessions(p.gang_id), { expire: 0 });
        }
        if (session.campaign_id) {
          revalidateTag(TAGS.campaign(session.campaign_id), { expire: 0 });
          for (const wid of effectiveWinnerIds) {
            revalidateTag(TAGS.gangCampaigns(wid), { expire: 0 });
          }
        }
      } catch (afterErr) {
        console.error('Error in deferred battle completion work:', afterErr);
      }
    });

    return { success: true, campaign_battle_id };
  } catch (err) {
    console.error('Error completing battle session:', err);
    return { success: false, error: 'Failed to complete battle session' };
  }
}

