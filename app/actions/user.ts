"use server";

import {
  invalidateBattleSession,
  invalidateCampaignBattles,
  invalidateCampaignCore,
  invalidateCampaignGang,
  invalidateCampaignMembers,
  invalidateCampaignTradingPosts,
  invalidateForumThreadList,
  invalidateGang,
  invalidateGangCount,
  invalidateGangStash,
  invalidateUser,
  invalidateUserCount,
  invalidateUserPermissions,
} from '@/utils/cache-tags';
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { getOwnedCampaigns, getUserCampaigns } from '@/app/lib/get-user-campaigns';
import { getUserForumThreads } from '@/app/lib/forum';
import { getAccountDeleteCacheTargets } from '@/app/lib/delete-account';
import { getFriendsAndRequests } from '@/app/lib/friends';
import { gangImageFolders, removeStorageFolders } from '@/utils/storage-cleanup';
import { signOutAction } from '@/app/actions/auth';
import {
  notificationEmailConfig,
  MASTER_PREF_KEY,
  type NotificationType,
} from "@/utils/notifications";

/**
 * Upsert one email-notification preference for the current user.
 * `notificationType` is either the master switch (MASTER_PREF_KEY) or an
 * email-eligible category. RLS additionally guarantees a user can only write
 * their own rows.
 */
export const updateNotificationPreference = async (
  notificationType: string,
  enabled: boolean,
) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Only the master switch or a genuinely email-eligible category may be stored.
  const isMaster = notificationType === MASTER_PREF_KEY;
  const cfg = notificationEmailConfig[notificationType as NotificationType];
  if (!isMaster && (!cfg || !cfg.supportsEmail)) {
    return { error: "Unknown notification category" };
  }

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: user.id,
        notification_type: notificationType,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,notification_type" },
    );

  if (error) {
    console.error("Notification preference update error:", error);
    return { error: "Failed to update preference" };
  }

  return { success: true };
};

export const updateUsernameAction = async (userId: string, newUsername: string) => {
  const supabase = await createClient();

  try {
    // Validate username format
    const isValidUsername = /^[a-zA-Z0-9_-]{3,20}$/.test(newUsername);
    if (!isValidUsername) {
      return { error: "Must be 3-20 characters and can only contain letters, numbers, underscores, and hyphens" };
    }

    // Check if username already exists (case-insensitive)
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', newUsername)
      .neq('id', userId)
      .single();

    if (existingUser) {
      return { error: "Username already taken" };
    }

    // Update username in profiles table
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username: newUsername,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Username update error:', updateError);

      switch (updateError.code) {
        case '23505': // Unique violation
          return { error: "Username already taken" };
        default:
          return { error: "Failed to update username. Please try again" };
      }
    }

    invalidateUser(userId);

    return { success: "Username updated successfully" };

  } catch (error) {
    console.error('Unexpected error during username update:', error);
    return { error: "An unexpected error occurred" };
  }
};

/** Saves an uploaded avatar's URL, or null to remove it. */
export const updateAvatarAction = async (imageUrl: string | null) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Users can't write avatar_url themselves: only images in their own avatar
  // folder are saved, so an avatar can't load from another site. URL.parse resolves
  // any ../ before the check.
  const avatarFolderUrl = supabase.storage.from('users-images').getPublicUrl(`avatars/${user.id}/`).data.publicUrl;
  if (imageUrl !== null) {
    const url = URL.parse(imageUrl);
    if (!url || !`${url.origin}${url.pathname}`.startsWith(avatarFolderUrl)) {
      return { success: false, error: "Invalid avatar image" };
    }
  }

  const { error } = await createServiceRoleClient()
    .from('profiles')
    .update({ avatar_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('Avatar update error:', error);
    return { success: false, error: "Failed to update avatar" };
  }

  invalidateUser(user.id);

  return { success: true };
};

/**
 * Deletes the current user's account once they confirm their password.
 * Refused while they own a campaign: they hand it to an Arbitrator or delete
 * it first (a trigger on profiles enforces this too). Everything else goes
 * with the auth user through the foreign key cascades; their gang images and
 * avatar are then removed from storage, which has no cascade.
 */
export const deleteAccountAction = async (password: string) => {
  const supabase = await createClient();

  try {
    // getUser, not the JWT claims: it asks the auth server whether the session
    // is still valid, which a destructive action should not take on trust.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return { success: false, error: "Not authenticated" };
    }

    // Re-authenticate before deleting, so a session left open on another
    // device can't delete the account. Its own client, since signing in sets
    // that client's session; the service role skips the sign-in CAPTCHA.
    const { data: verified, error: passwordError } = await createServiceRoleClient()
      .auth.signInWithPassword({ email: user.email, password });
    if (passwordError || verified.user?.id !== user.id) {
      return { success: false, error: "Incorrect password" };
    }

    const ownedCampaigns = await getOwnedCampaigns(user.id);
    if (ownedCampaigns.length > 0) {
      return {
        success: false,
        error: `Hand over or delete your campaigns first: ${ownedCampaigns.map((campaign) => campaign.campaign_name).join(', ')}`,
      };
    }

    // Read before the cascade removes them, to clear storage and caches after.
    const [campaigns, { data: gangs, error: gangsError }, friends, forumThreads, cacheTargets] = await Promise.all([
      getUserCampaigns(user.id),
      supabase.from('gangs').select('id').eq('user_id', user.id),
      getFriendsAndRequests(user.id),
      getUserForumThreads(user.id),
      getAccountDeleteCacheTargets(user.id),
    ]);
    // Without the gang ids their images can't be found once the gangs are gone.
    if (gangsError) {
      console.error('Account delete gangs read error:', gangsError);
      return { success: false, error: "Failed to delete account" };
    }

    const serviceClient = createServiceRoleClient();
    const { error } = await serviceClient.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('Account delete error:', error);
      return { success: false, error: "Failed to delete account" };
    }

    // After the delete, so a failed delete keeps the images. The service role,
    // since the user's session went with the account.
    await removeStorageFolders(serviceClient, [
      ...gangs.flatMap((gang) => gangImageFolders(gang.id)),
      `avatars/${user.id}/`,
    ]);

    invalidateUser(user.id);
    invalidateUserPermissions(user.id);
    friends.forEach((friend) => invalidateUser(friend.id));
    campaigns.forEach((campaign) => {
      invalidateCampaignMembers(campaign.id);
      // Custom content the user shared into the campaign is gone.
      invalidateCampaignTradingPosts(campaign.id);
      invalidateCampaignCore(campaign.id);
      if (campaign.user_gangs?.length) invalidateCampaignBattles(campaign.id);
      campaign.user_gangs?.forEach((gang) => invalidateCampaignGang(campaign.id, gang.id));
    });
    // Other players' gangs lose the user's custom fighter types, equipment and skills.
    cacheTargets.gangIds.forEach((gangId) => {
      invalidateGang(gangId);
      invalidateGangStash(gangId);
    });
    cacheTargets.battleSessionIds.forEach(invalidateBattleSession);
    // Thread headers and lists name their author and last poster, now Unknown User.
    forumThreads.forEach((thread) =>
      invalidateForumThreadList(thread.category_id, thread.number, thread.article_published_at !== null)
    );
    invalidateUserCount();
    invalidateGangCount();

    return { success: true, ...(await signOutAction()) };
  } catch (error) {
    console.error('Unexpected error during account delete:', error);
    return { success: false, error: "An unexpected error occurred" };
  }
};
