"use client"

import React, { useState, useEffect, useRef, Fragment } from 'react';
import TerritoryGangModal from "@/components/campaign/campaign-territory-gang-modal";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import MemberSearchBar from "@/components/campaign/campaign-member-search-bar"
import MembersTable from "@/components/campaign/campaign-members-table"
import Link from "next/link";
import CampaignBattleLogsList from "@/components/campaign/campaign-battle-logs-list";
import { FiMap } from "react-icons/fi";
import { FaCity } from "react-icons/fa";
import { MdFactory } from "react-icons/md";
import { LuSwords, LuClipboard } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/app/lib/utils";
import { RxDashboard, RxLayers } from "react-icons/rx";
import { MdPlace } from "react-icons/md";
import TerritoryList from "@/components/campaign/campaign-territory-list";
import { CampaignBattleLogsListRef } from "@/components/campaign/campaign-battle-logs-list";
import CampaignEditModal from "@/components/campaign/campaign-edit-modal";
import type { CampaignPermissions } from '@/types/user-permissions';

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
  owning_gangs?: Gang[];
  owner?: {
    [key: string]: {
      assigned_at: string;
    };
  } | null;
}

interface CampaignData {
  id: string;
  campaign_name: string;
  campaign_type_name: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
  territories: Territory[];
  members: Member[];
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
  // ... any other fields
}

interface CampaignPageContentProps {
  campaignData: {
    id: string;
    campaign_name: string;
    campaign_type_id: string;
    campaign_type_name: string;
    status: string | null;
    description: string | null;
    created_at: string;
    updated_at: string | null;
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
  };
  userId?: string;
  permissions: CampaignPermissions | null;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CampaignPageContent({ campaignData: initialCampaignData, userId, permissions }: CampaignPageContentProps) {
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showGangModal, setShowGangModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<{ id: string, name: string } | null>(null);
  const { toast } = useToast();
  const supabase = createClient();
  const isLoadingRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);
  const battleLogsRef = useRef<CampaignBattleLogsListRef>(null);
  const router = useRouter();

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

  // Use existing gang data instead of re-fetching
  const getGangDetails = (gangId: string) => {
    // Look through members' gangs to find the gang details
    for (const member of campaignData.members) {
      const gang = member.gangs.find((g: Member['gangs'][0]) => g.gang_id === gangId);
      if (gang) {
        return {
          id: gang.gang_id,
          name: gang.gang_name,
          gang_type: gang.gang_type || 'Unknown',
          gang_colour: gang.gang_colour || '#000000'
        };
      }
    }
    return null;
  };

  // Transform the data once and pass it down
  const transformedData = React.useMemo(() => ({
    id: campaignData.id,
    campaign_name: campaignData.campaign_name,
    campaign_type: campaignData.campaign_type_name,
    campaign_type_id: campaignData.campaign_type_id,
    created_at: campaignData.created_at,
    updated_at: campaignData.updated_at,
    has_meat: campaignData.has_meat,
    has_exploration_points: campaignData.has_exploration_points,
    has_scavenging_rolls: campaignData.has_scavenging_rolls,
    members: campaignData.members,  // Pass complete member data
    territories: campaignData.territories,  // Pass complete territory data
    battles: campaignData.battles  // Pass complete battle data
  }), [campaignData]);

  const handleAssignGang = async (gangId: string) => {
    if (!selectedTerritory) return false;

    try {
      // Check if user is authenticated
      if (!isAuthenticated) {
        toast({
          variant: "destructive",
          description: "You must be logged in to assign gangs to territories"
        });
        return false;
      }

      const { error } = await supabase
        .from('campaign_territories')
        .update({
          gang_id: gangId
        })
        .eq('id', selectedTerritory.id);

      if (error) throw error;

      // Use existing gang data instead of fetching
      const gangDetails = getGangDetails(gangId);
      if (!gangDetails) throw new Error('Gang not found');

      // Update local state
      setCampaignData(prev => {
        const updated = {
          ...prev,
          territories: prev.territories.map(t => 
            t.id === selectedTerritory.id
              ? {
                  ...t,
                  gang_id: gangId,
                  owning_gangs: [
                    { 
                      id: gangDetails.id, 
                      name: gangDetails.name,
                      gang_type: 'Unknown', // Or get from somewhere if needed
                      gang_colour: gangDetails.gang_colour
                    }
                  ]
                }
              : t
          )
        };
        return updated;
      });

      toast({
        description: "Gang assigned to territory successfully"
      });
    } catch (error) {
      console.error('Error assigning gang:', error);
      toast({
        variant: "destructive",
        description: "Failed to assign gang to territory"
      });
    } finally {
      setShowGangModal(false);
      setSelectedTerritory(null);
    }
    return false;
  };

  const handleRemoveGang = async (territoryId: string, gangId: string) => {
    try {
      // Check if user is authenticated
      if (!isAuthenticated) {
        toast({
          variant: "destructive",
          description: "You must be logged in to remove gangs from territories"
        });
        return;
      }

      // Update territory
      const { error } = await supabase
        .from('campaign_territories')
        .update({
          gang_id: null
        })
        .eq('id', territoryId);

      if (error) throw error;

      // Update local state
      setCampaignData(prev => ({
        ...prev,
        territories: prev.territories.map(t => 
          t.id === territoryId
            ? {
                ...t,
                gang_id: null,
                owning_gangs: []
              }
            : t
        )
      }));

      toast({
        description: "Gang removed from territory"
      });
    } catch (error) {
      console.error('Error removing gang:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove gang from territory"
      });
    }
  };

  const handleDeleteClick = (territoryId: string, territoryName: string) => {
    setTerritoryToDelete({ id: territoryId, name: territoryName });
    setShowDeleteModal(true);
  };

  const handleRemoveTerritory = async (territoryId: string) => {
    try {
      // Check if user is authenticated
      if (!isAuthenticated) {
        toast({
          variant: "destructive",
          description: "You must be logged in to remove territories"
        });
        return;
      }
      
      const { error } = await supabase
        .from('campaign_territories')
        .delete()
        .eq('id', territoryId);

      if (error) throw error;

      // Update local state
      setCampaignData(prev => ({
        ...prev,
        territories: prev.territories.filter(t => t.id !== territoryId)
      }));

      toast({
        description: "Territory removed successfully"
      });
    } catch (error) {
      console.error('Error removing territory:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove territory"
      });
    }
  };

  // Load gang details for territories
  useEffect(() => {
    const loadGangDetails = async () => {
      // Prevent multiple simultaneous requests
      if (isLoadingRef.current) return;
      
      // Skip if all territories already have their gang details loaded
      const needsGangDetails = campaignData.territories.some(t => 
        (t.gang_id || (t.owner && Object.keys(t.owner).length > 0)) && 
        (!t.owning_gangs || t.owning_gangs.length === 0)
      );

      if (!needsGangDetails) return;

      try {
        isLoadingRef.current = true;
        
        const territoriesWithGangs = campaignData.territories.filter(t => 
          t.gang_id || (t.owner && Object.keys(t.owner).length > 0)
        );
        
        const gangIds = Array.from(new Set(
          territoriesWithGangs.flatMap(t => {
            const ids: string[] = [];
            if (t.gang_id) ids.push(t.gang_id);
            if (t.owner) ids.push(...Object.keys(t.owner));
            return ids;
          })
        ));

        if (gangIds.length === 0) return;

        const { data: gangs, error } = await supabase
          .from('gangs')
          .select('id, name, gang_type, gang_colour')
          .in('id', gangIds);

        if (error) throw error;

        // Update territories with gang details
        const updatedTerritories = campaignData.territories.map(territory => {
          const effectiveGangId = territory.gang_id || 
            (territory.owner ? Object.keys(territory.owner)[0] : null);
          
          const gang = effectiveGangId ? gangs?.find(g => g.id === effectiveGangId) : null;
          const territoryGangs = gang ? [{
            id: gang.id,
            name: gang.name,
            gang_type: gang.gang_type,
            gang_colour: gang.gang_colour
          }] : [];

          return {
            ...territory,
            owning_gangs: territoryGangs
          };
        });

        setCampaignData(prev => ({
          ...prev,
          territories: updatedTerritories
        }));
      } catch (error) {
        console.error('Error loading gang details:', error);
      } finally {
        isLoadingRef.current = false;
      }
    };

    loadGangDetails();
  }, [campaignData.territories]); // Run when territories change

  // Helper for checking if user is admin (owner or arbitrator)
  const isAdmin = safePermissions.isOwner || safePermissions.isArbitrator;

  const handleCampaignUpdate = (updatedData: {
    campaign_name: string;
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
    updated_at: string;
  }) => {
    setCampaignData(prev => ({
      ...prev,
      ...updatedData
    }));
  };

  const refreshData = async () => {
    try {
      const response = await fetch(
        'https://iojoritxhpijprgkjfre.supabase.co/rest/v1/rpc/get_campaign_details',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            "campaign_id": campaignData.id
          })
        }
      );

      if (!response.ok) throw new Error('Failed to fetch campaign data');
      
      const [updatedData] = await response.json();
      if (!updatedData) throw new Error('No campaign data received');
      
      setCampaignData(updatedData);
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
    has_meat: boolean;
    has_exploration_points: boolean;
    has_scavenging_rolls: boolean;
  }) => {
    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('campaigns')
        .update({
          campaign_name: formValues.campaign_name,
          has_meat: formValues.has_meat,
          has_exploration_points: formValues.has_exploration_points,
          has_scavenging_rolls: formValues.has_scavenging_rolls,
          updated_at: now,
        })
        .eq('id', campaignData.id);

      if (error) throw error;
      
      // Update local state
      setCampaignData(prev => ({
        ...prev,
        campaign_name: formValues.campaign_name,
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
        </div>
        
        {/* Single white box container for all content */}
        <div className="bg-white shadow-md rounded-lg p-4">
          {/* Tab-specific content */}
          
          {/* Campaign tab content */}
          {activeTab === 0 && (
            <>
              {/* Campaign header with Edit button */}
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
                    style={{ height: '65px', width: '60svw', maxWidth: '80%' }}
                  >
                    <div className="flex flex-col items-baseline">
                      <div className="text-xl sm:leading-7 sm:text-2xl font-semibold text-white print:text-black mr-2">
                        {campaignData.campaign_name}
                      </div>
                      <div className="text-gray-300 text-xs sm:leading-5 sm:text-base overflow-hidden whitespace-nowrap print:text-gray-500">
                        {campaignData.campaign_type_name}
                      </div>
                    </div>
                  </div>
                  {safePermissions.canEditCampaign && (
                    <Button
                      className="ml-auto bg-white hover:bg-gray-100 text-black mr-4 sm:mr-8"
                      onClick={() => setShowEditModal(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                <div className="mt-1 mb-4">
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
                    onMemberAdd={(member) => {
                      setCampaignData(prev => ({
                        ...prev,
                        members: [...prev.members, member]
                      }));
                      refreshData();
                    }}
                  />
                )}
                <MembersTable
                  campaignId={campaignData.id}
                  isAdmin={isAdmin}
                  members={campaignData.members}
                  userId={userId}
                  onMemberUpdate={() => {
                    refreshData();
                  }}
                  isCampaignAdmin={!!safePermissions.isArbitrator || !!safePermissions.isAdmin}
                  isCampaignOwner={!!safePermissions.isOwner || !!safePermissions.isAdmin}
                />
              </div>

              {/* Campaign Territories Section */}
              <div className="mb-8">
                <h2 className="text-xl md:text-2xl font-bold mb-4">Territories</h2>
                <div className="rounded-md border overflow-x-auto">
                  <table className="text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
                        <th className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap">Controlled by</th>
                        <th className="w-[100px] px-4 py-2 text-right font-medium whitespace-nowrap"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignData.territories.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-gray-500 italic text-center py-4">
                            No territories in this campaign
                          </td>
                        </tr>
                      ) : (
                        [...campaignData.territories]
                          .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                          .map((territory) => (
                          <tr key={territory.id} className="border-b last:border-0">
                            <td className="w-2/5 px-4 py-2">
                              <span className="font-medium">{territory.territory_name}</span>
                            </td>
                            <td className="w-3/5 px-4 py-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {territory.owning_gangs && territory.owning_gangs.length > 0 ? (
                                  territory.owning_gangs.map(gang => (
                                    <div 
                                      key={gang.id}
                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100"
                                      style={{ color: gang.gang_colour || '#000000' }}
                                    >
                                      <Link 
                                        href={`/gang/${gang.id}`} 
                                        className="hover:text-gray-600 transition-colors"
                                      >
                                        {gang.name}
                                      </Link>
                                      {safePermissions.canManageTerritories && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveGang(territory.id, gang.id);
                                          }}
                                          className="ml-1 text-gray-400 hover:text-gray-600"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  ))
                                ) : safePermissions.canManageTerritories && (
                                  <button
                                    onClick={() => {
                                      setSelectedTerritory(territory);
                                      setShowGangModal(true);
                                    }}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                                  >
                                    Add gang
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="w-[100px] px-4 py-2 text-right">
                              {safePermissions.canManageTerritories && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteClick(territory.id, territory.territory_name)}
                                  className="text-xs px-1.5 h-6"
                                >
                                  Delete
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Battle Log Section - visible to all users */}
              <div className="mb-8">
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
                <div id="campaign-battle-logs-overview">
                  <CampaignBattleLogsList
                    ref={battleLogsRef}
                    campaignId={campaignData.id}
                    battles={campaignData.battles || []}
                    isAdmin={!!safePermissions.canEditBattleLogs}
                    onBattleAdd={refreshData}
                    members={campaignData.members}
                    noContainer={true}
                    hideAddButton={true}
                  />
                </div>
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
                    onTerritoryAdd={(territory) => {
                      refreshData();
                    }}
                  />
                </div>
              )}
              
              {/* Display existing territories */}
              <div className="rounded-md border overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
                      <th className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap">Controlled by</th>
                      <th className="w-[100px] px-4 py-2 text-right font-medium whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignData.territories.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-gray-500 italic text-center py-4">
                          No territories in this campaign
                        </td>
                      </tr>
                    ) : (
                      [...campaignData.territories]
                        .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                        .map((territory) => (
                        <tr key={territory.id} className="border-b last:border-0">
                          <td className="w-2/5 px-4 py-2">
                            <span className="font-medium">{territory.territory_name}</span>
                          </td>
                          <td className="w-3/5 px-4 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {territory.owning_gangs && territory.owning_gangs.length > 0 ? (
                                territory.owning_gangs.map(gang => (
                                  <div
                                    key={gang.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100"
                                    style={{ color: gang.gang_colour || '#000000' }}
                                  >
                                    <Link 
                                      href={`/gang/${gang.id}`} 
                                      className="hover:text-gray-600 transition-colors"
                                    >
                                      {gang.name}
                                    </Link>
                                    {safePermissions.canManageTerritories && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveGang(territory.id, gang.id);
                                        }}
                                        className="ml-1 text-gray-400 hover:text-gray-600"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ))
                              ) : safePermissions.canManageTerritories && (
                                <button
                                  onClick={() => {
                                    setSelectedTerritory(territory);
                                    setShowGangModal(true);
                                  }}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                                >
                                  Add gang
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="w-[100px] px-4 py-2 text-right">
                            {safePermissions.canManageTerritories && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteClick(territory.id, territory.territory_name)}
                                className="text-xs px-1.5 h-6"
                              >
                                Delete
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
                  noContainer={true}
                  hideAddButton={true}
                />
              </div>
            </div>
          )}

          {/* Notes tab content */}
          {activeTab === 3 && (
            <div>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl md:text-2xl font-bold">Notes</h2>
              </div>
              <p className="text-gray-600">Notes content coming soon...</p>
            </div>
          )}
        </div>

        {showGangModal && selectedTerritory && (
          <TerritoryGangModal
            isOpen={showGangModal}
            onClose={() => {
              setShowGangModal(false);
              setSelectedTerritory(null);
            }}
            onConfirm={handleAssignGang}
            campaignId={campaignData.id}
            territoryName={selectedTerritory.territory_name}
            existingGangId={selectedTerritory.gang_id}
          />
        )}

        {showDeleteModal && territoryToDelete && (
          <Modal
            title="Delete Territory"
            content={`Are you sure you want to remove ${territoryToDelete.name}?`}
            onClose={() => {
              setShowDeleteModal(false);
              setTerritoryToDelete(null);
            }}
            onConfirm={async () => {
              try {
                await handleRemoveTerritory(territoryToDelete.id);
                setShowDeleteModal(false);
                setTerritoryToDelete(null);
                return false;  // Don't indicate pending async response
              } catch (error) {
                console.error('Error removing territory:', error);
                return false;
              }
            }}
            confirmText="Delete"
          />
        )}

        {/* Replace the inline modal with our new component */}
        <CampaignEditModal 
          isOpen={showEditModal}
          campaignData={{
            id: campaignData.id,
            campaign_name: campaignData.campaign_name,
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