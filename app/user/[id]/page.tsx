'use client';

import { use, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import { notFound } from "next/navigation";
import { PatreonSupporterIcon } from "@/components/ui/patreon-supporter-icon";
import { Badge } from "@/components/ui/badge";
import { FiMap } from "react-icons/fi";
import { FaUser, FaUsers } from "react-icons/fa6";
import { MdOutlineColorLens } from "react-icons/md";
import { CustomiseEquipment } from "@/components/customise/custom-equipment";
import { CustomiseTerritories } from "@/components/customise/custom-territories";
import { CustomiseFighters } from "@/components/customise/custom-fighters";
import { CustomEquipment } from "@/app/lib/customise/custom-equipment";
import { CustomTerritory } from "@/app/lib/customise/custom-territories";
import { CustomFighterType } from "@/types/fighter";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/ui/use-toast";

import Link from "next/link";

interface UserData {
  profile: {
    id: string;
    username: string;
    user_role: string;
    patreon_tier_id?: string;
    patreon_tier_title?: string;
    patron_status?: string;
    created_at: string;
  };
  gangs: Array<{
    id: string;
    name: string;
    gang_type: string;
    gang_colour: string;
    credits: number;
    reputation: number;
    rating?: number;
    created_at: string;
  }>;
  campaigns: Array<{
    id: string; // campaign_members id
    role: string;
    status: string;
    joined_at: string;
    campaign_id: string;
    campaign: {
      id: string;
      campaign_name: string;
      status: string | null;
    } | null;
  }>;
  customAssets: {
    equipment: number;
    fighters: number;
    territories: number;
  };
  customAssetsData: {
    equipment: CustomEquipment[];
    fighters: CustomFighterType[];
    territories: CustomTerritory[];
  };
}

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  
  // Fetch user data using TanStack Query
  const { data: userData, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      return response.json() as Promise<UserData>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
  });

  // Get current user for read-only mode
  const session = useSession();
  const currentUserId = session?.user?.id || null;

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Show error toast if user data failed to load
  useEffect(() => {
    if (error) {
      toast({
        description: 'Failed to load user data',
        variant: 'destructive'
      });
    }
  }, [error, toast]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading user data...</p>
        </div>
      </main>
    );
  }

  if (error || !userData) {
    notFound();
  }

  const { profile, gangs, campaigns, customAssets, customAssetsData } = userData;

  // Get arbitrator campaigns for sharing custom assets (only when viewing own profile)
  const userCampaigns = currentUserId === profile.id
    ? campaigns
        .filter(c => c.role === 'arbitrator' && c.campaign)
        .map(c => ({
          id: c.campaign!.id,
          campaign_name: c.campaign!.campaign_name,
          status: c.campaign!.status
        }))
    : [];

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-6 mt-2">
        {/* User Profile Header */}
        <div className="bg-card shadow-md rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                {profile.username}
                {profile.user_role === 'admin' && (
                  <Badge variant="destructive">Admin</Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-2">
                Member since: {new Date(profile.created_at).toISOString().split('T')[0]}
              </p>
            </div>
            {profile.patreon_tier_id && profile.patron_status === 'active_patron' && (
              <Badge variant="outline" className="flex items-center gap-1">
                <PatreonSupporterIcon
                  patreonTierId={profile.patreon_tier_id}
                  patreonTierTitle={profile.patreon_tier_title}
                />
                {profile.patreon_tier_title || 'Patreon Supporter'}
              </Badge>
            )}
          </div>
        </div>

        {/* General Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FaUsers className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{gangs.length}</p>
                <p className="text-sm text-muted-foreground">Gangs</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FiMap className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{campaigns.length}</p>
                <p className="text-sm text-muted-foreground">Campaigns</p>
              </div>
            </div>
          </div>

          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="flex items-center gap-3">
              <MdOutlineColorLens className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {customAssets.equipment + customAssets.fighters + customAssets.territories}
                </p>
                <p className="text-sm text-muted-foreground">Custom Assets</p>
              </div>
            </div>
          </div>
        </div>

        {/* Gangs Section */}
        {gangs.length > 0 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FaUsers className="h-5 w-5" />
                Gangs
              </h2>
              <p className="text-muted-foreground">
                {profile.username}'s gang collection
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
              {gangs.map((gang) => (
                <Link
                  key={gang.id}
                  href={`/gang/${gang.id}`}
                  className="block p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="mb-1">
                    <h3 className="font-semibold truncate">{gang.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {gang.gang_type}
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
        {campaigns.length > 0 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FiMap className="h-5 w-5" />
                Campaigns
              </h2>
              <p className="text-muted-foreground">
                Campaigns {profile.username} is part of
              </p>
            </div>
            <div className="space-y-1">
              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.campaign_id}`}
                  className="block p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{campaign.campaign?.campaign_name || 'Unknown Campaign'}</h3>
                    </div>
                    <div className="text-right">
                      <Badge variant={campaign.role === 'OWNER' ? 'default' : 'secondary'}>
                        {campaign.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-between w-full">
                    <div>Status: {campaign.campaign?.status || 'Unknown'}</div>
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
        {(customAssets.equipment > 0 || customAssets.fighters > 0 || customAssets.territories > 0) && (
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
              {/* Custom Equipment */}
              {customAssetsData.equipment.length > 0 && (
                <CustomiseEquipment
                  initialEquipment={customAssetsData.equipment}
                  readOnly={currentUserId !== profile.id}
                  userId={currentUserId || undefined}
                  userCampaigns={userCampaigns}
                />
              )}

              {/* Custom Fighters */}
              {customAssetsData.fighters.length > 0 && (
                <CustomiseFighters 
                  initialFighters={customAssetsData.fighters} 
                  readOnly={currentUserId !== profile.id}
                />
              )}

              {/* Custom Territories */}
              {customAssetsData.territories.length > 0 && (
                <CustomiseTerritories 
                  initialTerritories={customAssetsData.territories} 
                  readOnly={currentUserId !== profile.id}
                />
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {gangs.length === 0 && campaigns.length === 0 && customAssets.equipment === 0 && customAssets.fighters === 0 && customAssets.territories === 0 && (
          <div className="bg-card shadow-md rounded-lg p-8 text-center">
            <FaUser className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Public Activity</h3>
            <p className="text-muted-foreground">
              {profile.username} hasn't created any gangs, joined any campaigns or created any custom assets yet.
            </p>
          </div>
         )}
       </div>

     </main>
   );
 }
