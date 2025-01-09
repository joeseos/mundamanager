import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CreateGangButton from '@/components/create-gang-button'
import MyGangs from '@/components/my-gangs'
import { GangsProvider } from '@/contexts/GangsContext'

export default async function Home() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <GangsProvider>
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
          <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">Welcome to Munda Manager</h1>
              <p className="text-gray-600 mb-4">
                Munda Manager is a comprehensive gang management tool for Necromunda, helping you keep track of your gangs, fighters, and campaigns.
              </p>
            </div>
            <CreateGangButton />
          </div>
          <MyGangs />
        </div>
      </main>
    </GangsProvider>
  )
}
