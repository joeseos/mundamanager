'use client'

import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Edit } from "lucide-react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { GiAncientRuins } from "react-icons/gi";
import { IoHome } from "react-icons/io5";
import { Tooltip } from "react-tooltip";
import Link from "next/link";
import Modal from "@/components/modal";
import TerritoryGangModal from "@/components/campaigns/[id]/campaign-territory-gang-modal";
import TerritoryEditModal from "@/components/campaigns/[id]/campaign-territory-edit-modal";
import { 
  assignGangToTerritory, 
  removeGangFromTerritory, 
  removeTerritoryFromCampaign,
  updateTerritoryStatus
} from "@/app/actions/campaigns/[id]/campaign-territories";

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
  gangs: {
    id: string;
    gang_id: string;
    gang_name: string;
    gang_type: string;
    gang_colour: string;
    status: string | null;
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

interface CampaignTerritoryListProps {
  territories: Territory[];
  campaignId: string;
  members: Member[];
  permissions: {
    canManageTerritories: boolean;
  };
  onTerritoryUpdate?: () => void;
}

export default function CampaignTerritoryList({
  territories,
  campaignId,
  members,
  permissions,
  onTerritoryUpdate
}: CampaignTerritoryListProps) {
  const { toast } = useToast();
  
  // State management
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showGangModal, setShowGangModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTerritoryEditModal, setShowTerritoryEditModal] = useState(false);
  const [territoryToEdit, setTerritoryToEdit] = useState<Territory | null>(null);
  const [territoryToDelete, setTerritoryToDelete] = useState<{ id: string, name: string } | null>(null);
  const [sortField, setSortField] = useState<'territory' | 'controllingGang'>('territory');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Helper function to get gang details from members data
  const getGangDetails = (gangId: string) => {
    // Look through members' gangs to find the gang details
    for (const member of members) {
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

  // Gang assignment
  const handleAssignGang = async (gangId: string) => {
    if (!selectedTerritory) return false;

    try {
      const result = await assignGangToTerritory({
        campaignId: campaignId,
        territoryId: selectedTerritory.id,
        gangId
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        description: "Gang assigned to territory successfully"
      });

      // Refresh parent data
      onTerritoryUpdate?.();
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

  // Gang removal
  const handleRemoveGang = async (territoryId: string, gangId: string) => {
    try {
      const result = await removeGangFromTerritory({
        campaignId: campaignId,
        territoryId
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        description: "Gang removed from territory"
      });

      // Refresh parent data
      onTerritoryUpdate?.();
    } catch (error) {
      console.error('Error removing gang:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove gang from territory"
      });
    }
  };

  // Territory editing
  const handleEditClick = (territory: Territory) => {
    setTerritoryToEdit(territory);
    setShowTerritoryEditModal(true);
  };

  const handleTerritoryUpdate = async (updates: { ruined: boolean; default_gang_territory: boolean }) => {
    if (!territoryToEdit) return false;

    try {
      const result = await updateTerritoryStatus({
        campaignId: campaignId,
        territoryId: territoryToEdit.id,
        ruined: updates.ruined,
        default_gang_territory: updates.default_gang_territory
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        description: "Territory updated successfully"
      });

      setShowTerritoryEditModal(false);
      setTerritoryToEdit(null);

      // Refresh parent data
      onTerritoryUpdate?.();
      return true;
    } catch (error) {
      console.error('Error updating territory:', error);
      toast({
        variant: "destructive",
        description: "Failed to update territory"
      });
      return false;
    }
  };

  // Handle column header click for sorting
  const handleSort = (field: 'territory' | 'controllingGang') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort indicator component
  const SortIndicator = ({ field }: { field: 'territory' | 'controllingGang' }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // Territory deletion
  const handleDeleteClick = (territoryId: string, territoryName: string) => {
    setTerritoryToDelete({ id: territoryId, name: territoryName });
    setShowDeleteModal(true);
  };

  const handleRemoveTerritory = async (territoryId: string) => {
    try {
      const result = await removeTerritoryFromCampaign({
        campaignId: campaignId,
        territoryId
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        description: "Territory removed successfully"
      });

      // Refresh parent data
      onTerritoryUpdate?.();
    } catch (error) {
      console.error('Error removing territory:', error);
      toast({
        variant: "destructive",
        description: "Failed to remove territory"
      });
    }
  };

  return (
    <>
      {/* Territory Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th 
                className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('territory')}
              >
                Territory
                <SortIndicator field="territory" />
              </th>
              <th 
                className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('controllingGang')}
              >
                Controlled by
                <SortIndicator field="controllingGang" />
              </th>
              <th className="w-[100px] px-4 py-2 text-right font-medium whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {territories.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-gray-500 italic text-center py-4">
                  No territories in this campaign
                </td>
              </tr>
            ) : (
              [...territories]
                .sort((a, b) => {
                  let aValue: string;
                  let bValue: string;

                  if (sortField === 'territory') {
                    aValue = a.territory_name;
                    bValue = b.territory_name;
                  } else {
                    // Sort by controlling gang name
                    const aGang = a.owning_gangs?.[0]?.name || 'ZZZ_Uncontrolled'; // ZZZ to sort uncontrolled last
                    const bGang = b.owning_gangs?.[0]?.name || 'ZZZ_Uncontrolled';
                    aValue = aGang;
                    bValue = bGang;
                  }

                  const comparison = aValue.localeCompare(bValue);
                  return sortDirection === 'asc' ? comparison : -comparison;
                })
                .map((territory) => (
                <tr key={territory.id} className="border-b last:border-0">
                  <td className="w-2/5 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{territory.territory_name}</span>
                      {territory.ruined && (
                        <GiAncientRuins 
                          className="h-4 w-4 text-gray-600" 
                          data-tooltip-id="ruined-tooltip"
                          data-tooltip-content="This territory has been ruined and now provides a different boon"
                        />
                      )}
                      {territory.default_gang_territory && (
                        <IoHome 
                          className="h-4 w-4 text-gray-600" 
                          data-tooltip-id="default-territory-tooltip"
                          data-tooltip-content="This is a default gang territory"
                        />
                      )}
                    </div>
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
                            {permissions.canManageTerritories && (
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
                      ) : permissions.canManageTerritories && !territory.ruined ? (
                        <button
                          onClick={() => {
                            setSelectedTerritory(territory);
                            setShowGangModal(true);
                          }}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          Add gang
                        </button>
                      ) : territory.ruined && !territory.owning_gangs?.length ? (
                        <span className="text-gray-500 italic text-xs">Ruined territory</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="w-[100px] px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {permissions.canManageTerritories && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(territory)}
                            className="h-8 w-8 p-0"
                            aria-label="Edit territory"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(territory.id, territory.territory_name)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            aria-label="Delete territory"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Territory Gang Modal */}
      {showGangModal && selectedTerritory && (
        <TerritoryGangModal
          isOpen={showGangModal}
          onClose={() => {
            setShowGangModal(false);
            setSelectedTerritory(null);
          }}
          onConfirm={handleAssignGang}
          campaignId={campaignId}
          territoryName={selectedTerritory.territory_name}
          existingGangId={selectedTerritory.gang_id}
        />
      )}

      {/* Delete Confirmation Modal */}
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
              return false;
            } catch (error) {
              console.error('Error removing territory:', error);
              return false;
            }
          }}
          confirmText="Delete"
        />
      )}

      {/* Territory Edit Modal */}
      {showTerritoryEditModal && territoryToEdit && (
        <TerritoryEditModal
          isOpen={showTerritoryEditModal}
          onClose={() => {
            setShowTerritoryEditModal(false);
            setTerritoryToEdit(null);
          }}
          onConfirm={handleTerritoryUpdate}
          territoryName={territoryToEdit.territory_name}
          currentRuined={territoryToEdit.ruined || false}
          currentDefaultGangTerritory={territoryToEdit.default_gang_territory || false}
        />
      )}

      {/* Tooltips */}
      <Tooltip 
        id="ruined-tooltip" 
        place="top" 
        style={{ backgroundColor: '#374151', color: 'white', maxWidth: '300px' }}
      />
      <Tooltip 
        id="default-territory-tooltip" 
        place="top" 
        style={{ backgroundColor: '#374151', color: 'white', maxWidth: '300px' }}
      />
    </>
  );
}