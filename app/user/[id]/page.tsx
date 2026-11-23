import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { getUserProfile } from "@/app/lib/shared/gang-data";
import { getUserGangs } from "@/app/lib/get-user-gangs";
import { getUserCampaigns, getUserShareCampaigns } from "@/app/lib/get-user-campaigns";
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { getUserCustomSkills } from "@/app/lib/customise/custom-skills";
import { getUserCustomGangTypes } from "@/app/lib/customise/custom-gang-types";
import { getUserCustomTradingPosts } from "@/app/lib/customise/custom-trading-posts";
import { getUserCustomCollections } from "@/app/lib/customise/custom-collections";
import UserProfile from "@/components/user-profile";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(`/user/${id}`));
  }

  const profile = await getUserProfile(id);
  if (!profile) notFound();

  const [gangs, campaigns, equipment, fighters, skills, gangTypes, tradingPosts, collections, userCampaigns] = await Promise.all([
    getUserGangs(id),
    getUserCampaigns(id),
    getUserCustomEquipment(id),
    getUserCustomFighterTypes(id),
    getUserCustomSkills(id),
    getUserCustomGangTypes(id),
    getUserCustomTradingPosts(id),
    getUserCustomCollections(id),
    // Only your own profile can share custom assets to campaigns
    user.id === id ? getUserShareCampaigns(id) : [],
  ]);

  return (
    <UserProfile
      profile={{ id, ...profile }}
      gangs={gangs}
      campaigns={campaigns}
      customAssets={{ equipment, fighters, skills, gangTypes, tradingPosts, collections }}
      currentUserId={user.id}
      userCampaigns={userCampaigns}
    />
  );
}
