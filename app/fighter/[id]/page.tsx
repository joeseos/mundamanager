import { createClient } from "@/utils/supabase/server";
import { redirect, notFound, unstable_rethrow } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { checkPermissionCached } from "@/utils/user-permissions";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { getFighterPageData } from "@/app/lib/shared/fighter-data";

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(`/fighter/${id}`));
  }

  let pageProps;
  try {
    const pageData = await getFighterPageData(id);
    if (!pageData) {
      notFound();
    }
    const { fighterData, gangFighters, gangOwnerId } = pageData;

    // Permissions: All authenticated users can view fighters (canView is always true)
    // Edit/delete permissions are enforced in FighterPageComponent
    const userPermissions = await checkPermissionCached(
      user.id,
      fighterData.gang.id,
      gangOwnerId
    );

    pageProps = { fighterData, gangFighters, userPermissions };
  } catch (error) {
    // notFound()/forbidden()/redirect() signal by throwing; let them through
    // untouched so they are not logged as failures.
    unstable_rethrow(error);
    console.error('Error in FighterPage:', error);
    throw error;
  }

  return (
    <FighterPageComponent
      initialFighterData={pageProps.fighterData}
      initialGangFighters={pageProps.gangFighters}
      userPermissions={pageProps.userPermissions}
      fighterId={id}
    />
  );
}
