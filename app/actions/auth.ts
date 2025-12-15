"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { invalidateUserCount } from '@/utils/cache-tags';

export const signUpAction = async (formData: FormData) => {
  const origin = (await headers()).get("origin");
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const username = formData.get("username") as string;
  const supabase = await createClient();

  try {
    // Check if username already exists (case-insensitive)
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', username)
      .single();

    if (existingUser) {
      return { error: "Username already taken" };
    }

    // Sign up the user with metadata
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: {
          username: username
        }
      }
    });

    if (signUpError) {
      switch (signUpError.code) {
        case 'over_email_send_rate_limit':
          return { error: "Too many attempts. Please wait a few minutes before trying again" };
        case 'invalid_email':
          return { error: "Please enter a valid email address" };
        case 'weak_password':
          return { error: "Password is too weak. Please use a stronger password" };
        case 'email_taken':
          return { error: "This email is already registered. Please sign in instead" };
        default:
          return { error: signUpError.message || 'Failed to create account' };
      }
    }

    if (!signUpData.user) {
      return { error: "Failed to create account. Please try again" };
    }

    // Create profile using service role (bypasses RLS)
    try {
      const serviceRoleClient = createServiceRoleClient();
      const { error: profileError } = await serviceRoleClient
        .from('profiles')
        .insert({
          id: signUpData.user.id,
          username: username,
          user_role: 'user'
        })
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Check if this is a duplicate key error (code 23505)
        if (profileError.code === '23505') {
          const errorDetail = profileError.message?.toLowerCase() || '';
          const errorConstraint = (profileError as { constraint?: string }).constraint?.toLowerCase() || '';

          // Duplicate on primary key (id) = user already registered
          if (errorDetail.includes('profiles_pkey') || errorConstraint.includes('pkey') || errorDetail.includes('"id"')) {
            // Don't delete auth user - they already exist!
            return { error: "This email is already registered. Please sign in instead." };
          }

          // Otherwise it's a username conflict
          await serviceRoleClient.auth.admin.deleteUser(signUpData.user.id);
          return { error: "Username already taken. Please try again with a different username." };
        }

        // For other errors, clean up and show generic message
        await serviceRoleClient.auth.admin.deleteUser(signUpData.user.id);
        return { error: "Failed to create your account. Please try again." };
      }

      // Invalidate user count cache when a new user is successfully created
      invalidateUserCount();
    } catch (error) {
      console.error('Unexpected error during profile creation:', error);
      const serviceRoleClient = createServiceRoleClient();
      await serviceRoleClient.auth.admin.deleteUser(signUpData.user.id);
      return { error: "Something went wrong during sign up. Please try again." };
    }

    return { message: `We've sent a verification email to ${email}. Please check your inbox and spam folder.` };

  } catch (error) {
    console.error('Unexpected error during sign up:', error);
    return { error: "An unexpected error occurred" };
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const turnstileToken = formData.get("cf-turnstile-response") as string;
  const nextParam = formData.get('next') as string | undefined;

  // Check if Turnstile is configured
  const hasTurnstileConfig = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY;

  if (process.env.NODE_ENV === "development") {
    console.log("Skipping Turnstile verification in development mode.");
  }
  else if (hasTurnstileConfig) {
    if (!turnstileToken) {
      return { error: "Please complete the security verification challenge" };
    }

    // Verify Turnstile token
    const turnstileVerification = await verifyTurnstileToken(turnstileToken);
    if (!turnstileVerification.success) {
      console.error('Turnstile verification failed:', turnstileVerification);
      return { error: "Security verification failed. Please try again." };
    }
  } else {
    console.warn('Turnstile not configured - proceeding without verification');
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
  const redirectCookie = cookieStore.get('redirectPath');
  if (redirectCookie) {
    cookieStore.delete('redirectPath');
  }

  function safePath(p?: string) {
    if (!p) return "/";
    if (!p.startsWith("/") || p.startsWith("//")) return "/";
    return p;
  }

  const destination = safePath(nextParam ?? redirectCookie?.value);
  return redirect(destination);
};

async function verifyTurnstileToken(token: string) {
  if (!token) {
    console.error('No Turnstile token provided');
    return { success: false, error: 'No token provided' };
  }

  console.log('Verifying Turnstile token:', token.substring(0, 10) + '...');
  console.log('TURNSTILE_SECRET_KEY:', process.env.TURNSTILE_SECRET_KEY ? 'Set' : 'Not set');

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password/update`,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: error.message };
  }

  // Redirect to the reset-password page with a success message
  return { success: "Check your email for the password reset link." };
};

export const resetPasswordAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password/update`,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: error.message };
  }

  return { success: "Check your email for the password reset link." };
};

export const signOutAction = async () => {
  const cookieStore = await cookies();

  // Manually delete all Supabase auth cookies
  // This is necessary because supabase.auth.signOut() can't read the session
  // in Server Actions due to cookie handling limitations in Server Components
  const allCookies = cookieStore.getAll();
  allCookies.forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      cookieStore.delete(cookie.name);
    }
  });

  // Revalidate the root layout to clear any cached user data
  revalidatePath('/', 'layout');

  // Redirect to root, which will be rewritten to /sign-in by middleware
  // This keeps the URL as / instead of /sign-in
  return redirect("/");
};


export const updatePasswordAction = async (formData: FormData) => {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const supabase = await createClient();

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('Error updating password:', error);
      return { error: error.message };
    }

    return { success: "Password updated successfully" };
  } catch (error) {
    console.error('Error updating password:', error);
    return { error: "Failed to update password. Please try again." };
  }
};

