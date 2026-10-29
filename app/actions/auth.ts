"use server";

import { invalidateUserCount, invalidateUserPermissions } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { cookies } from 'next/headers';
import { safePostSignInPath } from '@/utils/auth';
import type { AuthError } from '@supabase/supabase-js';

// Returned instead of calling redirect(), so the caller can do a full document
// load - a client-side navigation leaves the browser Supabase client stale.
type AuthRedirect = { redirectTo: string };
type AuthActionResult = { error: string } | AuthRedirect;

const EMAIL_TAKEN_ERROR = "This email is already registered. Please sign in instead";

/**
 * Auth's error message, or a generic one when Auth rejected the CAPTCHA token.
 * That rejection names its cause (e.g. a wrong secret in the dashboard), so it
 * is logged rather than shown.
 */
function authErrorMessage(error: AuthError): string {
  if (error.code !== 'captcha_failed') {
    return error.message;
  }

  console.error('Supabase Auth rejected the CAPTCHA token:', error.message);
  return "Security verification failed. Please try again.";
}

/**
 * The form's Turnstile token, for Supabase Auth to verify (Authentication > Bot and
 * Abuse Protection > CAPTCHA). Auth rejects sign-in, sign-up and password reset
 * without one, including requests that skip these forms and call it directly.
 * The token is not verified here as well: it is single-use, so a siteverify call
 * here would spend it before Auth sees it.
 */
function readCaptchaToken(formData: FormData): { captchaToken?: string } | { error: string } {
  const captchaToken = (formData.get("cf-turnstile-response") as string | null) || undefined;

  // The widget renders only with a site key, and the local stack runs without CAPTCHA
  const isRequired = process.env.NODE_ENV !== "development" && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (isRequired && !captchaToken) {
    return { error: "Please complete the security verification challenge" };
  }

  return { captchaToken };
}

export const signUpAction = async (formData: FormData) => {
  const origin = (await headers()).get("origin");
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const username = formData.get("username") as string;

  const captcha = readCaptchaToken(formData);
  if ('error' in captcha) {
    return { error: captcha.error };
  }

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

    // Sign up the user with metadata. Whether the email is taken is read from the
    // response, so it is only revealed once Supabase has verified the CAPTCHA token.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: {
          username: username
        },
        captchaToken: captcha.captchaToken
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
        // A registered email, when email confirmation is off
        case 'user_already_exists':
          return { error: EMAIL_TAKEN_ERROR };
        default:
          return { error: authErrorMessage(signUpError) || 'Failed to create account' };
      }
    }

    if (!signUpData.user) {
      return { error: "Failed to create account. Please try again" };
    }

    // A registered email, when email confirmation is on: Supabase sends no email
    // and returns a stand-in user with no identities
    if (signUpData.user.identities?.length === 0) {
      return { error: EMAIL_TAKEN_ERROR };
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
  const nextParam = formData.get('next') as string | undefined;

  const captcha = readCaptchaToken(formData);
  if ('error' in captcha) {
    return { error: captcha.error };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captcha.captchaToken },
  });

  if (error) {
    return { error: authErrorMessage(error) };
  }

  // Clear this user's permission entries - they are cached with revalidate: false.
  if (data.user) {
    invalidateUserPermissions(data.user.id);
  }

  return { redirectTo: safePostSignInPath(nextParam) };
};

export const forgotPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const captcha = readCaptchaToken(formData);
  if ('error' in captcha) {
    return { error: captcha.error };
  }

  // From the request, as signUpAction does - an unset env var here silently
  // interpolates to "undefined/reset-password/update".
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!origin) {
    console.error('Cannot resolve origin for password reset redirect');
    return { error: "Something went wrong. Please try again." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password/update`,
    captchaToken: captcha.captchaToken,
  });

  if (error) {
    console.error('Error sending password reset email:', error);
    return { error: authErrorMessage(error) };
  }

  // Redirect to the reset-password page with a success message
  return { success: "Check your email for the password reset link." };
};

export const signOutAction = async (): Promise<AuthRedirect> => {
  // Revoke the refresh token while the cookies still exist, otherwise it stays
  // valid and a stale browser client can refresh it back into place.
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error revoking session on sign out:', error);
  }

  // The sweep is the guarantee, whether or not the revoke above succeeded.
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  allCookies.forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      cookieStore.delete(cookie.name);
    }
  });

  // No revalidatePath: revalidatePath('/', 'layout') emits the implicit tag
  // _N_T_/layout, which every route carries and unstable_cache reads as a soft
  // tag, so it evicts the whole shared Data Cache. User-scoped entries are keyed
  // per user id, so an account switch needs no invalidation.
  return { redirectTo: "/sign-in" };
};
