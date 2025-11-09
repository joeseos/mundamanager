'use client';

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Turnstile } from '@marsidev/react-turnstile';
import { FaUsers } from "react-icons/fa";
import { FiMap } from "react-icons/fi";
import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";
import WhatIsMundaManager from "@/components/munda-manager-info/what-is-munda-manager";

export default function SignIn() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [turnstileStatus, setTurnstileStatus] = useState<"loading" | "error" | "expired" | "success">("loading");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<any>(null);
  
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  
  const nextParam = useMemo(() => {
    const param = searchParams.get('next');
    return param && param.startsWith('/') && !param.startsWith('//') ? param : null;
  }, [searchParams]);

  const topMessage = useMemo(() => {
    const success = searchParams.get('success');
    const message = searchParams.get('message');
    
    if (success) return { success };
    if (message) return { message };
    return null;
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;
    
    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      if (data.session && isMounted) {
        router.push(nextParam || '/');
      }
    }
    
    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router, supabase, nextParam]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (turnstileStatus !== "success") {
      setErrorMessage("Please complete the security verification");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.append("cf-turnstile-response", turnstileToken);
    
    const result = await signInAction(formData);
    
    if (result && 'error' in result) {
      setErrorMessage(result.error);
      // Reset Turnstile after failed submission (token is consumed by server)
      setTurnstileStatus("loading");
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }
  };

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
          onSubmit={handleSubmit}
        >
          {nextParam && (
            <input type="hidden" name="next" value={nextParam} />
          )}
          
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
            
            {/* Turnstile Widget */}
            <div className="mt-2">
              {siteKey ? (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={siteKey}
                  options={{ theme: "dark" }}
                  onSuccess={(token) => {
                    setTurnstileStatus("success");
                    setTurnstileToken(token);
                    setErrorMessage(null);
                  }}
                  onError={() => {
                    setTurnstileStatus("error");
                    setErrorMessage("Security verification failed. Please refresh the page.");
                  }}
                  onExpire={() => {
                    setTurnstileStatus("expired");
                    setTurnstileToken("");
                    // Auto-reset on expire (natural token lifecycle)
                    turnstileRef.current?.reset();
                  }}
                />
              ) : (
                process.env.NODE_ENV === 'development' && (
                  <div className="text-amber-500 text-sm">
                    Note: NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable is not set
                  </div>
                )
              )}
            </div>
            
            <SubmitButton 
              pendingText="Signing in..." 
              className="mt-2"
              disabled={turnstileStatus !== "success"}
            >
              Sign in
            </SubmitButton>
          </div>
        </form>
      </div>

      <TabsSection activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}

function TabsSection({ activeTab, setActiveTab }: { activeTab: number; setActiveTab: (tab: number) => void }) {
  return (
    <div className="container mx-auto max-w-4xl w-full space-y-4 mt-6">
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
      
      <div className="bg-card shadow-md rounded-lg p-4">
        {activeTab === 0 && (
          <div>
            <h1 className="text-xl font-semibold mb-4">What is Munda Manager? And what can you do with it?</h1>
            <WhatIsMundaManager />
          </div>
        )}
        
        {activeTab === 1 && (
          <div>
            <h1 className="text-xl font-semibold mb-4">About Munda Manager</h1>
            <AboutMundaManager />
          </div>
        )}
      </div>
    </div>
  );
}
