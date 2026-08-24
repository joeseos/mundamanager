import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserProfileClaims } from '@/types/user-permissions'

export interface ParsedClaims {
  userId: string;
  email: string | undefined;
  profile: UserProfileClaims | null;
}

export function extractProfileClaims(claims: Record<string, any>): UserProfileClaims | null {
  const profile = claims?.user_profile;
  return profile && typeof profile === 'object' ? profile as UserProfileClaims : null;
}

export async function getClaims(supabase: SupabaseClient): Promise<ParsedClaims | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  return {
    userId: data.claims.sub as string,
    email: data.claims.email as string | undefined,
    profile: extractProfileClaims(data.claims),
  };
}

export async function getAuthenticatedUser(supabase: SupabaseClient): Promise<{ id: string; email?: string }> {
  const claims = await getClaims(supabase);
  if (!claims) throw new Error('User not authenticated');
  return { id: claims.userId, email: claims.email };
}

export async function getUserIdFromClaims(supabase: SupabaseClient): Promise<string | null> {
  const claims = await getClaims(supabase);
  return claims?.userId ?? null;
}

export async function checkAdmin(supabase: SupabaseClient, user?: { id: string }) {
  try {
    const authUser = user || await getAuthenticatedUser(supabase);

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', authUser.id)
      .single();

    return profile?.user_role === 'admin';
  } catch {
    return false;
  }
}

export function safePath(path?: string | null) {
  if (!path) return "/";
  try {
    const base = "http://internal.invalid";
    const url = new URL(path, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function safePostSignInPath(path?: string | null) {
  const safe = safePath(path);
  if (safe === "/sign-in" || safe === "/sign-up" || safe.startsWith("/auth/")) {
    return "/";
  }
  return safe;
}

export function signInPath(nextPath: string) {
  return `/sign-in?next=${encodeURIComponent(safePath(nextPath))}`;
}

export interface PasswordRequirements {
  hasLowerCase: boolean;
  hasUpperCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  hasMinLength: boolean;
}

export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_ERROR_MESSAGE =
  'Password must contain at least 6 characters, including uppercase, lowercase, number, and special character';

export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    hasLowerCase: /[a-z]/.test(password),
    hasUpperCase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password),
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
  };
}

export const EMPTY_PASSWORD_REQUIREMENTS = checkPasswordRequirements('');

export function isPasswordValid(password: string): boolean {
  return Object.values(checkPasswordRequirements(password)).every(Boolean);
}
