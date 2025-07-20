import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getCompleteFighterData } from "@/app/lib/fighter-details";
import { getGangFighters } from "@/app/lib/fighter-data";
import { getFighterTypesForModal } from "@/app/lib/get-fighter-types";

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  try {
    // Fetch complete fighter data using cached function
    const fighterData = await getCompleteFighterData(id);
    
    if (!fighterData?.fighter) {
      redirect("/");
    }


    // Use centralized permission service to get user permissions
    const permissionService = new PermissionService();
    const userPermissions = await permissionService.getFighterPermissions(user.id, id);

    // Fetch gang fighters for the dropdown using cached function
    const gangFighters = await getGangFighters(fighterData.gang.id);

    // Fetch fighter types including gang variants using cached function
    // Pass the supabase client to avoid creating a new one inside the cached function
    const fighterTypesData = await getFighterTypesForModal(
      fighterData.gang.id,
      fighterData.gang.gang_type_id,
      fighterData.gang.gang_variants || [],
      supabase
    );

    // Pass fighter data and user permissions to client component
    return (
      <FighterPageComponent
        initialFighterData={fighterData}
        initialGangFighters={gangFighters}
        userPermissions={userPermissions}
        fighterId={id}
        fighterTypesData={fighterTypesData}
      />
    );

  } catch (error) {
    console.error('Error in fighter page:', error);
    redirect("/");
  }
}
