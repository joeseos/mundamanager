import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CustomiseEquipment } from "@/components/customise/custom-equipment";
import { CustomiseTerritories } from "@/components/customise/custom-territories";
import { CustomiseFighters } from "@/components/customise/custom-fighters";
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomTerritories } from "@/app/lib/customise/custom-territories";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { getAuthenticatedUser } from "@/utils/auth";

export default async function CustomizePage() {
  const supabase = await createClient();
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Fetch user's custom equipment, territories, and fighter types using the lib functions
  const customEquipment = await getUserCustomEquipment(user.id);
  const customTerritories = await getUserCustomTerritories();
  const customFighterTypes = await getUserCustomFighterTypes(user.id);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container max-w-5xl w-full space-y-4 mx-auto">
        <div className="bg-card rounded-lg shadow-md p-4">
          <h1 className="text-xl md:text-2xl font-bold mb-4">Customise</h1>
          
          <div className="space-y-6">
            <section>
              <p className="text-muted-foreground">
                Here you can create your own Equipment, Fighters and Territories for your gangs and campaigns.
              </p>
            </section>

            <CustomiseEquipment initialEquipment={customEquipment} />

            <CustomiseFighters initialFighters={customFighterTypes} />

            <CustomiseTerritories initialTerritories={customTerritories} />
          </div>
        </div>
      </div>
    </main>
  );
}