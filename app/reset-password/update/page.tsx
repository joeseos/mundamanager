'use client';

import { Button } from "@/components/ui/button";
import { FormMessage, Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { updatePasswordAction } from "@/app/actions";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

// Create a local submit button component
function LocalSubmitButton({ 
  children, 
  pendingText = "Submitting...", 
  ...props 
}: ComponentProps<typeof Button> & { 
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" aria-disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

function UpdatePasswordFormContent() {
  const [message, setMessage] = useState<Message>({} as Message);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

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
    const confirmPassword = formData.get('confirmPassword') as string;

    try {
      if (password !== confirmPassword) {
        setMessage({ error: 'Passwords do not match' });
        setIsSubmitting(false);
        return;
      }

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
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className="text-black mt-1"
            minLength={6}
          />
        </div>
        
        <div>
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="••••••••"
            required
            className="text-black mt-1"
            minLength={6}
          />
        </div>

        <LocalSubmitButton 
          type="submit"
          disabled={isSubmitting}
          pendingText="Updating..." 
          className="mt-2"
        >
          Update Password
        </LocalSubmitButton>

        <FormMessage message={message} />
      </div>
    </form>
  );
}

function UpdatePasswordForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UpdatePasswordFormContent />
    </Suspense>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        <UpdatePasswordForm />
      </div>
    </main>
  );
} 