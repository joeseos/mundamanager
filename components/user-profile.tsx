"use client";

import Link from "next/link";
import { PatreonSupporterIcon } from "@/components/ui/patreon-supporter-icon";
import { Badge } from "@/components/ui/badge";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { PiFlagBannerFoldBold } from "react-icons/pi";
import { FaUser, FaUsers } from "react-icons/fa6";
import { MdOutlineColorLens } from "react-icons/md";
import { CustomiseEquipment } from "@/components/customise/custom-equipment";
import { CustomiseFighters } from "@/components/customise/custom-fighters";
import { CustomiseSkills } from "@/components/customise/custom-skills";
import { CustomiseGangTypes } from "@/components/customise/custom-gang-types";
import { CustomiseTradingPosts } from "@/components/customise/custom-trading-posts";
import { CustomiseCollections } from "@/components/customise/custom-collections";
import type { Gang } from "@/app/lib/get-user-gangs";
import type { Campaign } from "@/app/lib/get-user-campaigns";
import type { CustomEquipment } from "@/app/lib/customise/custom-equipment";
import type { CustomSkill } from "@/app/lib/customise/custom-skills";
import type { CustomFighterType } from "@/types/fighter";
import type { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import type { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";
import type { CustomCollectionWithItems } from "@/app/lib/customise/custom-collections";
import type { UserCampaign } from "@/types/campaign";
import { useHomeEdition } from "@/hooks/use-home-edition";
import { EditionToggle } from "@/components/home/edition-toggle";
import { sameEditionForDisplay } from "@/types/edition";
import { compactGangTypeLabel } from "@/utils/gang-type-label";

interface UserProfileProps {
  profile: {
    id: string;
    username: string;
    user_role: string | null;
    patreon_tier_id: string | null;
    patreon_tier_title: string | null;
    patron_status: string | null;
    created_at: string | null;
  };
  gangs: Gang[];
  campaigns: Campaign[];
  customAssets: {
    equipment: CustomEquipment[];
    fighters: CustomFighterType[];
    skills: CustomSkill[];
    gangTypes: CustomGangType[];
    tradingPosts: CustomTradingPost[];
    collections: CustomCollectionWithItems[];
  };
  /** Signed-in viewer; share campaigns are only passed for their own profile */
  currentUserId: string;
  userCampaigns: UserCampaign[];
}

export default function UserProfile({ profile, gangs, campaigns, customAssets, currentUserId, userCampaigns }: UserProfileProps) {
  // Same edition the home Custom Assets tab is on, so a profile never renders an
  // N26 asset under N23 rules.
  const { editionSlug, setEditionSlug } = useHomeEdition();
  const readOnly = currentUserId !== profile.id;

  const byEdition = <T extends { edition_slug?: string | null }>(items: T[]) =>
    items.filter(item => sameEditionForDisplay(item.edition_slug, editionSlug));

  const editionAssets = {
    gangTypes: byEdition(customAssets.gangTypes),
    tradingPosts: byEdition(customAssets.tradingPosts),
    equipment: byEdition(customAssets.equipment),
    fighters: byEdition(customAssets.fighters),
    skills: byEdition(customAssets.skills),
    collections: byEdition(customAssets.collections),
  };
  const editionGangs = byEdition(gangs);
  const editionCampaigns = byEdition(campaigns);
  const editionAssetCount = Object.values(editionAssets).reduce(
    (total, assets) => total + assets.length,
    0
  );
  const hasAnyCustomAssets = Object.values(customAssets).some(assets => assets.length > 0);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full space-y-6 mt-2">
        {/* User Profile Header */}
        <div className="bg-card shadow-md rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                {profile.username}
                <UserRoleBadge role={profile.user_role ?? 'user'} />
              </h1>
              <p className="text-muted-foreground mt-2">
                Member since: {profile.created_at ? new Date(profile.created_at).toISOString().split('T')[0] : 'Unknown'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {profile.patreon_tier_id && profile.patron_status === 'active_patron' && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <PatreonSupporterIcon
                    patreonTierId={profile.patreon_tier_id}
                    patreonTierTitle={profile.patreon_tier_title ?? undefined}
                  />
                  {profile.patreon_tier_title || 'Patreon Supporter'}
                </Badge>
              )}
              <EditionToggle value={editionSlug} onChange={setEditionSlug} />
            </div>
          </div>
        </div>

        {/* General Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FaUsers className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{editionGangs.length}</p>
                <p className="text-sm text-muted-foreground">Gangs</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <PiFlagBannerFoldBold className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{editionCampaigns.length}</p>
                <p className="text-sm text-muted-foreground">Campaigns</p>
              </div>
            </div>
          </div>

          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <MdOutlineColorLens className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {editionAssetCount}
                </p>
                <p className="text-sm text-muted-foreground">Custom Assets</p>
              </div>
            </div>
          </div>
        </div>

        {/* Gangs Section */}
        {editionGangs.length > 0 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FaUsers className="h-5 w-5" />
                Gangs
              </h2>
              <p className="text-muted-foreground">
                {profile.username}&apos;s gang collection
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
              {editionGangs.map((gang) => (
                <Link
                  key={gang.id}
                  href={`/gang/${gang.id}`}
                  prefetch={false}
                  className="block p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="mb-1">
                    <h3 className="font-semibold truncate">{gang.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {compactGangTypeLabel(gang.gang_type, gang.parent_gang_type_name)}
                  </p>
                  {gang.rating !== null && gang.rating !== undefined && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Rating: </span>
                      <span className="font-medium">{gang.rating}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Campaigns Section */}
        {editionCampaigns.length > 0 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <PiFlagBannerFoldBold className="h-5 w-5" />
                Campaigns
              </h2>
              <p className="text-muted-foreground">
                Campaigns {profile.username} is part of
              </p>
            </div>
            <div className="space-y-1">
              {editionCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  prefetch={false}
                  className="block p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{campaign.campaign_name || 'Unknown Campaign'}</h3>
                    </div>
                    <div className="text-right">
                      <Badge variant={campaign.role === 'OWNER' ? 'default' : 'secondary'}>
                        {campaign.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-between w-full">
                    <div>Status: {campaign.status || 'Unknown'}</div>
                    <div className="text-xs whitespace-nowrap">
                      Joined {campaign.joined_at ? new Date(campaign.joined_at).toISOString().split('T')[0] : 'Unknown'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Custom Assets Section */}
        {hasAnyCustomAssets && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <MdOutlineColorLens className="h-5 w-5" />
                Custom Assets
              </h2>
              <p className="text-muted-foreground">
                Custom content created by {profile.username}
              </p>
            </div>
            
            <div className="space-y-6">
              {editionAssetCount === 0 && (
                <p className="text-muted-foreground">
                  No custom assets for {editionSlug.toUpperCase()}
                </p>
              )}
              {/* Custom Gang Types */}
              {editionAssets.gangTypes.length > 0 && (
                <CustomiseGangTypes
                  initialGangTypes={editionAssets.gangTypes}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                  userId={currentUserId}
                  userCampaigns={userCampaigns}
                />
              )}

              {/* Custom Trading Posts */}
              {editionAssets.tradingPosts.length > 0 && (
                <CustomiseTradingPosts
                  initialTradingPosts={editionAssets.tradingPosts}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                  userId={currentUserId}
                  userCampaigns={userCampaigns}
                />
              )}

              {/* Custom Equipment */}
              {editionAssets.equipment.length > 0 && (
                <CustomiseEquipment
                  initialEquipment={editionAssets.equipment}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                  userId={currentUserId}
                  userCampaigns={userCampaigns}
                />
              )}

              {/* Custom Fighters */}
              {editionAssets.fighters.length > 0 && (
                <CustomiseFighters
                  initialFighters={editionAssets.fighters}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                />
              )}

              {/* Custom Skills */}
              {editionAssets.skills.length > 0 && (
                <CustomiseSkills
                  initialSkills={editionAssets.skills}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                  userId={currentUserId}
                  userCampaigns={userCampaigns}
                />
              )}

              {/* Collections */}
              {editionAssets.collections.length > 0 && (
                <CustomiseCollections
                  initialCollections={editionAssets.collections}
                  editionSlug={editionSlug}
                  readOnly={readOnly}
                  userId={currentUserId}
                  userCampaigns={userCampaigns}
                />
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {editionGangs.length === 0 && editionCampaigns.length === 0 && editionAssetCount === 0 && (
          <div className="bg-card shadow-md rounded-lg p-8 text-center">
            <FaUser className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Public Activity</h3>
            <p className="text-muted-foreground">
              {profile.username} hasn&apos;t created any gangs, joined any campaigns or created any custom assets yet.
            </p>
          </div>
         )}
       </div>

     </main>
   );
 }
