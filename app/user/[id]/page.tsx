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
import { isUuid } from "@/utils/uuid";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(`/user/${id}`));
  }

  const isOwnProfile = user.id === id;
  const [profile, gangs, campaigns, equipment, fighters, skills, gangTypes, tradingPosts, collections, userCampaigns] = await Promise.all([
    getUserProfile(id),
    getUserGangs(id),
    getUserCampaigns(id),
    getUserCustomEquipment(id),
    getUserCustomFighterTypes(id),
    getUserCustomSkills(id),
    getUserCustomGangTypes(id),
    getUserCustomTradingPosts(id),
    getUserCustomCollections(id),
    // Only your own profile can share custom assets to campaigns
    isOwnProfile ? getUserShareCampaigns(id) : [],
  ]);
  if (!profile) notFound();

  return (
    <UserProfile
      profile={profile}
      // Only the fields the profile shows reach the browser
      gangs={gangs.map(({ id, name, gang_type, parent_gang_type_name, rating, edition_slug }) =>
        ({ id, name, gang_type, parent_gang_type_name, rating, edition_slug }))}
      campaigns={campaigns.map(({ id, campaign_name, role, status, joined_at, edition_slug }) =>
        ({ id, campaign_name, role, status, joined_at, edition_slug }))}
      customAssets={{ equipment, fighters, skills, gangTypes, tradingPosts, collections }}
      currentUserId={user.id}
      readOnly={!isOwnProfile}
      userCampaigns={userCampaigns}
    />
  );
}
