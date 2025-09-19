'use client';

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from 'react';
import TurnstileWidget from './TurnstileWidget';
import { createClient } from "@/utils/supabase/client";
import { LuTrophy } from "react-icons/lu";
import { FiMap } from "react-icons/fi";
import { FaUsers } from "react-icons/fa";
import { MdFactory } from "react-icons/md";
import { LuSwords, LuClipboard } from "react-icons/lu";
import { RiContactsBook3Line } from "react-icons/ri";
import { FaDiscord, FaPatreon } from "react-icons/fa6";
import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";
import WhatIsMundaManager from "@/components/munda-manager-info/what-is-munda-manager";

export default function SignIn() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const router = useRouter();
  const supabase = createClient();
  
  useEffect(() => {
    // Check if user is already authenticated and redirect if needed
    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const nextParam = searchParams.get('next');
        const isSafe = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
        router.push(isSafe ? nextParam! : '/');
      }
    }
    
    checkAuth();
    
    // Extract error message from URL params on initial load
    const error = searchParams.get('error');
    if (error) {
      setErrorMessage(error);
    }
  }, [searchParams, router, supabase.auth]);

  // Create the appropriate message object based on searchParams
  let topMessage: Message | null = null;
  const success = searchParams.get('success');
  const message = searchParams.get('message');
  
  if (success) {
    topMessage = { success };
  } else if (message) {
    topMessage = { message };
  }

  async function clientAction(formData: FormData) {
    const result = await signInAction(formData);
    
    // If we get a non-redirect result with an error, display it
    if (result && 'error' in result) {
      setErrorMessage(result.error);
    }
    // No return value needed here (void)
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full p-4">
        {topMessage && (
          <div className="mb-4">
            {'success' in topMessage && topMessage.success === 'Password updated successfully. Please sign in with your new password.' ? (
              <div className="flex flex-col gap-2 w-full max-w-md text-sm">
                <div className="text-white border-l-2 border-foreground px-4">
                  {topMessage.success}
                </div>
              </div>
            ) : (
              <FormMessage message={topMessage} />
            )}
          </div>
        )}
        <form 
          className="flex flex-col w-full max-w-sm mx-auto text-white"
          action={clientAction}
        >
          {/* Carry next through to server action */}
          {(() => {
            const nextParam = searchParams.get('next');
            const isSafe = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
            return isSafe ? (
              <input type="hidden" name="next" value={nextParam!} />
            ) : null;
          })()}
          <h1 className="text-2xl font-medium text-white mb-2">Sign in</h1>
          <p className="text-sm text-white mb-8">
            Don't have an account?{" "}
            <Link className="text-white font-medium underline" href="/sign-up">
              Sign up
            </Link>
          </p>
          <div className="flex flex-col gap-4">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email"
              placeholder="you@example.com" 
              required 
              className="text-foreground" 
              autoComplete="email"
            />
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="text-foreground"
              autoComplete="current-password"
            />
            {errorMessage && (
              <div className="text-red-500 text-sm">
                {errorMessage}
              </div>
            )}
            <Link 
              href="/reset-password" 
              className="text-sm text-white hover:underline self-end"
            >
              Forgot your password?
            </Link>
            <div className="mt-2">
              <TurnstileWidget />
            </div>
            <SubmitButton pendingText="Signing in..." className="mt-2">
              Sign in
            </SubmitButton>
          </div>
        </form>
      </div>

      {/* Presentation of the app */}
      <div className="container mx-auto max-w-4xl w-full space-y-4 mt-6">

        {/* Tabs navigation */}
        <div className="bg-card rounded-lg mb-4 flex">
          <button
            onClick={() => setActiveTab(0)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 0
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <FaUsers className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">What is Munda Manager?</span>
          </button>

          <button
            onClick={() => setActiveTab(1)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 1
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <FiMap className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">About</span>
          </button>
        </div>
        
        {/* Single white box container for all content */}
        <div className="bg-card shadow-md rounded-lg p-4">
          {/* Tab-specific content */}
          
          {/* What is Munda Manager tab content */}
          {activeTab === 0 && (
            <div>
              <h1 className="text-xl font-semibold mb-4">What is Munda Manager? And what can you do with it?</h1>
              <WhatIsMundaManager />
            </div>
          )}
          
          {/* About Munda Manager tab content */}
          {activeTab === 1 && (
            <div>
              <h1 className="text-xl font-semibold mb-4">About Munda Manager</h1>
              <AboutMundaManager />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
