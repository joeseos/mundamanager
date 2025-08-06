'use client';

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import Link from "next/link";
import Image from "next/image";
import SettingsModal from "./settings-modal";
import { User } from '@supabase/supabase-js';

export default function HeaderAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Fetch user's role if logged in
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_role, username')
          .eq('id', user.id)
          .single();
        
        setIsAdmin(profile?.user_role === 'admin');
        setUsername(profile?.username);
      }
      
      setLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_role, username')
          .eq('id', session.user.id)
          .single();
        
        setIsAdmin(profile?.user_role === 'admin');
        setUsername(profile?.username);
      } else {
        setIsAdmin(false);
        setUsername(undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50 print:hidden">
        <div className="flex justify-between items-center h-14 px-2">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/favicon-192x192.png"
              alt="App Icon"
              width={36}
              height={36}
              className="ml-1 mr-2"
            />
            <span className="text-lg font-bold hover:text-primary transition-colors">
              Munda Manager
            </span>
          </Link>
          <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50 print:hidden">
      <div className="flex justify-between items-center h-14 px-2">
        <Link href="/" className="flex items-center">
          <Image
            src="/images/favicon-192x192.png"
            alt="App Icon"
            width={36}
            height={36}
            className="ml-1 mr-2"
          />
          <span className="text-lg font-bold hover:text-primary transition-colors">
            Munda Manager
          </span>
        </Link>
        {user ? (
          <div className="mr-2">
            <SettingsModal user={user} isAdmin={isAdmin} username={username} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
