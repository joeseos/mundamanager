"use client"

import React, { useState, useEffect, useRef } from 'react';
import Campaign from "@/components/campaign";
import TerritoryGangModal from "@/components/territory-gang-modal";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";
import MemberSearchBar from "@/components/member-search-bar"
import MembersTable from "@/components/members-table"

interface Gang {
  id: string;
  name: string;
  gang_type: string;
}

interface GangResponse {
  id: string;
  name: string;
  gang_type: string;
  user: {
    username: string;
  } | null;
}

type GangWithUser = {
  id: string;
  name: string;
  gang_type: string;
  user: { username: string; } | undefined;
};

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
    scenario_name: string;
    attacker?: {
      gang_name: string;
    };
    defender?: {
      gang_name: string;
    };
    winner?: {
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
      scenario_name: string;
      attacker?: {
        gang_name: string;
      };
      defender?: {
        gang_name: string;
      };
      winner?: {
        gang_name: string;
      };
    }[];
  };
}

interface Scenario {
  id: string;
  scenario_name: string;
}

interface CampaignGang {
  id: string;
  name: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

export default function CampaignPageContent({ campaignData: initialCampaignData }: CampaignPageContentProps) {
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER'>('MEMBER');
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showGangModal, setShowGangModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<{ id: string, name: string } | null>(null);
  const [showBattleModal, setShowBattleModal] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [selectedAttacker, setSelectedAttacker] = useState('');
  const [selectedDefender, setSelectedDefender] = useState('');
  const [selectedWinner, setSelectedWinner] = useState('');
  const [isLoadingBattleData, setIsLoadingBattleData] = useState(false);
  const isLoadingRef = useRef(false);

  // Fetch user data once and determine role
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Find user's role from campaign members
          const memberData = campaignData.members.find(m => m.user_id === user.id);
          if (memberData) {
            setUserRole(memberData.role);
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };
    getCurrentUser();
  }, [campaignData.members]);

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

  const loadBattleData = async () => {
    setIsLoadingBattleData(true);
    try {
      // Use existing data for gangs
      const campaignGangs = campaignData.members.reduce<CampaignGang[]>((acc, member) => {
        member.gangs.forEach((gang: Member['gangs'][0]) => {
          acc.push({
            id: gang.gang_id,
            name: gang.gang_name
          });
        });
        return acc;
      }, []);
      
      // Only fetch scenarios if needed
      const response = await fetch('/api/campaigns/battles', {
        headers: {
          'X-Campaign-Id': campaignData.id
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch battle data');
      
      const data = await response.json();
      setScenarios(data.scenarios);
      setAvailableGangs(campaignGangs); // Use local data instead
    } catch (error) {
      console.error('Error loading battle data:', error);
      toast({
        variant: "destructive",
        description: "Failed to load battle data"
      });
    } finally {
      setIsLoadingBattleData(false);
    }
  };

  useEffect(() => {
    if (showBattleModal) {
      loadBattleData();
    }
  }, [showBattleModal]);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <Campaign 
          {...transformedData} 
          onRoleChange={setUserRole}
          onUpdate={handleCampaignUpdate}
        />
        
        {/* Campaign Members Section */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h2 className="text-2xl font-bold mb-4">Campaign Members</h2>
          {isAdmin && (
            <MemberSearchBar
              campaignId={campaignData.id}
              campaignMembers={campaignData.members}  // Use existing data
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
            members={campaignData.members}  // Use existing data
            onMemberUpdate={refreshData}
          />
        </div>

        {/* Campaign Territories Section */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h2 className="text-2xl font-bold mb-4">Campaign Territories</h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="w-1/2 px-4 py-2 text-left font-medium whitespace-nowrap">Territory</th>
                  <th className="w-1/2 px-4 py-2 text-left font-medium pl-24 whitespace-nowrap">Controlled by</th>
                  {isAdmin && (
                    <th className="w-1/5 px-4 py-2 text-right font-medium whitespace-nowrap"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {campaignData.territories.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 3 : 2} className="px-4 py-2 text-center text-gray-500">
                      No territories in this campaign
                    </td>
                  </tr>
                ) : (
                  [...campaignData.territories]
                    .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                    .map((territory) => (
                    <tr key={territory.id} className="border-b last:border-0">
                      <td className="w-1/2 px-4 py-2 min-w-[200px]">
                        <span className="font-medium">{territory.territory_name}</span>
                      </td>
                      <td className="w-1/2 px-4 py-2 pl-24 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {territory.owning_gangs?.map(gang => (
                            <div 
                              key={gang.id}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              <span>{gang.name}</span>
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

        {/* Update the Battle Logs section */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Battle Logs</h2>
            {isAdmin && (
              <Button
                onClick={() => setShowBattleModal(true)}
                className="bg-black hover:bg-gray-800 text-white"
              >
                Add
              </Button>
            )}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Scenario</th>
                  <th className="px-4 py-2 text-left font-medium">Attacker</th>
                  <th className="px-4 py-2 text-left font-medium">Defender</th>
                  <th className="px-4 py-2 text-left font-medium">Winner</th>
                </tr>
              </thead>
              <tbody>
                {campaignData.battles?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-center text-gray-500">
                      No battles recorded yet
                    </td>
                  </tr>
                ) : (
                  campaignData.battles?.map((battle) => (
                    <tr key={battle.id} className="border-b">
                      <td className="px-4 py-2">
                        {formatDate(battle.created_at)}
                      </td>
                      <td className="px-4 py-2">{battle.scenario_name || 'N/A'}</td>
                      <td className="px-4 py-2">{battle.attacker?.gang_name || 'Unknown'}</td>
                      <td className="px-4 py-2">{battle.defender?.gang_name || 'Unknown'}</td>
                      <td className="px-4 py-2">{battle.winner?.gang_name || 'Unknown'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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

        {/* Add the new Battle Log Modal */}
        {showBattleModal && (
          <Modal
            title="Add Battle Log"
            content={
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Scenario
                  </label>
                  <select 
                    className="w-full px-3 py-2 rounded-md border border-gray-300"
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    disabled={isLoadingBattleData}
                  >
                    <option value="">Select scenario</option>
                    {scenarios.map(scenario => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.scenario_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attacker
                  </label>
                  <select 
                    className="w-full px-3 py-2 rounded-md border border-gray-300"
                    value={selectedAttacker}
                    onChange={(e) => setSelectedAttacker(e.target.value)}
                    disabled={isLoadingBattleData}
                  >
                    <option value="">Select gang</option>
                    {availableGangs.map(gang => (
                      <option key={gang.id} value={gang.id}>
                        {gang.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Defender
                  </label>
                  <select 
                    className="w-full px-3 py-2 rounded-md border border-gray-300"
                    value={selectedDefender}
                    onChange={(e) => setSelectedDefender(e.target.value)}
                    disabled={isLoadingBattleData}
                  >
                    <option value="">Select gang</option>
                    {availableGangs.map(gang => (
                      <option key={gang.id} value={gang.id}>
                        {gang.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Winner
                  </label>
                  <select 
                    className="w-full px-3 py-2 rounded-md border border-gray-300"
                    value={selectedWinner}
                    onChange={(e) => setSelectedWinner(e.target.value)}
                    disabled={isLoadingBattleData}
                  >
                    <option value="">Select gang</option>
                    {availableGangs.map(gang => (
                      <option key={gang.id} value={gang.id}>
                        {gang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            }
            onClose={() => {
              setShowBattleModal(false);
              setSelectedScenario('');
              setSelectedAttacker('');
              setSelectedDefender('');
              setSelectedWinner('');
            }}
            onConfirm={async () => {
              if (!selectedScenario || !selectedAttacker || !selectedDefender || !selectedWinner) {
                toast({
                  variant: "destructive",
                  description: "Please fill in all fields"
                });
                return false;
              }

              try {
                const response = await fetch('/api/campaigns/battles', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Campaign-Id': campaignData.id
                  },
                  body: JSON.stringify({
                    scenario_id: selectedScenario,
                    attacker_id: selectedAttacker,
                    defender_id: selectedDefender,
                    winner_id: selectedWinner
                  }),
                });

                if (!response.ok) throw new Error('Failed to create battle log');

                await refreshData();
                toast({
                  description: "Battle log added successfully"
                });
                setShowBattleModal(false);  // Close modal after success
                return false;  // Don't indicate pending async response
              } catch (error) {
                console.error('Error creating battle log:', error);
                toast({
                  variant: "destructive",
                  description: "Failed to create battle log"
                });
                return false;
              }
            }}
            confirmText="Save"
          />
        )}
      </div>
    </main>
  );
} 