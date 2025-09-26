'use client';

import { createClient } from "@/utils/supabase/client";
import { notFound } from "next/navigation";
import { PatreonSupporterBadge } from "@/components/ui/patreon-supporter-badge";
import { Badge } from "@/components/ui/badge";
import { FiMap } from "react-icons/fi";
import { FaUser, FaUsers } from "react-icons/fa6";
import { MdOutlineColorLens } from "react-icons/md";
import { useState, useEffect } from "react";
import { CustomiseEquipment } from "@/components/customise/custom-equipment";
import { CustomiseTerritories } from "@/components/customise/custom-territories";
import { CustomiseFighters } from "@/components/customise/custom-fighters";
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomTerritories } from "@/app/lib/customise/custom-territories";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { CustomEquipment } from "@/app/lib/customise/custom-equipment";
import { CustomTerritory } from "@/app/lib/customise/custom-territories";
import { CustomFighterType } from "@/types/fighter";

import Link from "next/link";

interface UserData {
  profile: {
    id: string;
    username: string;
    user_role: string;
    patreon_tier_id?: string;
    patreon_tier_title?: string;
    patron_status?: string;
    updated_at: string;
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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const { id } = await params;
        const supabase = createClient();
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
        
        // Fetch user profile data
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, user_role, patreon_tier_id, patreon_tier_title, patron_status, updated_at')
          .eq('id', id)
          .single();

        if (profileError || !profile) {
          notFound();
          return;
        }

        // Fetch user's public gangs (only basic info)
        const { data: gangs, error: gangsError } = await supabase
          .from('gangs')
          .select(`
            id,
            name,
            gang_type,
            gang_colour,
            credits,
            reputation,
            rating,
            created_at
          `)
          .eq('user_id', id)
          .order('created_at', { ascending: false });

        if (gangsError) {
          console.error('Error fetching user gangs:', gangsError);
        }

        // Fetch user's campaign memberships (public campaigns only)
        // Step 1: get campaign membership rows
        const { data: campaignMembers, error: membersError } = await supabase
          .from('campaign_members')
          .select('id, role, status, joined_at, campaign_id')
          .eq('user_id', id)
          .order('joined_at', { ascending: false });

        if (membersError) {
          console.error('Error fetching user campaigns:', membersError);
        }

        // Step 2: fetch campaigns by ids (if any)
        let campaignsById: Record<string, { id: string; campaign_name: string; status: string | null }> = {};
        if (campaignMembers && campaignMembers.length > 0) {
          const ids = Array.from(new Set(campaignMembers.map((m: any) => m.campaign_id).filter(Boolean)));
          if (ids.length > 0) {
            const { data: campaignsData, error: campaignsFetchError } = await supabase
              .from('campaigns')
              .select('id, campaign_name, status')
              .in('id', ids);
            if (campaignsFetchError) {
              console.error('Error fetching campaigns:', campaignsFetchError);
            } else if (campaignsData) {
              campaignsById = campaignsData.reduce((acc: any, c: any) => {
                acc[c.id] = c;
                return acc;
              }, {} as Record<string, { id: string; campaign_name: string; status: string | null }>);
            }
          }
        }

        const campaigns = (campaignMembers || []).map((m: any) => {
          return {
            id: m.id,
            role: m.role,
            status: m.status,
            joined_at: m.joined_at,
            campaign_id: m.campaign_id,
            campaign: m.campaign_id ? campaignsById[m.campaign_id] ?? null : null,
          };
        });

        // Hide orphaned memberships that reference non-existing campaigns
        const visibleCampaigns = campaigns.filter((c) => !!c.campaign);

        // Deduplicate by campaign_id, keeping the most recent (list is already ordered by joined_at desc)
        const dedupedCampaignsMap = new Map<string, typeof visibleCampaigns[number]>();
        for (const c of visibleCampaigns) {
          if (c.campaign_id && !dedupedCampaignsMap.has(c.campaign_id)) {
            dedupedCampaignsMap.set(c.campaign_id, c);
          }
        }
        const dedupedCampaigns = Array.from(dedupedCampaignsMap.values());

        // Fetch custom assets data - get full data for the components
        const [customEquipmentResult, customFightersResult, customTerritoriesResult] = await Promise.all([
          supabase
            .from('custom_equipment')
            .select('*')
            .eq('user_id', id)
            .order('equipment_name'),
          supabase
            .from('custom_fighter_types')
            .select('*')
            .eq('user_id', id)
            .order('fighter_type'),
          supabase
            .from('custom_territories')
            .select('*')
            .eq('user_id', id)
            .order('territory_name')
        ]);

        const customAssets = {
          equipment: customEquipmentResult.data?.length || 0,
          fighters: customFightersResult.data?.length || 0,
          territories: customTerritoriesResult.data?.length || 0,
        };

        // Fetch related data for fighters (default skills and equipment)
        let fightersWithExtendedData = customFightersResult.data || [];
        if (fightersWithExtendedData.length > 0) {
          const fighterIds = fightersWithExtendedData.map((f: any) => f.id);
          
          // Fetch default skills and skill access
          const [defaultSkillsResult, skillAccessResult] = await Promise.all([
            supabase
              .from('fighter_defaults')
              .select(`
                custom_fighter_type_id,
                skill_id,
                skills (
                  id,
                  name
                )
              `)
              .in('custom_fighter_type_id', fighterIds)
              .not('skill_id', 'is', null),
            supabase
              .from('fighter_type_skill_access')
              .select(`
                custom_fighter_type_id,
                skill_type_id,
                access_level,
                skill_types (
                  id,
                  name
                )
              `)
              .in('custom_fighter_type_id', fighterIds)
          ]);

          const defaultSkillsData = defaultSkillsResult.data;
          const skillAccessData = skillAccessResult.data;

          // Fetch default equipment (both regular and custom)
          const [defaultEquipmentResult, defaultCustomEquipmentResult] = await Promise.all([
            supabase
              .from('fighter_defaults')
              .select(`
                custom_fighter_type_id,
                equipment_id,
                equipment (
                  id,
                  equipment_name
                )
              `)
              .in('custom_fighter_type_id', fighterIds)
              .not('equipment_id', 'is', null),
            supabase
              .from('fighter_defaults')
              .select(`
                custom_fighter_type_id,
                custom_equipment_id,
                custom_equipment (
                  id,
                  equipment_name
                )
              `)
              .in('custom_fighter_type_id', fighterIds)
              .not('custom_equipment_id', 'is', null)
          ]);

          // Group default skills by fighter ID
          const defaultSkillsByFighter = (defaultSkillsData || []).reduce((acc: any, row: any) => {
            if (!acc[row.custom_fighter_type_id]) {
              acc[row.custom_fighter_type_id] = [];
            }
            acc[row.custom_fighter_type_id].push({
              skill_id: row.skill_id,
              skill_name: row.skills?.name || 'Unknown'
            });
            return acc;
          }, {});

          // Group skill access by fighter ID
          const skillAccessByFighter = (skillAccessData || []).reduce((acc: any, row: any) => {
            if (!acc[row.custom_fighter_type_id]) {
              acc[row.custom_fighter_type_id] = [];
            }
            acc[row.custom_fighter_type_id].push({
              skill_type_id: row.skill_type_id,
              access_level: row.access_level,
              skill_type_name: row.skill_types?.name || 'Unknown'
            });
            return acc;
          }, {});

          // Group default equipment by fighter ID
          const defaultEquipmentByFighter: any = {};
          
          // Process regular equipment
          (defaultEquipmentResult.data || []).forEach((row: any) => {
            if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
              defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
            }
            defaultEquipmentByFighter[row.custom_fighter_type_id].push({
              equipment_id: row.equipment_id,
              equipment_name: row.equipment?.equipment_name || 'Unknown'
            });
          });

          // Process custom equipment
          (defaultCustomEquipmentResult.data || []).forEach((row: any) => {
            if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
              defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
            }
            defaultEquipmentByFighter[row.custom_fighter_type_id].push({
              equipment_id: `custom_${row.custom_equipment_id}`,
              equipment_name: `${row.custom_equipment?.equipment_name || 'Unknown'} (Custom)`
            });
          });

          // Combine fighter data with related data
          fightersWithExtendedData = fightersWithExtendedData.map((fighter: any) => ({
            ...fighter,
            default_skills: defaultSkillsByFighter[fighter.id] || [],
            default_equipment: defaultEquipmentByFighter[fighter.id] || [],
            skill_access: skillAccessByFighter[fighter.id] || []
          }));
        }

        const customAssetsData = {
          equipment: customEquipmentResult.data || [],
          fighters: fightersWithExtendedData,
          territories: customTerritoriesResult.data || [],
        };

        setUserData({
          profile,
          gangs: gangs || [],
          campaigns: dedupedCampaigns,
          customAssets,
          customAssetsData,
        });
      } catch (error) {
        console.error('Error fetching user data:', error);
        notFound();
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [params]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-6 mt-2">
          <div className="bg-card shadow-md rounded-lg p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading user data...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!userData) {
    notFound();
  }

  const { profile, gangs, campaigns, customAssets, customAssetsData } = userData;

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-6 mt-2">
        {/* User Profile Header */}
        <div className="bg-card shadow-md rounded-lg p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                {profile.username}
                {profile.user_role === 'admin' && (
                  <Badge variant="destructive">Admin</Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-2">
                Member since: {new Date(profile.updated_at).toISOString().split('T')[0]}
              </p>
            </div>
            {profile.patreon_tier_id && profile.patron_status === 'active_patron' && (
              <PatreonSupporterBadge
                username={profile.patreon_tier_title || 'Patreon Supporter'}
                patreonTierId={profile.patreon_tier_id}
                patreonTierTitle={profile.patreon_tier_title}
              />
            )}
          </div>
        </div>

        {/* Stats Overview */}
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
          <div className="bg-card shadow-md rounded-lg p-4 md:p-6">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FaUsers className="h-5 w-5" />
                Gangs
              </h2>
              <p className="text-muted-foreground">
                {profile.username}'s gang collection
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gangs.map((gang) => (
                <Link
                  key={gang.id}
                  href={`/gang/${gang.id}`}
                  className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="mb-2">
                    <h3 className="font-semibold truncate">{gang.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
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
          <div className="bg-card shadow-md rounded-lg p-4 md:p-6">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FiMap className="h-5 w-5" />
                Campaigns
              </h2>
              <p className="text-muted-foreground">
                Campaigns {profile.username} is part of
              </p>
            </div>
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.campaign_id}`}
                  className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{campaign.campaign?.campaign_name || 'Unknown Campaign'}</h3>
                      <p className="text-sm text-muted-foreground">
                        Status: {campaign.campaign?.status || 'Unknown'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={campaign.role === 'OWNER' ? 'default' : 'secondary'}>
                        {campaign.role}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Joined {campaign.joined_at ? new Date(campaign.joined_at).toISOString().split('T')[0] : 'Unknown'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Custom Assets Section */}
        {(customAssets.equipment > 0 || customAssets.fighters > 0 || customAssets.territories > 0) && (
          <div className="bg-card shadow-md rounded-lg p-4 md:p-6">
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
