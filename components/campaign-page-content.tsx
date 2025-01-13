"use client"

import React, { useState, useEffect } from 'react';
import Campaign from "@/components/campaign";
import MemberSearch from "@/components/campaign-member-search";
import TerritoryGangModal from "@/components/territory-gang-modal";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/modal";

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

interface Territory {
  id: string;
  territory_id: string;
  territory_name: string;
  gang_id: string | null;
  created_at: string;
  owning_gangs?: Gang[];
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
  };
}

export default function CampaignPageContent({ campaignData: initialCampaignData }: CampaignPageContentProps) {
  const [userRole, setUserRole] = useState<'OWNER' | 'ARBITRATOR' | 'MEMBER'>('MEMBER');
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showGangModal, setShowGangModal] = useState(false);
  const [campaignData, setCampaignData] = useState(initialCampaignData);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<{ id: string, name: string } | null>(null);
  const { toast } = useToast();
  const supabase = createClient();

  const transformedData = React.useMemo(() => ({
    id: campaignData.id,
    campaign_name: campaignData.campaign_name,
    campaign_type: campaignData.campaign_type_name,
    created_at: campaignData.created_at,
    updated_at: campaignData.updated_at
  }), [campaignData]);

  const handleAssignGang = async (gangId: string) => {
    if (!selectedTerritory) return;

    try {
      const { error } = await supabase
        .from('campaign_territories')
        .update({
          gang_id: gangId
        })
        .eq('id', selectedTerritory.id);

      if (error) throw error;

      // Fetch gang details immediately
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('id, name, gang_type')
        .eq('id', gangId)
        .single();

      if (gangError) throw gangError;

      // Update local state
      setCampaignData(prev => ({
        ...prev,
        territories: prev.territories.map(t => 
          t.id === selectedTerritory.id
            ? {
                ...t,
                gang_id: gangId,
                owning_gangs: [
                  { id: gang.id, name: gang.name, gang_type: gang.gang_type }
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
      // Skip if all territories already have their gang details loaded
      const needsGangDetails = campaignData.territories.some(t => 
        t.gang_id && (!t.owning_gangs || t.owning_gangs.length === 0)
      );

      if (!needsGangDetails) return;

      const territoriesWithGangs = campaignData.territories.filter(t => t.gang_id);
     
      // Get all gang IDs and deduplicate them
      const gangIds = Array.from(new Set(
        territoriesWithGangs.map(t => t.gang_id).filter((id): id is string => id !== null)
      ));

      if (gangIds.length === 0) return;
      
      const { data: gangs, error } = await supabase
        .from('gangs')
        .select('id, name, gang_type')
        .in('id', gangIds);

      if (error) {
        console.error('Error loading gang details:', error);
        return;
      }

      // Update territories with gang details
      const updatedTerritories = campaignData.territories.map(territory => {
        const gang = territory.gang_id ? gangs?.find(g => g.id === territory.gang_id) : null;
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
    };

    loadGangDetails();
  }, [campaignData.territories]);

  const isAdmin = userRole === 'OWNER' || userRole === 'ARBITRATOR';

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <Campaign 
          {...transformedData} 
          campaign_type_id={campaignData.campaign_type_id}
          onRoleChange={setUserRole} 
        />
        
        {/* Campaign Members Section */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h2 className="text-2xl font-bold mb-4">Campaign Members</h2>
          <MemberSearch 
            campaignId={campaignData.id}
            isAdmin={userRole === 'OWNER' || userRole === 'ARBITRATOR'}
            initialMembers={campaignData.members}
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
            await handleRemoveTerritory(territoryToDelete.id);
            setShowDeleteModal(false);
            setTerritoryToDelete(null);
            return true;
          }}
          confirmText="Delete"
        />
      )}
    </main>
  );
} 