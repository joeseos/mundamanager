import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import SettingsModal from './settings-modal';

export default async function HeaderAuth() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's role if logged in
  let isAdmin = false;
  let username: string | undefined = undefined;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role, username')
      .eq('id', user.id)
      .single();

    isAdmin = profile?.user_role === 'admin';
    username = profile?.username;
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
