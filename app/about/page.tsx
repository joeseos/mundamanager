import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";

export default async function AboutPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-bold mb-4">About Munda Manager</h1>
          <AboutMundaManager />
        </div>
      </div>
    </main>
  );
} 