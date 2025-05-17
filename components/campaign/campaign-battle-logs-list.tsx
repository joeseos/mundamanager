"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import CampaignBattleLogModal from "./campaign-battle-log-modal";
import { ChevronLeft, ChevronRight, Edit, Trash2 } from "lucide-react";
import { deleteBattleLog } from "@/app/lib/battle-logs";
import Modal from "@/components/modal";

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

interface BattleParticipant {
  role: 'attacker' | 'defender';
  gang_id: string;
}

interface Battle {
  id: string;
  created_at: string;
  updated_at?: string;
  scenario_number?: number;
  scenario_name?: string;
  scenario?: string;
  attacker_id?: string;
  defender_id?: string;
  winner_id?: string;
  note?: string | null;
  participants?: BattleParticipant[] | string;
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
}

interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
}

interface CampaignGang {
  id: string;
  name: string;
}

interface CampaignBattleLogsListProps {
  campaignId: string;
  battles: Battle[];
  isAdmin: boolean;
  onBattleAdd: () => void;
  members: Member[];
  noContainer?: boolean;
  hideAddButton?: boolean;
}

export interface CampaignBattleLogsListRef {
  openAddModal: () => void;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const CampaignBattleLogsList = forwardRef<CampaignBattleLogsListRef, CampaignBattleLogsListProps>((props, ref) => {
  const { 
    campaignId, 
    battles, 
    isAdmin, 
    onBattleAdd,
    members,
    noContainer = false,
    hideAddButton = false
  } = props;
  
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const { toast } = useToast();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Calculate total pages
  const totalPages = Math.ceil(battles.length / itemsPerPage);

  // Map of gang IDs to gang names for lookup
  const [gangNameMap, setGangNameMap] = useState<Map<string, string>>(new Map());

  // State for the selected battle (will be used for edit functionality)
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [battleToDelete, setBattleToDelete] = useState<Battle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sort battles by date (newest first)
  const sortedBattles = useMemo(() => {
    return [...battles].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [battles]);
  
  // Get current battles for pagination
  const currentBattles = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return sortedBattles.slice(indexOfFirstItem, indexOfLastItem);
  }, [sortedBattles, currentPage, itemsPerPage]);
  
  // Pagination navigation
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Expose the openAddModal function to parent components
  useImperativeHandle(ref, () => ({
    openAddModal: () => {
      setSelectedBattle(null);
      setShowBattleModal(true);
    }
  }));

  // Extract gangs from members
  useEffect(() => {
    if (members && members.length > 0) {
      // Extract unique gangs from all members
      const gangsMap = new Map<string, CampaignGang>();
      const gangNamesMap = new Map<string, string>();
      
      members.forEach(member => {
        if (member.gangs && member.gangs.length > 0) {
          member.gangs.forEach(gang => {
            if (!gangsMap.has(gang.gang_id)) {
              gangsMap.set(gang.gang_id, {
                id: gang.gang_id,
                name: gang.gang_name
              });
              gangNamesMap.set(gang.gang_id, gang.gang_name);
            }
          });
        }
      });
      
      setAvailableGangs(Array.from(gangsMap.values()));
      setGangNameMap(gangNamesMap);
    }
  }, [members]);

  // Get gang name by ID
  const getGangName = (gangId: string | undefined): string => {
    if (!gangId) return "Unknown";
    return gangNameMap.get(gangId) || "Unknown";
  };

  // Get all gangs with their roles for a battle
  const getGangsWithRoles = (battle: Battle): React.ReactNode => {
    // Parse participants if it's a string
    let participants = battle.participants;
    if (participants && typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch (e) {
        console.error('Error parsing participants:', e);
        participants = [];
      }
    }

    // If using the new data structure with participants
    if (participants && Array.isArray(participants) && participants.length > 0) {
      // If no gangs with roles, return None
      if (participants.every(p => !p.gang_id)) {
        return <span className="text-gray-500">None</span>;
      }
      
      return (
        <div className="space-y-1">
          {participants.map((participant, index) => {
            if (!participant.gang_id) return null;
            
            // Role indicator
            let roleColor = "";
            let roleLetter = "";
            if (participant.role === 'attacker') {
              roleColor = "bg-red-500";
              roleLetter = "A";
            } else if (participant.role === 'defender') {
              roleColor = "bg-blue-500";
              roleLetter = "D";
            }
            
            return (
              <div key={index}>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  <Link 
                    href={`/gang/${participant.gang_id}`}
                    className="hover:text-gray-600 transition-colors flex items-center"
                  >
                    {getGangName(participant.gang_id)}
                    {roleColor && (
                      <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full ${roleColor} text-white text-[10px] font-bold`}>
                        {roleLetter}
                      </span>
                    )}
                  </Link>
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Fallback to old data structure
    const gangs = [];
    
    if (battle.attacker_id || battle.attacker?.gang_id) {
      const gangId = battle.attacker?.gang_id || battle.attacker_id;
      const gangName = battle.attacker?.gang_name || getGangName(gangId || "");
      
      if (gangId) {
        gangs.push({
          id: gangId,
          name: gangName,
          role: 'attacker'
        });
      }
    }
    
    if (battle.defender_id || battle.defender?.gang_id) {
      const gangId = battle.defender?.gang_id || battle.defender_id;
      const gangName = battle.defender?.gang_name || getGangName(gangId || "");
      
      if (gangId) {
        gangs.push({
          id: gangId,
          name: gangName,
          role: 'defender'
        });
      }
    }
    
    if (gangs.length === 0) {
      return <span className="text-gray-500">None</span>;
    }
    
    return (
      <div className="space-y-1">
        {gangs.map((gang, index) => {
          const roleColor = gang.role === 'attacker' ? 'bg-red-500' : 'bg-blue-500';
          const roleLetter = gang.role === 'attacker' ? 'A' : 'D';
          
          return (
            <div key={index}>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                <Link 
                  href={`/gang/${gang.id}`}
                  className="hover:text-gray-600 transition-colors flex items-center"
                >
                  {gang.name}
                  <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full ${roleColor} text-white text-[10px] font-bold`}>
                    {roleLetter}
                  </span>
                </Link>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Edit battle handler
  const handleEditBattle = (battle: Battle) => {
    setSelectedBattle(battle);
    setShowBattleModal(true);
  };

  // Delete battle handler
  const handleDeleteBattle = (battle: Battle, e?: React.MouseEvent) => {
    // Prevent any default actions or propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Delete button clicked, prevented default', battle.id);
    }
    
    setBattleToDelete(battle);
    setShowDeleteModal(true);
    return false; // Ensure no further action is taken
  };

  // Confirm delete battle
  const confirmDeleteBattle = async () => {
    if (!battleToDelete) return false;
    
    console.log('Confirming delete for battle', battleToDelete.id);
    setIsDeleting(true);
    
    try {
      console.log('Calling deleteBattleLog server action');
      await deleteBattleLog(campaignId, battleToDelete.id);
      console.log('Delete successful');
      
      // Close modal
      setShowDeleteModal(false);
      setBattleToDelete(null);
      
      // Delayed toast and refresh to avoid navigation conflicts
      setTimeout(() => {
        toast({
          description: "Battle log deleted successfully"
        });
        
        // Add a small delay before refreshing to ensure the delete has been processed
        setTimeout(() => {
          onBattleAdd(); // Refresh the battle list
        }, 100);
      }, 0);
      
      return true; // Return true for modal to close
    } catch (error) {
      console.error('Error deleting battle log:', error);
      toast({
        variant: "destructive",
        description: "Failed to delete battle log"
      });
      return false; // Return false to keep modal open
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowBattleModal(false);
    setSelectedBattle(null);
  };

  // Handle delete modal close
  const handleDeleteModalClose = () => {
    setShowDeleteModal(false);
    setBattleToDelete(null);
  };

  // The content to render
  const content = (
    <>
      {!noContainer && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">Battle Logs</h2>
          {isAdmin && !hideAddButton && (
            <Button
              onClick={() => {
                setSelectedBattle(null);
                setShowBattleModal(true);
              }}
              className="bg-black hover:bg-gray-800 text-white"
              aria-label="Add battle log"
            >
              Add
            </Button>
          )}
        </div>
      )}
      {noContainer && isAdmin && !hideAddButton && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => {
              setSelectedBattle(null);
              setShowBattleModal(true);
            }}
            className="bg-black hover:bg-gray-800 text-white"
            aria-label="Add battle log"
          >
            Add
          </Button>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Scenario</th>
              <th className="px-4 py-2 text-left font-medium">Gangs</th>
              <th className="px-4 py-2 text-left font-medium">Winner</th>
              {isAdmin && <th className="px-4 py-2 text-left font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {battles.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="text-gray-500 italic text-center">
                  No battles recorded yet.
                </td>
              </tr>
            ) : (
              currentBattles.map((battle) => (
                <tr key={battle.id} className="border-b">
                  <td className="px-4 py-2">
                    {formatDate(battle.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    {battle.scenario || battle.scenario_name || 'N/A'}
                  </td>
                  <td className="px-4 py-2">
                    {getGangsWithRoles(battle)}
                  </td>
                  <td className="px-4 py-2">
                    {battle.winner?.gang_id ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Link 
                          href={`/gang/${battle.winner.gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {battle.winner.gang_name || 'Unknown'}
                        </Link>
                      </span>
                    ) : (
                      battle.winner_id === null ? "Draw" : (battle.winner?.gang_name || 'Unknown')
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleEditBattle(battle)}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="Edit battle"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={(e) => handleDeleteBattle(battle, e)}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Delete battle"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <Button
            onClick={goToPreviousPage}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={goToNextPage}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Battle Log Modal for Add/Edit */}
      <CampaignBattleLogModal
        campaignId={campaignId}
        availableGangs={availableGangs}
        isOpen={showBattleModal}
        onClose={handleModalClose}
        onSuccess={onBattleAdd}
        battleToEdit={selectedBattle}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Battle Log"
          content={
            <div>
              <p className="mb-4">Are you sure you want to delete this battle log? This action cannot be undone.</p>
              {battleToDelete && (
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                  <div><span className="font-medium">Date:</span> {formatDate(battleToDelete.created_at)}</div>
                  <div><span className="font-medium">Scenario:</span> {battleToDelete.scenario || battleToDelete.scenario_name || 'N/A'}</div>
                </div>
              )}
            </div>
          }
          onClose={handleDeleteModalClose}
          onConfirm={confirmDeleteBattle}
          confirmText={isDeleting ? "Deleting..." : "Delete"}
          confirmDisabled={isDeleting}
        />
      )}
    </>
  );

  // Return with or without container based on prop
  return noContainer ? content : (
    <div className="bg-white shadow-md rounded-lg p-4">
      {content}
    </div>
  );
});

CampaignBattleLogsList.displayName = "CampaignBattleLogsList";

export default CampaignBattleLogsList; 