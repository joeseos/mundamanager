"use client"

import React, { useState, useRef, useTransition } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import MemberSearchBar from "@/components/campaigns/[id]/campaign-member-search-bar"
import MembersTable from "@/components/campaigns/[id]/campaign-members-table"
import CampaignBattleLogsList from "@/components/campaigns/[id]/campaign-battle-logs-list";
import { FiMap } from "react-icons/fi";
import { MdFactory } from "react-icons/md";
import { LuSwords, LuClipboard, LuTrophy } from "react-icons/lu";
import TerritoryList from "@/components/campaigns/[id]/campaign-add-territory-list";
import CampaignTerritoryList from "@/components/campaigns/[id]/campaign-territory-list";
import { CampaignBattleLogsListRef } from "@/components/campaigns/[id]/campaign-battle-logs-list";
import CampaignEditModal from "@/components/campaigns/[id]/campaign-edit-modal";
import CampaignTriumphs from "@/components/campaigns/[id]/campaign-triumphs";
import type { CampaignPermissions } from '@/types/user-permissions';
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
    id: string;
    gang_id: string;
    gang_name: string;
    gang_type: string;
    gang_colour: string;
    status: string | null;
    rating?: number;
    reputation?: number;
  }[];
}

interface Territory {
  id: string;
  territory_id: string;
  territory_name: string;
  gang_id: string | null;
  created_at: string;
  ruined?: boolean;
  default_gang_territory?: boolean;
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
  campaign_type_id: string;
}


interface CampaignPageContentProps {
  campaignData: {
    id: string;
    campaign_name: string;
    campaign_type_id: string;
    campaign_type_name: string;
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
    battles: {
      id: string;
      created_at: string;
      scenario_number: number;
      scenario_name: string;
      attacker?: {
        gang_id?: string;
        gang_name: string;
      };
      defender?: {
        gang_id?: string;
        gang_name: string;
      };
              winner?: {
          gang_id?: string;
          gang_name: string;
        };
      }[];
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
  allTerritories
}: CampaignPageContentProps) {
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [showEditModal, setShowEditModal] = useState(false);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(0);
  const battleLogsRef = useRef<CampaignBattleLogsListRef>(null);
  const [isPending, startTransition] = useTransition();

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

  const handleSave = async (formValues: {
    campaign_name: string;
    description: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
  }) => {
    try {
      const result = await updateCampaignSettings({
        campaignId: campaignData.id,
        campaign_name: formValues.campaign_name,
        description: formValues.description,
        has_meat: formValues.has_meat,
        has_exploration_points: formValues.has_exploration_points,
        has_scavenging_rolls: formValues.has_scavenging_rolls
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
        has_meat: formValues.has_meat,
        has_exploration_points: formValues.has_exploration_points,
        has_scavenging_rolls: formValues.has_scavenging_rolls,
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

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        {/* Tabs navigation */}
        <div className="bg-white rounded-lg mb-4 flex">
          <button
            onClick={() => setActiveTab(0)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 0
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
            } flex items-center justify-center`}
          >
            <FiMap className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">Campaign</span>
          </button>
          <button
            onClick={() => setActiveTab(1)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 1
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
            } flex items-center justify-center`}
          >
            <MdFactory className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">Territories</span>
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 2
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
            } flex items-center justify-center`}
          >
            <LuSwords className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">Battle Log</span>
          </button>
          <button
            onClick={() => setActiveTab(3)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 3
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
            } flex items-center justify-center`}
          >
            <LuClipboard className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">Notes</span>
          </button>
          <button
            onClick={() => setActiveTab(4)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === 4
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
            } flex items-center justify-center`}
          >
            <LuTrophy className="h-5 w-5" />
            <span className="ml-2 hidden sm:inline">Triumphs</span>
          </button>
        </div>
        
        {/* Single white box container for all content */}
        <div className="bg-white shadow-md rounded-lg p-4">
          {/* Tab-specific content */}
          
          {/* Campaign tab content */}
          {activeTab === 0 && (
            <>
              {/* Campaign header with the Edit button */}
              <div className="mb-4 border-b pb-4">
                <div
                  className="relative flex justify-between items-center py-4 bg-no-repeat bg-cover print:!bg-none -mx-4 px-4 rounded-lg"
                  style={{
                    backgroundImage:
                      "url('https://res.cloudinary.com/dle0tkpbl/image/upload/v1735986017/top-bar-stroke-v3_s97f2k.png')",
                    width: 'calc(100% + 2rem)',
                    height: '65px',
                    zIndex: 0,
                    backgroundPosition: 'center',
                    backgroundSize: '100% 100%',
                  }}
                >
                  <div
                    className="flex items-center gap-2 pl-2 sm:pl-4 overflow-hidden whitespace-nowrap"
                    style={{ height: '65px', width: '65svw', maxWidth: '90%' }}
                  >
                    <div className="flex flex-col items-baseline">
                      <div className="text-xl sm:leading-7 sm:text-2xl font-semibold text-white print:text-black">
                        {campaignData.campaign_name}
                      </div>
                      <div className="text-gray-300 text-xs sm:leading-5 sm:text-base overflow-hidden whitespace-nowrap print:text-gray-500">
                        {campaignData.campaign_type_name}
                      </div>
                    </div>
                  </div>
                  {safePermissions.canEditCampaign && (
                    <Button
                      className="bg-white text-black hover:bg-gray-100 sm:mr-2"
                      onClick={() => setShowEditModal(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                <div className="mt-1 mb-4 whitespace-pre-wrap break-words">
                  {campaignData.description}
                </div>

                {/* Move the date row here, outside the left column, to span full width */}
                <div className="flex flex-row items-center justify-between text-xs text-gray-500 w-full mt-1">
                  <div>
                    <span>Created: </span>
                    <span>{formatDate(campaignData.created_at)}</span>
                  </div>
                  <div>
                    <span>Last Updated: </span>
                    <span>{formatDate(campaignData.updated_at)}</span>
                  </div>
                </div>
              </div>
              {/* End campaign header and modal logic */}

              {/* Campaign Members Section */}
              <div className="mb-8">
                <h2 className="text-xl md:text-2xl font-bold mb-4">Gangs & Players</h2>
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
                  onMemberUpdate={({ removedMemberId, removedGangIds }) => {
                    startTransition(() => {
                      // For specific updates, we can do optimistic updates
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
                            gangs: member.gangs.filter((gang: Member['gangs'][0]) => !removedGangIds.includes(gang.gang_id))
                          }))
                        }));
                      } else {
                        // For other updates (like adding gangs), fetch fresh data
                        refreshData();
                      }
                    });
                  }}
                  isCampaignAdmin={!!safePermissions.isArbitrator || !!safePermissions.isAdmin}
                  isCampaignOwner={!!safePermissions.isOwner || !!safePermissions.isAdmin}
                  hasExplorationPoints={campaignData.has_exploration_points}
                  hasMeat={campaignData.has_meat}
                  hasScavengingRolls={campaignData.has_scavenging_rolls}
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
                    canManageTerritories: safePermissions.canManageTerritories
                  }}
                  onTerritoryUpdate={refreshData}
                />
              </div>


            </>
          )}

          {/* Territories tab content */}
          {activeTab === 1 && (
            <div>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl md:text-2xl font-bold">Territories</h2>
              </div>
              
              {/* Admin can add territories */}
              {safePermissions.canManageTerritories && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">Add Territories</h3>
                  <TerritoryList
                    isAdmin={!!safePermissions.canManageTerritories}
                    campaignId={campaignData.id}
                    campaignTypeId={campaignData.campaign_type_id}
                    campaignTypes={campaignTypes}
                    allTerritories={allTerritories}
                    existingCampaignTerritories={campaignData.territories.map(territory => ({
                      territory_id: territory.territory_id,
                      territory_name: territory.territory_name
                    }))}
                    onTerritoryAdd={() => {
                      refreshData();
                    }}
                  />
                </div>
              )}
              
              {/* Display existing territories */}
              <CampaignTerritoryList
                territories={campaignData.territories}
                campaignId={campaignData.id}
                members={campaignData.members}
                permissions={{
                  canManageTerritories: safePermissions.canManageTerritories
                }}
                onTerritoryUpdate={refreshData}
              />
            </div>
          )}

          {/* Battle Log tab content */}
          {activeTab === 2 && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl md:text-2xl font-bold">Battle Log</h2>
                {safePermissions.canAddBattleLogs && (
                  <Button
                    className="bg-black hover:bg-gray-800 text-white"
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
                />
              </div>
            </div>
          )}

          {/* Notes tab content */}
          {activeTab === 3 && (
            <div>
            <CampaignNotes
              campaignId={campaignData.id}
              initialNote={campaignData.note || ''}
              onNoteUpdate={refreshData}
            />
            </div>
          )}

          {/* Triumphs tab content */}
          {activeTab === 4 && (
            <div>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl md:text-2xl font-bold">Triumphs</h2>
              </div>
              <CampaignTriumphs triumphs={campaignData.triumphs || []} />
            </div>
          )}
        </div>


        {/* Replace the inline modal with our new component */}
        <CampaignEditModal 
          isOpen={showEditModal}
          campaignData={{
            id: campaignData.id,
            campaign_name: campaignData.campaign_name,
            description: campaignData.description,
            has_meat: campaignData.has_meat,
            has_exploration_points: campaignData.has_exploration_points,
            has_scavenging_rolls: campaignData.has_scavenging_rolls
          }}
          onClose={() => setShowEditModal(false)}
          onSave={handleSave}
          isOwner={!!safePermissions.isOwner || !!safePermissions.isAdmin}
        />

      </div>
    </main>
  );
} 