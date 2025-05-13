// This page uses server components and React's cache for data fetching
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { GangsProvider } from '@/contexts/GangsContext';
import MyGangs from '@/components/my-gangs';
import { CreateGangButton } from '@/components/create-gang-modal';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { unstable_noStore } from 'next/cache';

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
              <p className="text-red-600 font-bold mb-4">
                Please note, Munda Manager is still in development and not quite ready yet.
              </p>
            </div>
            <CreateGangButton />
          </div>
          <MyGangs />
        </div>
      </GangsProvider>
    </main>
  )
}
