'use server';

import { encodedRedirect } from '@/utils/utils';
import { createClient } from '@/utils/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export const signUpAction = async (formData: FormData) => {
  const origin = (await headers()).get('origin');
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const username = formData.get('username') as string;
  const supabase = await createClient();

  try {
    // Check if username already exists (case-insensitive)
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', username)
      .single();

    if (existingUser) {
      return { error: 'Username already taken' };
    }

    // Sign up the user with metadata
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            username: username,
          },
        },
      }
    );

    if (signUpError) {
      switch (signUpError.code) {
        case 'over_email_send_rate_limit':
          return {
            error:
              'Too many attempts. Please wait a few minutes before trying again',
          };
        case 'invalid_email':
          return { error: 'Please enter a valid email address' };
        case 'weak_password':
          return {
            error: 'Password is too weak. Please use a stronger password',
          };
        case 'email_taken':
          return {
            error: 'This email is already registered. Please sign in instead',
          };
        default:
          return { error: signUpError.message || 'Failed to create account' };
      }
    }

    if (!signUpData.user) {
      return { error: 'Failed to create account. Please try again' };
    }

    try {
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: signUpData.user.id,
          username: username,
          updated_at: new Date().toISOString(),
        })
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);

        switch (profileError.code) {
          case '23505': // Unique violation
            return { error: 'Username already taken. Please choose another' };
          case '23503': // Foreign key violation
            return { error: 'Account creation failed. Please try again' };
          default:
            await supabase.auth.admin.deleteUser(signUpData.user.id);
            return { error: 'Failed to create profile. Please try again' };
        }
      }
    } catch (profileError) {
      console.error('Profile creation error:', profileError);
      await supabase.auth.admin.deleteUser(signUpData.user.id);
      return { error: 'Failed to complete registration. Please try again' };
    }

    return { message: 'Please check your email to verify your account' };
  } catch (error) {
    console.error('Unexpected error during sign up:', error);
    return { error: 'An unexpected error occurred' };
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const turnstileToken = formData.get('cf-turnstile-response') as string;

  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping Turnstile verification in development mode.');
  } else {
    if (!turnstileToken) {
      return { error: 'Please complete the Turnstile challenge' };
    }

    // Verify Turnstile token
    const turnstileVerification = await verifyTurnstileToken(turnstileToken);
    if (!turnstileVerification.success) {
      console.error('Turnstile verification failed:', turnstileVerification);
      return { error: 'Security check failed. Please try again.' };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const cookieStore = await cookies();
  const redirectPath = cookieStore.get('redirectPath');
  cookieStore.delete('redirectPath');

  // Redirect to the home page in all circumstances
  return redirect('/');
};

async function verifyTurnstileToken(token: string) {
  if (!token) {
    console.error('No Turnstile token provided');
    return { success: false, error: 'No token provided' };
  }

  console.log('Verifying Turnstile token:', token.substring(0, 10) + '...');
  console.log(
    'TURNSTILE_SECRET_KEY:',
    process.env.TURNSTILE_SECRET_KEY ? 'Set' : 'Not set'
  );

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      }
    );

    const data = await response.json();
    console.log('Turnstile verification response:', data);
    return data;
  } catch (error) {
    console.error('Error verifying Turnstile token:', error);
    return { success: false, error: 'Verification failed' };
  }
}

export const forgotPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required' };
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password/update`,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: error.message };
  }

  // Redirect to the reset-password page with a success message
  return { success: 'Check your email for the password reset link.' };
};

export const resetPasswordAction = async (formData: FormData) => {
  const email = formData.get('email') as string;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password/update`,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: error.message };
  }

  return { success: 'Check your email for the password reset link.' };
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect('/');
};

export async function getFighters(gangId: string) {
  const supabase = await createClient();

  try {
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select(
        `
        id, 
        fighter_name, 
        fighter_type_id,
        fighter_class,
        label,
        credits,
        movement, 
        weapon_skill, 
        ballistic_skill, 
        strength, 
        toughness, 
        wounds, 
        initiative, 
        leadership, 
        cool, 
        willpower, 
        intelligence, 
        attacks,
        xp,
        advancements,
        special_rules,
        note,
        killed,
        retired,
        enslaved,
        starved,
        recovery,
        free_skill,
        weapons,
        wargear,
        fighter_effects (
          *,
          fighter_effect_stat_modifiers ( * )
        )
      `
      )
      .eq('gang_id', gangId);

    if (fightersError) throw fightersError;

    const { data: fighterTypes, error: typesError } = await supabase
      .from('fighter_types')
      .select('fighter_type_id, fighter_type');

    if (typesError) throw typesError;

    const fighterTypeMap = Object.fromEntries(
      fighterTypes.map((type) => [type.fighter_type_id, type.fighter_type])
    );

    const fightersWithTypes = fighters.map((fighter) => ({
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      fighter_type_id: fighter.fighter_type_id,
      fighter_type: fighterTypeMap[fighter.fighter_type_id] || 'Unknown Type',
      fighter_class: fighter.fighter_class,
      label: fighter.label,
      credits: fighter.credits,
      movement: fighter.movement,
      weapon_skill: fighter.weapon_skill,
      ballistic_skill: fighter.ballistic_skill,
      strength: fighter.strength,
      toughness: fighter.toughness,
      wounds: fighter.wounds,
      initiative: fighter.initiative,
      attacks: fighter.attacks,
      leadership: fighter.leadership,
      cool: fighter.cool,
      willpower: fighter.willpower,
      intelligence: fighter.intelligence,
      xp: fighter.xp ?? 0,
      advancements: fighter.advancements,
      injuries: fighter.fighter_effects || [],
      special_rules: fighter.special_rules || [],
      note: fighter.note,
      killed: fighter.killed || false,
      retired: fighter.retired || false,
      enslaved: fighter.enslaved || false,
      starved: fighter.starved || false,
      recovery: fighter.recovery || false,
      free_skill: fighter.free_skill || false,
      weapons: fighter.weapons || [],
      wargear: fighter.wargear || [],
    }));

    return fightersWithTypes;
  } catch (error) {
    console.error('Error fetching fighters:', error);
    return [];
  }
}

export const updatePasswordAction = async (formData: FormData) => {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const supabase = await createClient();

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('Error updating password:', error);
      return { error: error.message };
    }

    return { success: 'Password updated successfully' };
  } catch (error) {
    console.error('Error updating password:', error);
    return { error: 'Failed to update password. Please try again.' };
  }
};
