import type { AuthError } from '@supabase/supabase-js';

/**
 * Auth's error message, or a generic one when Auth rejected the CAPTCHA token.
 * That rejection names its cause (e.g. a wrong secret in the dashboard), so it
 * is logged rather than shown.
 */
export function authErrorMessage(error: AuthError): string {
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
export function readCaptchaToken(formData: FormData): { captchaToken?: string } | { error: string } {
  const captchaToken = (formData.get("cf-turnstile-response") as string | null) || undefined;

  // The widget renders only with a site key, and the local stack runs without CAPTCHA
  const isRequired = process.env.NODE_ENV !== "development" && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (isRequired && !captchaToken) {
    return { error: "Please complete the security verification challenge" };
  }

  return { captchaToken };
}
