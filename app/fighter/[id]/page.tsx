import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";

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

    // SERVER-SIDE AUTHORIZATION CHECK
    // Get gang ownership information
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', fighterData.gang.id)
      .single();

    if (gangError) {
      console.error('Error fetching gang ownership:', gangError);
      redirect("/");
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.user_role === 'admin';
    const isOwner = gang.user_id === user.id;

    // If user doesn't own the gang and isn't admin, redirect
    if (!isAdmin && !isOwner) {
      redirect("/");
    }

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
        userPermissions={{
          isOwner,
          isAdmin,
          canEdit: isOwner || isAdmin,
          canDelete: isOwner || isAdmin,
          userId: user.id
        }}
        fighterId={id}
      />
    );

  } catch (error) {
    console.error('Error in fighter page:', error);
    redirect("/");
  }
}
