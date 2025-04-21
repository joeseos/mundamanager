"use client";

import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions";
import { useState, use } from "react";

export default function ResetPassword(props: { searchParams: Promise<Message> }) {
  const searchParams = use(props.searchParams);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const successMessage = "success" in searchParams ? searchParams.success : undefined;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await forgotPasswordAction(formData);
    if (response.success) {
      setFeedbackMessage(response.success);
      setEmailSent(true);
    } else {
      setFeedbackMessage(response.error ?? null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        <form onSubmit={handleSubmit} className="flex flex-col w-full max-w-sm mx-auto text-white">
          {!emailSent ? (
            <>
              <h1 className="text-2xl font-medium text-white mb-2">Reset Password</h1>
              <p className="text-sm text-white mb-8">
                Enter your email address and we'll send you instructions to reset your password.
              </p>
              <div className="flex flex-col gap-4">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email"
                  placeholder="you@example.com" 
                  required 
                  className="text-black mt-1"
                  autoComplete="email"
                />
                <SubmitButton 
                  formAction={forgotPasswordAction} 
                  pendingText="Sending..." 
                  className="mt-2"
                >
                  Send Reset Instructions
                </SubmitButton>
              </div>
            </>
          ) : (
            <p className="text-sm text-white mb-8">Check your email for the password reset link.</p>
          )}
          <div className="text-center mt-2">
            <Link href="/sign-in" className="text-sm text-white hover:underline">
              Back to sign in
            </Link>
          </div>
          <FormMessage message={searchParams} />
        </form>
      </div>
    </main>
  );
} 