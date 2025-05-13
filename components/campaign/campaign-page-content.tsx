"use client"

import React, { useState, useEffect, useRef } from 'react';
import Campaign from "@/components/campaign/campaign";
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

interface Gang {
  id: string;
  name: string;
  gang_type: string;
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
    status: string | null;
    rating?: number;
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
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CampaignPageContent({ campaignData: initialCampaignData, userId }: CampaignPageContentProps) {
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER'>('MEMBER');
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showGangModal, setShowGangModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<{ id: string, name: string } | null>(null);
  const { toast } = useToast();
  const supabase = createClient();
  const isLoadingRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);

  // Determine user role based on userId
  useEffect(() => {
    if (userId) {
      // Find user's role from campaign members
      const memberData = campaignData.members.find(m => m.user_id === userId);
      if (memberData) {
        setUserRole(memberData.role);
      }
    }
  }, [campaignData.members, userId]);

  // Helper for checking authentication
  const isAuthenticated = !!userId;

  // Use existing gang data instead of re-fetching
  const getGangDetails = (gangId: string) => {
    // Look through members' gangs to find the gang details
    for (const member of campaignData.members) {
      const gang = member.gangs.find((g: Member['gangs'][0]) => g.gang_id === gangId);
      if (gang) {
        return {
          id: gang.gang_id,
          name: gang.gang_name,
          // Add other needed fields
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
      setCampaignData(prev => ({
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
                    gang_type: 'Unknown' // Or get from somewhere if needed
                  }
                ]
              }
            : t
        )
      }));

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
          .select('id, name, gang_type')
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
            gang_type: gang.gang_type
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
  }, [campaignData.id]); // Only run when campaign ID changes, not on every territory update

  const isAdmin = userRole === 'OWNER' || userRole === 'ARBITRATOR';

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

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <Campaign 
          {...transformedData} 
          userId={userId}
          onRoleChange={setUserRole}
          onUpdate={(updatedData) => {
            handleCampaignUpdate(updatedData);
            refreshData();
          }}
          onTabChange={(tabIndex) => setActiveTab(tabIndex)}
        />
        
        {/* Only render Members section when on the Campaign tab (0) */}
        {activeTab === 0 && (
          <div className="bg-white shadow-md rounded-lg p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Campaign Members</h2>
            {isAdmin && (
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
              onMemberUpdate={refreshData}
            />
          </div>
        )}

        {/* Only render Territories section when on the Campaign tab (0) or Territories tab (1) */}
        {(activeTab === 0 || activeTab === 1) && (
          <div className="bg-white shadow-md rounded-lg p-4 md:p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Campaign Territories</h2>
            <div className="rounded-md border overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
                    <th className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap">Controlled by</th>
                    {isAdmin && (
                      <th className="w-1/5 px-4 py-2 text-right font-medium whitespace-nowrap"></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {campaignData.territories.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 3 : 2} className="text-gray-500 italic text-center">
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
                            {territory.owning_gangs?.map(gang => (
                              <div 
                                key={gang.id}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                              >
                                <Link 
                                  href={`/gang/${gang.id}`} 
                                  className="hover:text-gray-600 transition-colors"
                                >
                                  {gang.name}
                                </Link>
                                {isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveGang(territory.id, gang.id);
                                    }}
                                    className="ml-1 hover:text-gray-900 transition-colors"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {isAdmin && !territory.gang_id && (
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
                        {isAdmin && (
                          <td className="w-1/5 px-4 py-2 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteClick(territory.id, territory.territory_name)}
                              className="text-xs px-1.5 h-6"
                            >
                              Delete
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Battle Logs Section - show on both Campaign tab (0) and Battle Logs tab (2) */}
        {(activeTab === 0 || activeTab === 2) && (
          <CampaignBattleLogsList
            campaignId={campaignData.id}
            battles={campaignData.battles || []}
            isAdmin={isAdmin}
            onBattleAdd={refreshData}
            members={campaignData.members}
          />
        )}

        {/* Notes Section - only shown when on the Notes tab */}
        {activeTab === 3 && (
          <div className="bg-white shadow-md rounded-lg p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Notes</h2>
            <p className="text-gray-600">Notes content coming soon...</p>
          </div>
        )}

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
      </div>
    </main>
  );
} 