"use server";

import { createClient } from "@/utils/supabase/server";

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

    return { success: "Username updated successfully" };

  } catch (error) {
    console.error('Unexpected error during username update:', error);
    return { error: "An unexpected error occurred" };
  }
};
