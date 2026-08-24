"use client";

import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { ValidatedEmailField } from "@/components/ui/validated-email-field";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Get search params safely
  const error = searchParams.get('error');
  const success = searchParams.get('success');
  const message = searchParams.get('message');

  // Create the appropriate message object based on search params
  let messageObj: Message | null = null;
  if (success) {
    messageObj = { success };
  } else if (error) {
    messageObj = { error };
  } else if (message) {
    messageObj = { message };
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(event.currentTarget);
      const response = await forgotPasswordAction(formData);
      
      if (response.success) {
        setEmailSent(true);
      } else if (response.error) {
        setFeedbackMessage(response.error);
      }
    } catch (error) {
      console.error('Error during password reset:', error);
      setFeedbackMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full px-4">
        <form onSubmit={handleSubmit} className="flex flex-col w-full max-w-sm mx-auto text-white">
          {!emailSent ? (
            <>
              <h1 className="text-2xl font-medium text-white mb-2 text-center">Reset Password</h1>
              <p className="text-sm text-white mb-8 text-center">
                Enter your email address and we&apos;ll send you instructions to reset your password.
              </p>
              <div className="flex flex-col gap-4">
                <ValidatedEmailField id="email" />
                <SubmitButton 
                  pendingText="Sending..." 
                  className="mt-2"
                  disabled={isSubmitting}
                >
                  Send Reset Instructions
                </SubmitButton>
              </div>
              {feedbackMessage && (
                <FormMessage message={{ error: feedbackMessage }} />
              )}
            </>
          ) : (
            <p className="text-sm text-white mb-8 text-center">Check your email for the password reset link.</p>
          )}
          <div className="text-center mt-4 space-y-2">
            <p className="text-sm text-white">
              Having trouble?{" "}
              <a
                href="https://discord.gg/ZWXXqd5NUt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-medium underline"
              >
                Get help
              </a>
            </p>
            <Link href="/sign-in" className="block text-sm text-white underline hover:underline">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
} 