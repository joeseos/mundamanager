// This page uses server components and React's cache for data fetching
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { GangsProvider } from '@/contexts/GangsContext';
import MyGangs from '@/components/my-gangs';
import { CreateGangButton } from '@/components/create-gang-modal';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { unstable_noStore } from 'next/cache';
import { FaDiscord, FaPatreon } from "react-icons/fa6";

export default async function Home() {
  // Ensure we never use stale data
  unstable_noStore();
  
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const gangs = await getUserGangs();
  console.log(`Page rendering with ${gangs.length} gangs`);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <GangsProvider initialGangs={gangs}>
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-white shadow-md rounded-lg p-4 md:p-4">
            <div className="mb-6">
              <h1 className="text-xl md:text-2xl font-bold mb-2">Welcome to Munda Manager</h1>
              <p className="text-gray-600 mb-4">
                Munda Manager is a comprehensive gang management tool for Necromunda, helping you keep track of your gangs, fighters, and campaigns.
              </p>
              <div>
                <div className="flex gap-2">
                  <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                    <FaDiscord className="mr-2 h-4 w-4" />
                    Discord
                  </a>
                  <a href="https://www.patreon.com/c/mundamanager" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                    <FaPatreon className="mr-2 h-4 w-4" />
                    Patreon
                  </a>
                </div>
              </div>
            </div>
            <CreateGangButton />
          </div>
          <MyGangs />
        </div>
      </GangsProvider>
    </main>
  )
}
