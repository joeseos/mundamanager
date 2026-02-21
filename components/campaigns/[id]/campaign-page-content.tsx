"use client"

import React, { useState, useRef, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/ui/modal";
import { useShare } from '@/hooks/use-share';
import html2canvas from 'html2canvas';
import Image from 'next/image';
import { CampaignImageEditModal } from '@/components/campaigns/[id]/campaign-image-edit-modal';
import MemberSearchBar from "@/components/campaigns/[id]/campaign-member-search-bar"
import MembersTable from "@/components/campaigns/[id]/campaign-members-table"
import CampaignBattleLogsList from "@/components/campaigns/[id]/campaign-battle-logs-list";
import { FiMap, FiCamera, FiShare2 } from "react-icons/fi";
import { MdFactory } from "react-icons/md";
import { LuSwords, LuTrophy, LuCodeXml } from "react-icons/lu";
import { FaBook } from "react-icons/fa";
import { ImInfo } from "react-icons/im";
import CampaignTerritoryList from "@/components/campaigns/[id]/campaign-territory-list";
import CampaignAddTerritoryModal from "@/components/campaigns/[id]/campaign-add-territory-modal";
import { CampaignBattleLogsListRef } from "@/components/campaigns/[id]/campaign-battle-logs-list";
import CampaignEditModal from "@/components/campaigns/[id]/campaign-edit-modal";
import CampaignTriumphs from "@/components/campaigns/[id]/campaign-triumphs";
import type { CampaignPermissions } from '@/types/user-permissions';
import type { Battle } from '@/types/campaign';
import { updateCampaignSettings } from "@/app/actions/campaigns/[id]/campaign-settings";
import { CampaignNotes } from "@/components/campaigns/[id]/campaign-notes";

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string;
}

interface Member {
  user_id: string;
  username: string;
  role: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  status: string | null;
  invited_at: string;
  joined_at: string | null;
  invited_by: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role: string;
  };
  gangs: {
    campaign_gang_id: string;
    id: string;
    name: string;
    gang_type: string;
    gang_colour: string;
    status: string | null;
    rating?: number;
    reputation?: number;
    allegiance?: {
      id: string;
      name: string;
      is_custom: boolean;
    } | null;
  }[];
}

interface Territory {
  id: string;
  territory_id: string | null;
  custom_territory_id?: string | null;
  territory_name: string;
  gang_id: string | null;
  created_at: string;
  ruined?: boolean;
  default_gang_territory?: boolean;
  is_custom?: boolean;
  owning_gangs?: Gang[];
  owner?: {
    [key: string]: {
      assigned_at: string;
    };
  } | null;
}


interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface AllTerritory {
  id: string;
  territory_name: string;
  campaign_type_id: string | null;
  is_custom?: boolean;
  territory_id?: string | null;
  custom_territory_id?: string | null;
}


interface CampaignPageContentProps {
  campaignData: {
    id: string;
    campaign_name: string;
    campaign_type_id: string;
    campaign_type_name: string;
    campaign_type_image_url?: string;
    image_url?: string;
    status: string | null;
    description: string;
    created_at: string;
    updated_at: string | null;
    note: string | null;
    members: any[];
    territories: Territory[];
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    has_power: boolean;
    has_sustenance: boolean;
    has_salvage: boolean;
    trading_posts: string[];
    battles: Battle[];
      triumphs: {
        id: string;
        triumph: string;
        criteria: string;
        campaign_type_id: string;
        created_at: string;
        updated_at: string | null;
      }[];
    };
  userId?: string;
  permissions: CampaignPermissions | null;
  campaignTypes: CampaignType[];
  allTerritories: AllTerritory[];
  tradingPostTypes?: Array<{ id: string; trading_post_name: string }>;
  campaignAllegiances?: Array<{ id: string; allegiance_name: string; is_custom: boolean }>;
  campaignResources?: Array<{ id: string; resource_name: string; is_custom: boolean }>;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CampaignPageContent({ 
  campaignData: initialCampaignData, 
  userId, 
  permissions, 
  campaignTypes, 
  allTerritories,
  tradingPostTypes,
  campaignAllegiances = [],
  campaignResources = []
}: CampaignPageContentProps) {
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const { shareUrl } = useShare();
  const campaignContentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const battleLogsRef = useRef<CampaignBattleLogsListRef>(null);
  const [isPending, startTransition] = useTransition();
  const [showImageModal, setShowImageModal] = useState(false);
  const [showTerritoryModal, setShowTerritoryModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Helper for checking authentication
  const isAuthenticated = !!userId;

  // Provide default permissions if null
  const safePermissions = permissions || {
    isOwner: false,
    isAdmin: false,
    canEdit: false,
    canDelete: false,
    canView: true,
    userId: userId || '',
    isArbitrator: false,
    isMember: false,
    canEditCampaign: false,
    canDeleteCampaign: false,
    canManageMembers: false,
    canManageTerritories: false,
    canEditTerritories: false,
    canDeleteTerritories: false,
    canClaimTerritories: false,
    canAddBattleLogs: false,
    canEditBattleLogs: false,
    campaignRole: null
  };

  // Fix: Include app-level admin status in isAdmin check
  const isAdmin = safePermissions.isOwner || safePermissions.isArbitrator || safePermissions.isAdmin;

  const refreshData = async () => {
    try {
      // Instead of router.refresh(), fetch fresh data from our cached endpoints
      const response = await fetch(`/api/campaigns/${campaignData.id}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch updated campaign data');
      }
      
      const updatedCampaignData = await response.json();
      
      // Update only the campaign data state
      setCampaignData(updatedCampaignData);
      
    } catch (error) {
      console.error('Error refreshing campaign data:', error);
      toast({
        variant: "destructive",
        description: "Failed to refresh campaign data"
      });
    }
  };

  // Shared handler for territory updates with optimistic updates
  interface TerritoryUpdate {
    action: 'assign' | 'remove' | 'update' | 'delete';
    territoryId: string;
    gangId?: string;
    gangData?: Gang;
    updates?: {
      ruined?: boolean;
      default_gang_territory?: boolean;
    };
  }

  const handleTerritoryUpdate = useCallback((update?: TerritoryUpdate) => {
    if (!update) {
      refreshData();
      return;
    }

    if (update.action === 'assign') {
      // Optimistically assign gang to territory
      setCampaignData(prev => ({
        ...prev,
        territories: (prev.territories || []).map(territory => 
          territory.id === update.territoryId
            ? { ...territory, gang_id: update.gangId ?? null, owning_gangs: update.gangData ? [update.gangData] : [] }
            : territory
        )
      }));
    } else if (update.action === 'remove') {
      // Optimistically remove gang from territory
      setCampaignData(prev => ({
        ...prev,
        territories: (prev.territories || []).map(territory => 
          territory.id === update.territoryId
            ? { ...territory, gang_id: null, owning_gangs: [] }
            : territory
        )
      }));
    } else if (update.action === 'update') {
      // Optimistically update territory status
      setCampaignData(prev => ({
        ...prev,
        territories: (prev.territories || []).map(territory => 
          territory.id === update.territoryId
            ? { ...territory, ...update.updates }
            : territory
        )
      }));
    } else if (update.action === 'delete') {
      // Optimistically delete territory
      setCampaignData(prev => ({
        ...prev,
        territories: (prev.territories || []).filter(t => t.id !== update.territoryId)
      }));
    }
  }, [refreshData]);

  const handleSave = async (formValues: {
    campaign_name: string;
    description: string;
    status: string;
    trading_posts: string[];
  }) => {
    try {
      const result = await updateCampaignSettings({
        campaignId: campaignData.id,
        campaign_name: formValues.campaign_name,
        description: formValues.description,
        trading_posts: formValues.trading_posts,
        status: formValues.status
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const now = new Date().toISOString();
      
      // Update local state
      setCampaignData(prev => ({
        ...prev,
        campaign_name: formValues.campaign_name,
        description: formValues.description,
        trading_posts: formValues.trading_posts,
        status: formValues.status,
        updated_at: now,
      }));
      
      toast({
        description: "Campaign settings updated successfully",
      });
      
      setShowEditModal(false);
      return true;
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        variant: "destructive",
        description: "Failed to update campaign settings",
      });
      return false;
    }
  };

  // Add this function to handle the Add button click
  const handleAddBattleLog = () => {
    console.log('Add battle log button clicked');
    console.log('User role:', safePermissions.campaignRole);
    console.log('Is admin:', isAdmin);
    console.log('battleLogsRef exists:', !!battleLogsRef.current);
    
    if (battleLogsRef.current) {
      console.log('Opening battle log modal via ref');
      battleLogsRef.current.openAddModal();
    } else {
      console.error('battleLogsRef.current is null');
    }
  };

  // Add this function to handle the Add territory button click
  const handleAddTerritory = () => {
    setShowTerritoryModal(true);
  };

  // Handle campaign export
  const handleExportCampaign = (format: 'json' | 'xml') => {
    // Open the API endpoint directly in a new tab
    window.open(`/api/campaigns/${campaignData.id}/data?format=${format}`, '_blank');
    
    toast({
      description: `Campaign data opened in new tab (${format.toUpperCase()})`
    });
    
    setShowExportModal(false);
  };

  // Screenshot with html2canvas
  const handleScreenshot = async () => {
    if (!campaignContentRef.current) return;

    await document.fonts.ready;

    const canvas = await html2canvas(campaignContentRef.current, {
      scale: 1.3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#000000', // for JPEG
    });

    const now = new Date();
    const datePart = formatDate(now.toISOString());
    const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${datePart}_${timePart}_${campaignData.campaign_name.replace(/\s+/g, '_')}-MundaManager.jpg`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.85); // quality (0–1)
    link.click();
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Failed to load image:', e.currentTarget.src);
    e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
  };

  const canEditImage = !!(permissions?.isOwner || permissions?.isArbitrator || permissions?.isAdmin);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div ref={campaignContentRef} className="container mx-auto max-w-5xl w-full space-y-4">
        {/* Tabs navigation */}
        <div className="bg-card rounded-lg mb-4 flex">
          <button
            onClick={() => setActiveTab(0)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 0
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <FiMap className="size-4" />
            <span className="ml-2 hidden sm:inline">Campaign</span>
          </button>
          <button
            onClick={() => setActiveTab(1)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 1
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <MdFactory className="size-4" />
            <span className="ml-2 hidden sm:inline">Territories</span>
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 2
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <LuSwords className="size-4" />
            <span className="ml-2 hidden sm:inline">Battle Log</span>
          </button>
          <button
            onClick={() => setActiveTab(3)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 3
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <FaBook className="size-4" />
            <span className="ml-2 hidden sm:inline">Pack</span>
          </button>
          <button
            onClick={() => setActiveTab(4)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 4
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            <LuTrophy className="size-4" />
            <span className="ml-2 hidden sm:inline">Triumphs</span>
          </button>
        </div>
        
        {/* Tab-specific content */}

        {/* Campaign tab content */}
        {activeTab === 0 && (
          <>
          {/* Campaign header with the Edit button */}
          <div id="campaign_card" className="bg-card shadow-md rounded-lg p-4 flex items-start gap-6 print:print-fighter-card print:border-2 print:border-black">
            {/* Left Section: Campaign Image */}
            <div className="hidden sm:flex relative w-[200px] h-[200px] md:w-[250px] md:h-[250px] mt-1 shrink-0 items-center justify-center print:hidden">
              {campaignData.image_url || campaignData.campaign_type_image_url ? (
                <Image
                  src={campaignData.image_url || campaignData.campaign_type_image_url || ''}
                  alt={campaignData.campaign_name}
                  width={180}
                  height={180}
                  className="absolute rounded-full object-cover mt-1 z-10 w-[180px] h-auto"
                  priority={false}
                  quality={100}
                  onError={handleImageError}
                />
              ) : (
                <div className="absolute w-[180px] h-[180px] rounded-full bg-secondary z-10 flex items-center justify-center">
                  <FiMap className="size-[80px] text-muted-foreground" />
                </div>
              )}
              {canEditImage && (
                <div
                  className={`absolute z-20 w-[250px] h-[250px] cursor-pointer hover:opacity-80 transition-opacity`}
                  onClick={() => setShowImageModal(true)}
                >
                  <Image
                    src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp"
                    alt="Cogwheel"
                    width={250}
                    height={250}
                    className="absolute z-20 w-[250px] h-auto"
                    priority
                    quality={100}
                  />
                </div>
              )}
            </div>

            {/* Right Section: Content */}
            <div className="flex-grow w-full">
                             <div className="flex justify-between items-start mb-1">
                 <h2 className="text-xl md:text-2xl font-bold">{campaignData.campaign_name}</h2>
                 <div className="flex gap-2 print:hidden">
                   {safePermissions.canEditCampaign && (
                     <Button
                       onClick={() => setShowEditModal(true)}
                       className="bg-neutral-900 text-white hover:bg-gray-800 print:hidden"
                     >
                       Edit
                     </Button>
                   )}
                 </div>
               </div>

              <div className="flex flex-wrap justify-end -mr-[10px] mb-1">
                {/* View Campaign Data button */}
                {safePermissions.canEditCampaign && (
                  <Button
                    onClick={() => setShowExportModal(true)}
                    variant="ghost"
                    size="icon"
                    className="print:hidden"
                    title="View Campaign Data"
                  >
                    <LuCodeXml className="w-5 h-5" />
                  </Button>
                )}

                {/* Screenshot button */}
                <Button
                  onClick={handleScreenshot}
                  variant="ghost"
                  size="icon"
                  className="print:hidden"
                  title="Take Screenshot"
                >
                  <FiCamera className="w-5 h-5" />
                </Button>

                {/* Share button */}
                <Button
                  onClick={() => shareUrl(campaignData.campaign_name)}
                  variant="ghost"
                  size="icon"
                  className="print:hidden"
                  title="Share Campaign"
                >
                  <FiShare2 className="w-5 h-5" />
                </Button>
              </div>

              <div className="text-muted-foreground text-sm mb-4">
                <div className="flex flex-wrap gap-2 mb-1">
                  {(() => {
                    const owner = campaignData.members.find(member => member.role === 'OWNER')?.username;
                    const arbitrators = campaignData.members.filter(member => member.role === 'ARBITRATOR');
                    const allArbitrators = arbitrators
                      .map(member => member.username)
                      .filter((username, index, array) => array.indexOf(username) === index);
                    
                    // Add owner to the beginning if not already in the list
                    const uniqueArbitrators = owner && !allArbitrators.includes(owner) 
                      ? [owner, ...allArbitrators]
                      : allArbitrators;
                    
                    return uniqueArbitrators.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="whitespace-nowrap">
                          {uniqueArbitrators.length === 1 ? 'Arbitrator: ' : 'Arbitrators: '}
                        </span>
                        {uniqueArbitrators.map((username, index) => (
                          <Badge key={index} variant={username === owner ? 'outline' : 'secondary'}>
                            {username}
                          </Badge>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="flex flex-wrap gap-2 mb-1">
                  <div className="flex items-center gap-1">
                    Type: <Badge variant="secondary">{campaignData.campaign_type_name}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    Status: <Badge variant="secondary">{campaignData.status || 'Active'}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="whitespace-nowrap">
                      {(campaignData.trading_posts?.length ?? 0) === 1 ? 'Trading Post: ' : 'Trading Posts: '}
                    </span>
                    {(campaignData.trading_posts || []).length > 0 ? (
                      [...(campaignData.trading_posts || [])]
                        .map((id) => ({ id, name: tradingPostTypes?.find(tp => tp.id === id)?.trading_post_name ?? id }))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(({ id, name }) => (
                          <Badge key={id} variant="secondary">
                            {name}
                          </Badge>
                        ))
                    ) : (
                      <Badge variant="outline">None</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-muted-foreground mb-4">
                <div className="whitespace-pre-wrap break-words">
                  {campaignData.description}
                </div>
              </div>

              <div className="mt-2">
                <div className="grid grid-cols-2 md:gap-x-20 gap-x-10 text-sm">
                  {/* 1st Column */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Players:</span>
                      <span className="font-semibold">
                        {(() => {
                          const uniqueUsernames = campaignData.members
                            .map(member => member.username)
                            .filter((username, index, array) => array.indexOf(username) === index);
                          return uniqueUsernames.length;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gangs:</span>
                      <span className="font-semibold">
                        {campaignData.members.reduce((total, member) => total + (member.gangs?.length || 0), 0)}
                      </span>
                    </div>
                  </div>

                  {/* 2nd Column */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Territories:</span>
                      <span className="font-semibold">{campaignData.territories.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Battles:</span>
                      <span className="font-semibold">{campaignData.battles?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-row item-center justify-between text-xs text-muted-foreground">
                <span>Created: {formatDate(campaignData.created_at)}</span>
                <span>Last Updated: {formatDate(campaignData.updated_at)}</span>
              </div>
            </div>
          </div>
          {/* End campaign header and modal logic */}

          {/* Other Section */}
          <div className="bg-card shadow-md rounded-lg p-4">
            {/* Campaign Members Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl md:text-2xl font-bold">Gangs & Players</h2>
                <div className="relative group">
                  <ImInfo className="text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded w-72 -left-36 z-50">
                    To add a gang, first add its owner as a player. You can then select from their available gangs. Repeat the process to add more gangs from the same player.
                    <br /><br />
                    You can also change the role of a player from Member to Arbitrator by clicking on their role icon.
                  </div>
                </div>
              </div>
              {safePermissions.canManageMembers && (
                <MemberSearchBar
                  campaignId={campaignData.id}
                  campaignMembers={campaignData.members}
                  onMemberAdd={() => {
                    // ✅ Only refresh data after server action completes
                    // The server action already handles cache invalidation
                    refreshData();
                  }}
                />
              )}
              <MembersTable
                campaignId={campaignData.id}
                isAdmin={isAdmin}
                members={campaignData.members}
                userId={userId}
                initialAllegiances={campaignAllegiances}
                onMemberUpdate={({ removedMemberId, removedGangIds, updatedMember }) => {
                  // For specific updates, we do optimistic updates (no startTransition needed for instant updates)
                  if (removedMemberId) {
                    // Optimistically remove the member from the local state
                    setCampaignData(prev => ({
                      ...prev,
                      members: prev.members.filter(m => m.id !== removedMemberId)
                    }));
                  } else if (removedGangIds && removedGangIds.length > 0) {
                    // Optimistically remove gangs from the local state
                    setCampaignData(prev => ({
                      ...prev,
                      members: prev.members.map(member => ({
                        ...member,
                        gangs: member.gangs.filter((gang: Member['gangs'][0]) => !removedGangIds.includes(gang.id))
                      })),
                      // Also update territories owned by the removed gangs (safe access)
                      territories: (prev.territories || []).map(territory => 
                        removedGangIds.includes(territory.gang_id || '')
                          ? { ...territory, gang_id: null, owning_gangs: [] }
                          : territory
                      )
                    }));
                  } else if (updatedMember) {
                    // Optimistically update a specific member by matching on unique member id
                    // (not user_id, as a user can have multiple member entries)
                    setCampaignData(prev => ({
                      ...prev,
                      members: prev.members.map(member => 
                        member.id && updatedMember.id && member.id === updatedMember.id 
                          ? updatedMember 
                          : member
                      )
                    }));
                  } else {
                    // For other updates, fetch fresh data
                    refreshData();
                  }
                }}
                isCampaignAdmin={!!safePermissions.isArbitrator || !!safePermissions.isAdmin}
                isCampaignOwner={!!safePermissions.isOwner || !!safePermissions.isAdmin}
                availableResources={campaignResources}
              />
            </div>
  
            {/* Campaign Territories Section */}
            <div className="mb-8">
              <h2 className="text-xl md:text-2xl font-bold mb-4">Territories</h2>
              <CampaignTerritoryList
                territories={campaignData.territories}
                campaignId={campaignData.id}
                members={campaignData.members}
                permissions={{
                  canManageTerritories: safePermissions.canManageTerritories,
                  canEditTerritories: safePermissions.canEditTerritories,
                  canDeleteTerritories: safePermissions.canDeleteTerritories,
                  canClaimTerritories: safePermissions.canClaimTerritories
                }}
                onTerritoryUpdate={handleTerritoryUpdate}
              />
            </div>

          </div>
          </>
        )}

          {/* Territories tab content */}
          {activeTab === 1 && (
            <div className="bg-card shadow-md rounded-lg p-4">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl md:text-2xl font-bold">Territories</h2>
                  {safePermissions.canManageTerritories && (
                    <Button
                      className="bg-neutral-900 hover:bg-gray-800 text-white"
                      onClick={handleAddTerritory}
                    >
                      Add
                    </Button>
                  )}
                </div>
                
                {/* Display existing territories */}
                <CampaignTerritoryList
                  territories={campaignData.territories}
                  campaignId={campaignData.id}
                  members={campaignData.members}
                  permissions={{
                    canManageTerritories: safePermissions.canManageTerritories,
                    canEditTerritories: safePermissions.canEditTerritories,
                    canDeleteTerritories: safePermissions.canDeleteTerritories,
                    canClaimTerritories: safePermissions.canClaimTerritories
                  }}
                  onTerritoryUpdate={(update) => {
                    if (!update) {
                      refreshData();
                      return;
                    }

                    if (update.action === 'assign') {
                      // Optimistically assign gang to territory
                      setCampaignData(prev => ({
                        ...prev,
                        territories: (prev.territories || []).map(territory => 
                          territory.id === update.territoryId
                            ? { ...territory, gang_id: update.gangId ?? null, owning_gangs: update.gangData ? [update.gangData] : [] }
                            : territory
                        )
                      }));
                    } else if (update.action === 'remove') {
                      // Optimistically remove gang from territory
                      setCampaignData(prev => ({
                        ...prev,
                        territories: (prev.territories || []).map(territory => 
                          territory.id === update.territoryId
                            ? { ...territory, gang_id: null, owning_gangs: [] }
                            : territory
                        )
                      }));
                    } else if (update.action === 'update') {
                      // Optimistically update territory status
                      setCampaignData(prev => ({
                        ...prev,
                        territories: (prev.territories || []).map(territory => 
                          territory.id === update.territoryId
                            ? { ...territory, ...update.updates }
                            : territory
                        )
                      }));
                    } else if (update.action === 'delete') {
                      // Optimistically delete territory
                      setCampaignData(prev => ({
                        ...prev,
                        territories: (prev.territories || []).filter(t => t.id !== update.territoryId)
                      }));
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Battle Log tab content */}
          {activeTab === 2 && (
            <div className="bg-card shadow-md rounded-lg p-4">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl md:text-2xl font-bold">Battle Log</h2>
                  {safePermissions.canAddBattleLogs && (
                    <Button
                      className="bg-neutral-900 hover:bg-gray-800 text-white"
                      onClick={handleAddBattleLog}
                    >
                      Add
                    </Button>
                  )}
                </div>
                <div id="campaign-battle-logs">
                  <CampaignBattleLogsList
                    ref={battleLogsRef}
                    campaignId={campaignData.id}
                    battles={campaignData.battles || []}
                    isAdmin={!!safePermissions.canEditBattleLogs}
                    onBattleAdd={refreshData}
                    members={campaignData.members}
                    territories={campaignData.territories}
                    noContainer={true}
                    hideAddButton={true}
                    userId={userId || ''}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes tab content */}
          {activeTab === 3 && (
            <div className="bg-card shadow-md rounded-lg p-4">
              <div>
              <CampaignNotes
                campaignId={campaignData.id}
                initialNote={campaignData.note || ''}
                onNoteUpdate={refreshData}
              />
              </div>
            </div>
          )}

          {/* Triumphs tab content */}
          {activeTab === 4 && (
            <div className="bg-card shadow-md rounded-lg p-4">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl md:text-2xl font-bold">Triumphs</h2>
                </div>
                <CampaignTriumphs triumphs={campaignData.triumphs || []} />
              </div>
            </div>
          )}


        {/* Replace the inline modal with our new component */}
        <CampaignEditModal
          isOpen={showEditModal}
          campaignData={{
            id: campaignData.id,
            campaign_name: campaignData.campaign_name,
            description: campaignData.description,
            trading_posts: campaignData.trading_posts || [],
            status: campaignData.status,
            campaign_type_name: campaignData.campaign_type_name,
            campaign_type_id: campaignData.campaign_type_id
          }}
          tradingPostTypes={tradingPostTypes || []}
          onClose={() => setShowEditModal(false)}
          isArbitrator={!!safePermissions.isArbitrator}
          isAdmin={isAdmin}
          onSave={handleSave}
          isOwner={!!safePermissions.isOwner || !!safePermissions.isAdmin}
          campaignAllegiances={campaignAllegiances}
          predefinedAllegiances={campaignAllegiances.filter(a => !a.is_custom)}
          onAllegiancesChange={() => {
            // Cache invalidation is handled by the mutation in campaign-allegiances-actions
            // This callback is kept for potential future use
          }}
          onMembersUpdate={(allegianceId) => {
            // Optimistically clear allegiance from all gangs that have it
            setCampaignData(prev => ({
              ...prev,
              members: prev.members.map(member => ({
                ...member,
                gangs: member.gangs.map((gang: Member['gangs'][0]) => ({
                  ...gang,
                  allegiance: gang.allegiance?.id === allegianceId ? null : gang.allegiance
                }))
              }))
            }))
          }}
          onAllegianceRenamed={(allegianceId, newName) => {
            // Optimistically update allegiance name for all gangs that have it
            setCampaignData(prev => ({
              ...prev,
              members: prev.members.map(member => ({
                ...member,
                gangs: member.gangs.map((gang: Member['gangs'][0]) => ({
                  ...gang,
                  allegiance: gang.allegiance?.id === allegianceId 
                    ? {
                        ...gang.allegiance,
                        name: newName
                      }
                    : gang.allegiance
                }))
              }))
            }))
          }}
          campaignResources={campaignResources}
          predefinedResources={campaignResources.filter(r => !r.is_custom)}
          onResourcesChange={() => {
            // Cache invalidation is handled by the mutation in campaign-resources-actions
            // This callback is kept for potential future use
          }}
        />

        <CampaignImageEditModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          currentImageUrl={campaignData.image_url || ''}
          campaignId={campaignData.id}
          onImageUpdate={(newUrl) => setCampaignData(prev => ({ ...prev, image_url: newUrl }))}
          defaultImageUrl={campaignData.campaign_type_image_url}
        />

        <CampaignAddTerritoryModal
          isOpen={showTerritoryModal}
          onClose={() => setShowTerritoryModal(false)}
          campaignId={campaignData.id}
          campaignTypeId={campaignData.campaign_type_id}
          campaignTypes={campaignTypes}
          allTerritories={allTerritories}
          existingCampaignTerritories={campaignData.territories.map(territory => ({
            territory_id: territory.territory_id,
            territory_name: territory.territory_name
          }))}
          onTerritoryAdd={refreshData}
          isAdmin={!!safePermissions.canManageTerritories}
        />

      </div>

      {/* View Campaign Data Modal */}
      {showExportModal && (
        <Modal
          title="View Campaign Data"
          content={
            <div className="space-y-4">
              <p>Choose the format to view your campaign data:</p>
              <div className="flex flex-row gap-2">
                <Button
                  onClick={() => handleExportCampaign('json')}
                  variant="outline"
                  className="flex-1"
                >
                  JSON
                </Button>
                <Button
                  onClick={() => handleExportCampaign('xml')}
                  variant="outline"
                  className="flex-1"
                >
                  XML
                </Button>
              </div>
            </div>
          }
          onClose={() => setShowExportModal(false)}
        />
      )}
    </main>
  );
} 