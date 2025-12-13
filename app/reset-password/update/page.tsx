'use client';

import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { LuEye, LuEyeOff } from "react-icons/lu";

function UpdatePasswordFormContent() {
  const [message, setMessage] = useState<Message>({} as Message);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    hasLowerCase: false,
    hasUpperCase: false,
    hasNumber: false,
    hasSpecialChar: false,
    hasMinLength: false,
  });
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const checkPasswordRequirements = (password: string) => {
    setPasswordRequirements({
      hasLowerCase: /[a-z]/.test(password),
      hasUpperCase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password),
      hasMinLength: password.length >= 6,
    });
  };

  useEffect(() => {
    const setupPasswordReset = async () => {
      try {
        const token_hash = searchParams.get('token_hash');
        const type = searchParams.get('type');

        if (!token_hash || !type) {
          router.push('/sign-in?error=' + encodeURIComponent('Invalid password reset link'));
          return;
        }

        // Exchange the token for a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!session) {
          // If no session, verify the OTP to create one
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery'
          });

          if (verifyError) {
            console.error('Error verifying token:', verifyError);
            router.push('/sign-in?error=' + encodeURIComponent('Invalid or expired password reset link'));
            return;
          }
        }
      } catch (error) {
        console.error('Error in recovery flow:', error);
        router.push('/sign-in?error=' + encodeURIComponent('An error occurred during password reset'));
      }
    };

    setupPasswordReset();
  }, [searchParams, router, supabase.auth]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password);
    const hasMinLength = password.length >= 6;

    if (!hasLowerCase || !hasUpperCase || !hasNumber || !hasSpecialChar || !hasMinLength) {
      setMessage({ error: 'Password must contain at least 6 characters, including uppercase, lowercase, number, and special character' });
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage({ error: error.message });
      } else {
        // Sign out after password update
        await supabase.auth.signOut();
        router.push('/sign-in?success=' + encodeURIComponent('Password updated successfully. Please sign in with your new password.'));
      }
    } catch (error) {
      console.error('Error updating password:', error);
      setMessage({ error: 'Failed to update password. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col w-full max-w-sm mx-auto text-white">
      <h1 className="text-2xl font-medium text-white mb-2">Set New Password</h1>
      <p className="text-sm text-white mb-8">
        Please enter your new password below.
      </p>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="password">New Password</Label>
          <div className="relative mt-1">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              className="text-foreground pr-10"
              minLength={6}
              onChange={(e) => checkPasswordRequirements(e.target.value)}
            />
            <button
              type="button"
              onMouseDown={() => setShowPassword(true)}
              onMouseUp={() => setShowPassword(false)}
              onMouseLeave={() => setShowPassword(false)}
              onTouchStart={() => setShowPassword(true)}
              onTouchEnd={() => setShowPassword(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors select-none touch-none"
              aria-label="Hold to reveal password"
            >
              {showPassword ? (
                <LuEyeOff className="h-5 w-5" />
              ) : (
                <LuEye className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="mt-2 text-sm space-y-1">
            <p className={passwordRequirements.hasMinLength ? "text-green-500" : "text-gray-400"}>
              ✓ At least 6 characters
            </p>
            <p className={passwordRequirements.hasLowerCase ? "text-green-500" : "text-gray-400"}>
              ✓ One lowercase letter
            </p>
            <p className={passwordRequirements.hasUpperCase ? "text-green-500" : "text-gray-400"}>
              ✓ One uppercase letter
            </p>
            <p className={passwordRequirements.hasNumber ? "text-green-500" : "text-gray-400"}>
              ✓ One number
            </p>
            <p className={passwordRequirements.hasSpecialChar ? "text-green-500" : "text-gray-400"}>
              ✓ One special character (!@#$%^&*()_+-=[]{}|;:,&lt;&gt;?~)
            </p>
          </div>
        </div>

        <SubmitButton 
          type="submit"
          disabled={isSubmitting}
          pendingText="Updating..." 
          className="mt-2"
        >
          Update Password
        </SubmitButton>

        <FormMessage message={message} />
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        <UpdatePasswordFormContent />
      </div>
    </main>
  );
} 