import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "./ui/button";
import Link from "next/link";
import Image from "next/image";
import SettingsModal from "./settings-modal";

export default async function HeaderAuth() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's role if logged in
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();
    
    isAdmin = profile?.user_role === 'admin';
  }

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
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
            <SettingsModal user={user} isAdmin={isAdmin} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
