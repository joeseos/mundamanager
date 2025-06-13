import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";

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
    // Fetch fighter details using the existing RPC function
    const { data, error } = await supabase.rpc('get_fighter_details', {
      input_fighter_id: id
    });

    if (error) {
      console.error('Error fetching fighter details:', error);
      redirect("/");
    }

    const fighterData = data[0]?.result;
    if (!fighterData) {
      redirect("/");
    }

    // Use centralized permission service to get user permissions
    const permissionService = new PermissionService();
    const userPermissions = await permissionService.getFighterPermissions(user.id, id);

    // Fetch gang fighters for the dropdown
    const { data: gangFighters, error: fightersError } = await supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, xp')
      .eq('gang_id', fighterData.gang.id);

    if (fightersError) {
      console.error('Error fetching gang fighters:', fightersError);
    }

    // Pass fighter data and user permissions to client component
    return (
      <FighterPageComponent
        initialFighterData={fighterData}
        initialGangFighters={gangFighters || []}
        userPermissions={userPermissions}
        fighterId={id}
      />
    );

  } catch (error) {
    console.error('Error in fighter page:', error);
    redirect("/");
  }
}
