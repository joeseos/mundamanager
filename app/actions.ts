"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cookies } from 'next/headers';
import { validateTurnstileToken } from 'next-turnstile';
import { v4 as uuidv4 } from 'uuid';

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

    try {
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: signUpData.user.id,
          username: username,
          updated_at: new Date().toISOString()
        })
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        
        switch (profileError.code) {
          case '23505': // Unique violation
            return { error: "Username already taken. Please choose another" };
          case '23503': // Foreign key violation
            return { error: "Account creation failed. Please try again" };
          default:
            await supabase.auth.admin.deleteUser(signUpData.user.id);
            return { error: "Failed to create profile. Please try again" };
        }
      }
    } catch (profileError) {
      console.error('Profile creation error:', profileError);
      await supabase.auth.admin.deleteUser(signUpData.user.id);
      return { error: "Failed to complete registration. Please try again" };
    }

    return { message: "Please check your email to verify your account" };

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

  // Verify Turnstile token (skip only in development when no token provided)
  if (process.env.NODE_ENV === "production" || turnstileToken) {
    if (!turnstileToken) {
      return { error: "Please complete the security verification" };
    }

    try {
      const validationResponse = await validateTurnstileToken({
        token: turnstileToken,
        secretKey: process.env.TURNSTILE_SECRET_KEY!,
        idempotencyKey: uuidv4(),
        sandbox: process.env.NODE_ENV === 'development',
      });

      if (!validationResponse.success) {
        console.error('Turnstile validation failed:', validationResponse);
        return { error: "Security verification failed. Please try again." };
      }
    } catch (error) {
      console.error('Error validating Turnstile token:', error);
      return { error: "Security verification failed. Please try again." };
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
  const supabase = await createClient();
  await supabase.auth.signOut();
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
