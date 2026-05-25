'use client';

import { signInAction } from "@/app/actions/auth";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from 'react';
import TurnstileWidget from './TurnstileWidget';
import { createClient } from "@/utils/supabase/client";
import { FaUsers } from "react-icons/fa";
import { MdAppShortcut } from "react-icons/md";
import { LuEye, LuEyeOff } from "react-icons/lu";
import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";
import WhatIsMundaManager from "@/components/munda-manager-info/what-is-munda-manager";

export default function SignIn() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [userCount, setUserCount] = useState<number | undefined>(undefined);
  const [gangCount, setGangCount] = useState<number | undefined>(undefined);
  const [campaignCount, setCampaignCount] = useState<number | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);
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

    // Fetch stats (non-blocking, cached)
    async function fetchStats() {
      try {
        const [userResponse, gangResponse, campaignResponse] = await Promise.all([
          fetch('/api/stats/user-count'),
          fetch('/api/stats/gang-count'),
          fetch('/api/stats/campaign-count')
        ]);

        if (userResponse.ok) {
          const data = await userResponse.json();
          setUserCount(data.count);
        }
        if (gangResponse.ok) {
          const data = await gangResponse.json();
          setGangCount(data.count);
        }
        if (campaignResponse.ok) {
          const data = await campaignResponse.json();
          setCampaignCount(data.count);
        }
      } catch (error) {
        // Silently fail - we'll just show the generic message
        console.error('Failed to fetch stats:', error);
      }
    }

    fetchStats();
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
          <h1 className="text-2xl font-medium text-white mb-2">Sign In</h1>
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
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                className="text-foreground pr-10"
                autoComplete="current-password"
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
            <div className="mt-2 flex justify-center">
              <TurnstileWidget />
            </div>
            <SubmitButton pendingText="Signing In..." className="mt-2">
              Sign In
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
            <MdAppShortcut className="h-5 w-5" />
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
            <FaUsers className="s-5" />
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
              <WhatIsMundaManager userCount={userCount} gangCount={gangCount} campaignCount={campaignCount} />
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