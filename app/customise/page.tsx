import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CustomiseEquipment } from "@/components/customise/custom-equipment";
import { CustomiseTerritories } from "@/components/customise/custom-territories";
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomTerritories } from "@/app/lib/customise/custom-territories";
import { getAuthenticatedUser } from "@/utils/auth";

export default async function CustomizePage() {
  const supabase = await createClient();
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Fetch user's custom equipment and territories using the lib functions
  const customEquipment = await getUserCustomEquipment(user.id);
  const customTerritories = await getUserCustomTerritories();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container max-w-5xl w-full space-y-4 mx-auto">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h1 className="text-xl md:text-2xl font-bold mb-4">Customise</h1>
          
          <div className="space-y-6">
            <section>
              <p className="text-gray-700">
                Here you can create your own Equipment and Territories for your campaigns.
              </p>
            </section>

            <CustomiseEquipment initialEquipment={customEquipment} />
            
            <CustomiseTerritories initialTerritories={customTerritories} />
          </div>
        </div>
      </div>
    </main>
  );
}