'use client'

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useToast } from "@/components/ui/use-toast";
import { LuSquarePen } from "react-icons/lu";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { GiAncientRuins } from "react-icons/gi";
import { IoHome } from "react-icons/io5";
import { Tooltip } from "react-tooltip";
import Modal from "@/components/ui/modal";
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
    campaign_gang_id: string;
    id: string;
    name: string;
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

interface CampaignTerritoryListProps {
  territories: Territory[];
  campaignId: string;
  members: Member[];
  permissions: {
    canManageTerritories: boolean;
    canEditTerritories: boolean;
    canDeleteTerritories: boolean;
    canClaimTerritories: boolean;
  };
  onTerritoryUpdate?: (update?: TerritoryUpdate) => void;
}

export default function CampaignTerritoryList({
  territories,
  campaignId,
  members,
  permissions,
  onTerritoryUpdate
}: CampaignTerritoryListProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Use programmatic navigation to avoid Link prefetching
  const handleGangClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, gangId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/gang/${gangId}`);
  }, [router]);

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
      const gang = member.gangs.find((g: Member['gangs'][0]) => g.id === gangId);
      if (gang) {
        return {
          id: gang.id,
          name: gang.name,
          gang_type: gang.gang_type || 'Unknown',
          gang_colour: gang.gang_colour || '#000000'
        };
      }
    }
    return null;
  };

  // TanStack Query mutation for assigning gang to territory
  const assignGangMutation = useMutation({
    mutationFn: async (variables: {
      territoryId: string;
      gangId: string;
      gangData: Gang;
      territoryName: string;
    }) => {
      const result = await assignGangToTerritory({
        campaignId,
        territoryId: variables.territoryId,
        gangId: variables.gangId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to assign gang to territory');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousTerritories = [...territories];
      
      // Optimistically update via parent callback
      onTerritoryUpdate?.({
        action: 'assign',
        territoryId: variables.territoryId,
        gangId: variables.gangId,
        gangData: variables.gangData
      });
      
      return { previousTerritories, territoryName: variables.territoryName, gangName: variables.gangData.name };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.gangName} assigned to ${context?.territoryName}`
      });
      
      // Close modal
      setShowGangModal(false);
      setSelectedTerritory(null);
    },
    onError: (error, variables, context) => {
      // Rollback by refreshing data from server
      onTerritoryUpdate?.();
      
      // Note: Modal stays open on error to allow user to retry with a different selection
      console.error('Error assigning gang:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to assign gang to territory"
      });
    }
  });

  // Gang assignment handler
  const handleAssignGang = async (gangId: string) => {
    if (!selectedTerritory) return false;
    
    // Get gang details
    const gangData = getGangDetails(gangId);
    if (!gangData) {
      toast({
        variant: "destructive",
        description: "Gang data not found"
      });
      return false;
    }

    // Pass gang data through variables to avoid stale closure
    assignGangMutation.mutate({
      territoryId: selectedTerritory.id,
      gangId,
      gangData,
      territoryName: selectedTerritory.territory_name
    });
    
    return true;
  };

  // TanStack Query mutation for removing gang from territory
  const removeGangMutation = useMutation({
    mutationFn: async (variables: {
      territoryId: string;
      territoryName: string;
    }) => {
      const result = await removeGangFromTerritory({
        campaignId,
        territoryId: variables.territoryId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove gang from territory');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousTerritories = [...territories];
      
      // Optimistically update via parent callback
      onTerritoryUpdate?.({
        action: 'remove',
        territoryId: variables.territoryId
      });
      
      return { previousTerritories, territoryName: variables.territoryName };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      toast({
        description: `Gang removed from ${context?.territoryName}`
      });
    },
    onError: (error, variables, context) => {
      // Rollback by refreshing data from server
      onTerritoryUpdate?.();
      
      console.error('Error removing gang:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to remove gang from territory"
      });
    }
  });

  // Gang removal handler
  const handleRemoveGang = async (territoryId: string) => {
    // Find territory name
    const territory = territories.find(t => t.id === territoryId);
    if (!territory) return;

    removeGangMutation.mutate({
      territoryId,
      territoryName: territory.territory_name
    });
  };

  // TanStack Query mutation for updating territory status
  const updateTerritoryMutation = useMutation({
    mutationFn: async (variables: {
      territoryId: string;
      ruined: boolean;
      default_gang_territory: boolean;
      territoryName: string;
    }) => {
      const result = await updateTerritoryStatus({
        campaignId,
        territoryId: variables.territoryId,
        ruined: variables.ruined,
        default_gang_territory: variables.default_gang_territory
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to update territory');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousTerritories = [...territories];
      
      // Optimistically update via parent callback
      onTerritoryUpdate?.({
        action: 'update',
        territoryId: variables.territoryId,
        updates: {
          ruined: variables.ruined,
          default_gang_territory: variables.default_gang_territory
        }
      });
      
      return { previousTerritories, territoryName: variables.territoryName };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.territoryName} updated successfully`
      });
      
      // Close modal
      setShowTerritoryEditModal(false);
      setTerritoryToEdit(null);
    },
    onError: (error, variables, context) => {
      // Rollback by refreshing data from server
      onTerritoryUpdate?.();
      
      console.error('Error updating territory:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update territory"
      });
    }
  });

  // Territory editing
  const handleEditClick = (territory: Territory) => {
    setTerritoryToEdit(territory);
    setShowTerritoryEditModal(true);
  };

  const handleTerritoryUpdate = async (updates: { ruined: boolean; default_gang_territory: boolean }) => {
    if (!territoryToEdit) return false;

    updateTerritoryMutation.mutate({
      territoryId: territoryToEdit.id,
      ruined: updates.ruined,
      default_gang_territory: updates.default_gang_territory,
      territoryName: territoryToEdit.territory_name
    });
    
    return true;
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

  // Helper function to group territories for display
  const groupTerritoriesForDisplay = (territories: Territory[]) => {
    const controlledTerritories: Territory[] = [];
    const uncontrolledTerritories: { [key: string]: { territory: Territory; count: number } } = {};

    territories.forEach(territory => {
      const hasGang = territory.owning_gangs && territory.owning_gangs.length > 0;
      
      if (hasGang) {
        controlledTerritories.push(territory);
      } else {
        // Group uncontrolled territories by name AND ruined status
        const key = `${territory.territory_name}|${territory.ruined ? 'ruined' : 'normal'}`;
        if (uncontrolledTerritories[key]) {
          uncontrolledTerritories[key].count++;
        } else {
          uncontrolledTerritories[key] = {
            territory: territory,
            count: 1
          };
        }
      }
    });

    return { controlledTerritories, uncontrolledTerritories };
  };

  // Helper function to create a unified sorted list for display
  const createSortedDisplayList = (territories: Territory[]) => {
    const { controlledTerritories, uncontrolledTerritories } = groupTerritoriesForDisplay(territories);
    
    // Create display items for controlled territories
    const controlledItems = controlledTerritories.map(territory => ({
      type: 'controlled' as const,
      territory,
      sortKey: sortField === 'territory' ? territory.territory_name : (territory.owning_gangs?.[0]?.name || 'ZZZ_Uncontrolled')
    }));

    // Create display items for uncontrolled territories (grouped)
    const uncontrolledItems = Object.entries(uncontrolledTerritories).map(([groupKey, { territory, count }]) => ({
      type: 'uncontrolled' as const,
      territory,
      count,
      sortKey: sortField === 'territory' ? territory.territory_name : 'ZZZ_Uncontrolled'
    }));

    // Combine and sort all items
    const allItems = [...controlledItems, ...uncontrolledItems];
    
    allItems.sort((a, b) => {
      const comparison = a.sortKey.localeCompare(b.sortKey);
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return allItems;
  };

  // TanStack Query mutation for deleting territory
  const deleteTerritoryMutation = useMutation({
    mutationFn: async (variables: {
      territoryId: string;
      territoryName: string;
    }) => {
      const result = await removeTerritoryFromCampaign({
        campaignId,
        territoryId: variables.territoryId
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove territory');
      }
      return result;
    },
    onMutate: async (variables) => {
      // Store previous state for rollback
      const previousTerritories = [...territories];
      
      // Optimistically update via parent callback
      onTerritoryUpdate?.({
        action: 'delete',
        territoryId: variables.territoryId
      });
      
      return { previousTerritories, territoryName: variables.territoryName };
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onSuccess: (result, variables, context) => {
      toast({
        description: `${context?.territoryName} removed successfully`
      });
      
      // Close modal
      setShowDeleteModal(false);
      setTerritoryToDelete(null);
    },
    onError: (error, variables, context) => {
      // Rollback by refreshing data from server
      onTerritoryUpdate?.();
      
      console.error('Error removing territory:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to remove territory"
      });
    }
  });

  // Territory deletion
  const handleDeleteClick = (territoryId: string, territoryName: string) => {
    setTerritoryToDelete({ id: territoryId, name: territoryName });
    setShowDeleteModal(true);
  };

  const handleRemoveTerritory = async (territoryId: string) => {
    const territory = territories.find(t => t.id === territoryId);
    if (!territory) return;

    deleteTerritoryMutation.mutate({
      territoryId,
      territoryName: territory.territory_name
    });
  };

  // Get sorted display list
  const sortedDisplayItems = createSortedDisplayList(territories);

  return (
    <>
      {/* Territory Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th 
                className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-muted select-none"
                onClick={() => handleSort('territory')}
              >
                Territory
                <SortIndicator field="territory" />
              </th>
              <th 
                className="w-3/5 px-2 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-muted select-none"
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
                <td colSpan={3} className="text-muted-foreground italic text-center py-4">
                  No territories in this campaign
                </td>
              </tr>
            ) : (
              sortedDisplayItems.map((item, index) => (
                <tr key={item.type === 'controlled' ? item.territory.id : `uncontrolled-${item.territory.territory_name}-${item.territory.ruined ? 'ruined' : 'normal'}`} 
                  className={`border-b ${index === sortedDisplayItems.length - 1 ? 'last:border-0' : ''}`}>
                  <td className="w-2/5 px-4 py-2">
                    <div className="font-medium">
                      {item.territory.territory_name}
                      {item.territory.ruined && (
                        <GiAncientRuins 
                          className="h-4 w-4 text-muted-foreground inline ml-1" 
                          data-tooltip-id="ruined-tooltip"
                          data-tooltip-content="This territory has been ruined and now provides a different boon"
                        />
                      )}
                      {item.territory.default_gang_territory && (
                        <IoHome 
                          className="h-4 w-4 text-muted-foreground inline ml-1" 
                          data-tooltip-id="default-territory-tooltip"
                          data-tooltip-content="This is a default gang territory"
                        />
                      )}
                      {item.type === 'uncontrolled' && item.count > 1 && (
                        <span className="text-muted-foreground font-normal ml-1">(x{item.count})</span>
                      )}
                    </div>
                  </td>
                  <td className="w-3/5 px-2 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.type === 'controlled' && item.territory.owning_gangs && item.territory.owning_gangs.length > 0 ? (
                        item.territory.owning_gangs.map(gang => (
                          <div
                            key={gang.id}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                            style={{ color: gang.gang_colour || '#000000' }}
                          >
                            <a
                              href={`/gang/${gang.id}`}
                              className="hover:text-muted-foreground transition-colors"
                              onClick={(e) => handleGangClick(e, gang.id)}
                            >
                              {gang.name}
                            </a>
                            {permissions.canClaimTerritories && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveGang(item.territory.id);
                                }}
                                disabled={removeGangMutation.isPending}
                                className="ml-1 text-gray-400 hover:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Remove gang from territory"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))
                      ) : item.type === 'uncontrolled' && permissions.canClaimTerritories ? (
                        <button
                          onClick={() => {
                            setSelectedTerritory(item.territory);
                            setShowGangModal(true);
                          }}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          Add gang
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="w-[100px] px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {permissions.canEditTerritories && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(item.territory)}
                          className="h-8 w-8 p-0"
                          aria-label="Edit territory"
                        >
                          <LuSquarePen className="h-4 w-4" />
                        </Button>
                      )}
                      {permissions.canDeleteTerritories && (
                        <Button
                          variant="outline_remove"
                          size="sm"
                          onClick={() => handleDeleteClick(item.territory.id, item.territory.territory_name)}
                          className="h-8 w-8 p-0"
                          aria-label="Delete territory"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </Button>
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
          isAssigning={assignGangMutation.isPending}
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
            await handleRemoveTerritory(territoryToDelete.id);
            return false;
          }}
          confirmText="Delete"
          confirmDisabled={deleteTerritoryMutation.isPending}
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
          isUpdating={updateTerritoryMutation.isPending}
        />
      )}

      {/* Tooltips */}
      <Tooltip 
        id="ruined-tooltip" 
        place="top" 
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      />
      <Tooltip 
        id="default-territory-tooltip" 
        place="top" 
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '20rem'
        }}
      />
    </>
  );
}