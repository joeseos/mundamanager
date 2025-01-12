"use client"

import React, { useState, useEffect } from 'react';
import Campaign from "@/components/campaign";
import MemberSearch from "@/components/campaign-member-search";
import TerritoryGangModal from "@/components/territory-gang-modal";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { X } from "lucide-react";

interface Gang {
  id: string;
  name: string;
  gang_type: string;
}

interface Territory {
  id: string;
  territory_id: string;
  territory_name: string;
  owner: { [key: string]: any } | null;
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
      // Get current owner object
      const { data: currentTerritory, error: fetchError } = await supabase
        .from('campaign_territories')
        .select('owner')
        .eq('id', selectedTerritory.id)
        .single();

      if (fetchError) throw fetchError;

      // Create or update owner object
      const currentOwner = currentTerritory?.owner || {};
      const updatedOwner = {
        ...currentOwner,
        [gangId]: {
          assigned_at: new Date().toISOString()
        }
      };

      // Update territory
      const { error } = await supabase
        .from('campaign_territories')
        .update({
          owner: updatedOwner
        })
        .eq('id', selectedTerritory.id);

      if (error) throw error;

      // Get the gang details
      const { data: gangData, error: gangError } = await supabase
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
                owner: updatedOwner,
                owning_gangs: [
                  ...(t.owning_gangs || []),
                  gangData
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
      // Get current owner object
      const { data: currentTerritory, error: fetchError } = await supabase
        .from('campaign_territories')
        .select('owner')
        .eq('id', territoryId)
        .single();

      if (fetchError) throw fetchError;

      // Remove the gang from owner object
      const currentOwner = currentTerritory?.owner || {};
      const { [gangId]: removedGang, ...updatedOwner } = currentOwner;

      // Update territory
      const { error } = await supabase
        .from('campaign_territories')
        .update({
          owner: updatedOwner
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
                owner: updatedOwner,
                owning_gangs: t.owning_gangs?.filter(g => g.id !== gangId) || []
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

  // Load gang details for territories
  useEffect(() => {
    const loadGangDetails = async () => {
      // Skip if all territories already have their gang details loaded
      const needsGangDetails = campaignData.territories.some(t => 
        t.owner && 
        Object.keys(t.owner).length > 0 && 
        (!t.owning_gangs || t.owning_gangs.length !== Object.keys(t.owner).length)
      );

      if (!needsGangDetails) return;

      const territoriesWithOwners = campaignData.territories.filter(t => 
        t.owner && typeof t.owner === 'object' && Object.keys(t.owner).length > 0
      );
      
      if (territoriesWithOwners.length === 0) return;

      const gangIds = territoriesWithOwners
        .flatMap(t => Object.keys(t.owner || {}))
        .filter(id => 
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );

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
      const updatedTerritories: Territory[] = campaignData.territories.map(territory => ({
        ...territory,
        owning_gangs: territory.owner 
          ? Object.keys(territory.owner)
              .map(gangId => gangs?.find(g => g.id === gangId))
              .filter((g): g is Gang => g !== undefined)
          : []
      }));

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
        <Campaign {...transformedData} onRoleChange={setUserRole} />
        
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
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="w-1/3 px-4 py-2 text-left font-medium">Territory</th>
                  <th className="w-2/3 px-4 py-2 text-left font-medium">Owned by</th>
                </tr>
              </thead>
              <tbody>
                {campaignData.territories.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-center text-gray-500">
                      No territories in this campaign
                    </td>
                  </tr>
                ) : (
                  campaignData.territories.map((territory) => (
                    <tr key={territory.id} className="border-b last:border-0">
                      <td className="w-1/3 px-4 py-2">
                        <span className="font-medium">{territory.territory_name}</span>
                      </td>
                      <td className="w-2/3 px-4 py-2">
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
                          {isAdmin && (
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
          existingGangIds={Object.keys(selectedTerritory.owner || {})}
        />
      )}
    </main>
  );
} 