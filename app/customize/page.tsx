import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CustomizeEquipment } from "@/components/customize/customize-equipment";
import { getUserCustomEquipment } from "@/app/lib/custom-equipment";

export default async function CustomizePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Fetch user's custom equipment using the lib function
  const customEquipment = await getUserCustomEquipment(user.id);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-bold mb-4">Customize</h1>
          
          <div className="space-y-6">
            <section>
              <p className="text-gray-700">
                Customize your Munda Manager experience with custom equipment, fighters and more.
              </p>
            </section>

            <CustomizeEquipment initialEquipment={customEquipment} />
          </div>
        </div>
      </div>
    </main>
  );
} 