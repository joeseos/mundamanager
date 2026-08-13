"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { invalidateUserCount } from '@/utils/cache-tags';
import { safePostSignInPath } from '@/utils/auth';

// Auth transitions return a destination for the caller to navigate to rather
// than calling redirect(). A server-side redirect is a client-side navigation,
// which leaves the browser Supabase client holding the previous session in
// memory - the caller does a full document load instead so every client-side
// cache is rebuilt from the new cookies.
type AuthRedirect = { redirectTo: string };
type AuthActionResult = { error: string } | AuthRedirect;

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

    // Check if email is already registered before signUp to prevent confirmation email.
    // We use a direct GoTrue API call with the filter param since the JS client
    // doesn't expose email filtering on listUsers, and fetching all users won't scale.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const userLookup = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      }
    );
    if (userLookup.ok) {
      const { users } = await userLookup.json();
      if (users?.some((u: { email?: string }) => u.email === email)) {
        return { error: "This email is already registered. Please sign in instead" };
      }
    } else {
      console.error('GoTrue admin user lookup failed:', userLookup.status, await userLookup.text());
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

    invalidateUserCount();

    return { message: `We've sent a verification email to ${email}. Please check your inbox and spam folder.` };

  } catch (error) {
    console.error('Unexpected error during sign up:', error);
    return { error: "An unexpected error occurred" };
  }
};

export const signInAction = async (formData: FormData): Promise<AuthActionResult> => {
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

  revalidatePath('/', 'layout');

  // Sanitise here rather than trusting whatever the client sends back.
  return { redirectTo: safePostSignInPath(nextParam) };
};

async function verifyTurnstileToken(token: string) {
  if (!token) {
    console.error('No Turnstile token provided');
    return { success: false, error: 'No token provided' };
  }

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

    return await response.json();
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

  // Derive the origin from the request (same as signUpAction). Interpolating an
  // unset env var here produces a plausible-looking "undefined/reset-password/update",
  // which GoTrue silently ignores in favour of the project's Site URL - so the
  // email still sends but the link never reaches the set-a-new-password form.
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!origin) {
    console.error('Cannot resolve origin for password reset redirect');
    return { error: "Something went wrong. Please try again." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password/update`,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: error.message };
  }

  // Redirect to the reset-password page with a success message
  return { success: "Check your email for the password reset link." };
};

export const signOutAction = async (): Promise<AuthRedirect> => {
  // Revoke the refresh token at GoTrue while the cookies are still present.
  // Without this the token stays valid, so a stale browser client can refresh
  // it and write the session cookies straight back.
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error revoking session on sign out:', error);
  }

  // Then sweep the auth cookies ourselves - this is the guarantee, regardless
  // of whether the call above succeeded.
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  allCookies.forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      cookieStore.delete(cookie.name);
    }
  });

  // Revalidate the root layout to clear any cached user data
  revalidatePath('/', 'layout');

  return { redirectTo: "/sign-in" };
};
