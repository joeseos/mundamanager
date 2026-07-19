"use server";

import { invalidateUser } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
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
      return { error: "Username must be 3-20 characters and can only contain letters, numbers, underscores, and hyphens" };
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
