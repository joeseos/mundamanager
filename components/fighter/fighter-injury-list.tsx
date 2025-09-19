import React, { useState, useCallback } from 'react';
import { FighterEffect } from '@/types/fighter';
import { useToast } from '@/components/ui/use-toast';
import Modal from '@/components/ui/modal';
import { List } from "@/components/ui/list";
import { UserPermissions } from '@/types/user-permissions';
import { useRouter } from 'next/navigation';
import { 
  addFighterInjury, 
  deleteFighterInjury 
} from '@/app/actions/fighter-injury';
import { LuTrash2 } from 'react-icons/lu';
import DiceRoller from '@/components/dice-roller';
import { rollD66, resolveInjuryFromUtil, resolveInjuryFromUtilCrew } from '@/utils/dice';
import { lastingInjuryRank } from '@/utils/lastingInjuryRank';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  onInjuryUpdate?: (updatedInjuries: FighterEffect[], recoveryStatus?: boolean) => void;
  fighterId: string;
  fighterRecovery?: boolean;
  userPermissions: UserPermissions;
  fighter_class?: string;
}

export function InjuriesList({ 
  injuries = [],
  onInjuryUpdate,
  fighterId,
  fighterRecovery = false,
  userPermissions,
  fighter_class
}: InjuriesListProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isCapturedModalOpen, setIsCapturedModalOpen] = useState(false);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const fetchAvailableInjuries = useCallback(async () => {
    if (isLoadingInjuries) return;
    
    try {
      setIsLoadingInjuries(true);
      const response = await fetch(
        `/api/fighters/injuries`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch lasting injuries');
      const data: FighterEffect[] = await response.json();
      
      setLocalAvailableInjuries(data);
    } catch (error) {
      console.error('Error fetching lasting injuries:', error);
      toast({
        description: 'Failed to load lasting injury types',
        variant: "destructive"
      });
    } finally {
      setIsLoadingInjuries(false);
    }
  }, [isLoadingInjuries, toast]);

  const handleOpenModal = useCallback(() => {
    setIsAddModalOpen(true);
    if (localAvailableInjuries.length === 0) {
      fetchAvailableInjuries();
    }
  }, [localAvailableInjuries.length, fetchAvailableInjuries]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setSelectedInjuryId('');
    setSelectedInjury(null);
  }, []);

  const handleAddInjury = async () => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select a lasting injury",
        variant: "destructive"
      });
      return false;
    }

    // Find the selected injury object
    const injury = localAvailableInjuries.find(injury => injury.id === selectedInjuryId);
    if (!injury) {
      toast({
        description: "Selected lasting injury not found",
        variant: "destructive"
      });
      return false;
    }
    
    setSelectedInjury(injury);

    // Check if the injury requires Recovery or Captured status
    const typeSpecificData = injury.type_specific_data && typeof injury.type_specific_data === 'object' ? injury.type_specific_data : {};
    const requiresRecovery = typeSpecificData.recovery === "true";
    const requiresCaptured = typeSpecificData.captured === "true";

    // If fighter is already in Recovery, don't show the Recovery modal again
    if (requiresRecovery && !fighterRecovery) {
      // Close the injury selection modal and open the Recovery confirmation modal
      setIsAddModalOpen(false);
      setIsRecoveryModalOpen(true);
      return false;
    } else if (requiresCaptured) {
      // Close the injury selection modal and open the Captured confirmation modal
      setIsAddModalOpen(false);
      setIsCapturedModalOpen(true);
      return false;
    } else {
      // Directly add the injury without asking for status changes
      return await proceedWithAddingInjury(false, false);
    }
  };

  const proceedWithAddingInjury = async (sendToRecovery: boolean = false, setCaptured: boolean = false) => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select a lasting injury",
        variant: "destructive"
      });
      return false;
    }

    try {
      const result = await addFighterInjury({
        fighter_id: fighterId,
        injury_type_id: selectedInjuryId,
        send_to_recovery: sendToRecovery,
        set_captured: setCaptured
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add lasting injury');
      }

      const statusMessage = [];
      if (sendToRecovery) statusMessage.push('fighter sent to Recovery');
      if (setCaptured) statusMessage.push('fighter marked as Captured');
      
      toast({
        description: `Lasting injury added successfully${statusMessage.length > 0 ? ` and ${statusMessage.join(' and ')}` : ''}`,
        variant: "default"
      });

      setSelectedInjuryId('');
      setSelectedInjury(null);
      setIsRecoveryModalOpen(false);
      setIsCapturedModalOpen(false);
      
      // Refresh the page to get updated data
      router.refresh();
      
      return true;
    } catch (error) {
      console.error('Error adding lasting injury:', error);
      toast({
        description: `Failed to add lasting injury: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleDeleteInjury = async (injuryId: string, injuryName: string) => {
    try {
      setIsDeleting(injuryId);
      
      const result = await deleteFighterInjury({
        fighter_id: fighterId,
        injury_id: injuryId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete lasting injury');
      }
      
      toast({
        description: `${injuryName} removed successfully`,
        variant: "default"
      });
      
      // Refresh the page to get updated data
      router.refresh();
      
      return true;
    } catch (error) {
      console.error('Error deleting lasting injury:', error);
      toast({
        description: `Failed to delete lasting injury: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      return false;
    } finally {
      setIsDeleting(null);
      setDeleteModalData(null);
    }
  };

  const handleInjuryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedInjuryId(id);
    
    if (id) {
      const selectedInjury = localAvailableInjuries.find(injury => injury.id === id);
      setSelectedInjury(selectedInjury || null);
    } else {
      setSelectedInjury(null);
    }
  };

  return (
    <>
      <List
        title="Lasting Injuries"
        items={injuries
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateA - dateB;
          })
          .map((injury) => ({
            id: injury.id,
            name: injury.effect_name,
            injury_id: injury.id
          }))
        }
        columns={[
          {
            key: 'name',
            label: 'Name',
            width: '75%'
          }
        ]}
        actions={[
          {
            icon: <LuTrash2 className="h-4 w-4" />,
            title: "Delete",
            variant: 'destructive',
            onClick: (item) => setDeleteModalData({
              id: item.injury_id,
              name: item.name
            }),
            disabled: (item) => isDeleting === item.injury_id || !userPermissions.canEdit
          }
        ]}
        onAdd={handleOpenModal}
        addButtonDisabled={!userPermissions.canEdit}
        addButtonText="Add"
        emptyMessage="No lasting injuries yet."
      />

      {isAddModalOpen && (
        <Modal
          title="Lasting Injuries"
          content={
            <div className="space-y-4">
              <div>
                <DiceRoller
                   items={localAvailableInjuries}
                   ensureItems={localAvailableInjuries.length === 0 ? fetchAvailableInjuries : undefined}
                   getRange={(i: FighterEffect) => {
                     const d: any = (i as any)?.type_specific_data || {};
                     if (typeof d.d66_min === 'number' && typeof d.d66_max === 'number') {
                       return { min: d.d66_min, max: d.d66_max };
                     }
                     return null; // let component fall back to util mapping
                   }}
                   getName={(i: FighterEffect) => (i as any).effect_name}
                   inline
                   rollFn={rollD66}
                   resolveNameForRoll={(r) => {
                     const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                     return resolver(r)?.name;
                   }}
                   onRolled={(rolled) => {
                     if (rolled.length > 0) {
                       const roll = rolled[0].roll;
                       // Prefer DB ranges; if not available, fallback to util by name
                       const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                       const util = resolver(roll);
                       let match: any = null;
                       if (util) {
                         match = localAvailableInjuries.find(i => (i as any).effect_name === util.name);
                       }
                       if (!match) {
                         match = rolled[0].item as any;
                       }
                       if (match) {
                         setSelectedInjuryId(match.id);
                         setSelectedInjury(match);
                         toast({ description: `Roll ${roll}: ${match.effect_name}` });
                       }
                     }
                   }}
                   onRoll={(roll) => {
                     const resolver = fighter_class === 'Crew' ? resolveInjuryFromUtilCrew : resolveInjuryFromUtil;
                     const util = resolver(roll);
                     if (!util) return;
                     const match = localAvailableInjuries.find(i => (i as any).effect_name === util.name) as any;
                     if (match) {
                       setSelectedInjuryId(match.id);
                       setSelectedInjury(match);
                       toast({ description: `Roll ${roll}: ${match.effect_name}` });
                     }
                   }}
                   buttonText="Roll D66"
                   disabled={!userPermissions.canEdit}
                 />
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label htmlFor="injurySelect" className="text-sm font-medium">
                  Lasting Injuries
                </label>
                <select
                  id="injurySelect"
                  value={selectedInjuryId}
                  onChange={handleInjuryChange}
                  className="w-full p-2 border rounded-md"
                  disabled={isLoadingInjuries && localAvailableInjuries.length === 0}
                >
                  <option value="">
                    {isLoadingInjuries && localAvailableInjuries.length === 0
                      ? "Loading injuries..."
                      : "Select a Lasting Injury"
                    }
                  </option>
                
                  {Object.entries(
                    localAvailableInjuries
                      .slice()
                      .filter(injury => {
                        // If fighter is Crew, only show injuries in lastingInjuryCrewRank
                        if (fighter_class === 'Crew') {
                          return lastingInjuryCrewRank.hasOwnProperty(injury.effect_name);
                        }
                        // Otherwise show all injuries
                        return true;
                      })
                      .sort((a, b) => {
                        const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                        const rankA = rankMap[a.effect_name] ?? Infinity;
                        const rankB = rankMap[b.effect_name] ?? Infinity;
                        return rankA - rankB;
                      })
                      .reduce((groups, injury) => {
                        const rankMap = fighter_class === 'Crew' ? lastingInjuryCrewRank : lastingInjuryRank;
                        const rank = rankMap[injury.effect_name] ?? Infinity;
                        let groupLabel = "Other Injuries";
                
                        if (rank <= 29) groupLabel = "Lasting Injuries";
                        else if (rank >= 30) groupLabel = "Mutations / Festering Injuries";
                
                        if (!groups[groupLabel]) groups[groupLabel] = [];
                        groups[groupLabel].push(injury);
                        return groups;
                      }, {} as Record<string, typeof localAvailableInjuries>)
                  ).map(([groupLabel, injuries]) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {injuries.map((injury) => (
                        <option key={injury.id} value={injury.id}>
                          {injury.effect_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          }
          onClose={handleCloseModal}
          onConfirm={handleAddInjury}
          confirmText="Add Lasting Injury"
          confirmDisabled={!selectedInjuryId}
        />
      )}

      {isRecoveryModalOpen && (
        <div 
          className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsRecoveryModalOpen(false);
              setSelectedInjuryId('');
              setSelectedInjury(null);
            }
          }}
        >
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">Send ganger into Recovery?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsRecoveryModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                  }}
                  className="text-muted-foreground hover:text-muted-foreground text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="px-[10px] py-4">
              <p>You will need to remove the Recovery flag yourself when you update the gang next.</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsRecoveryModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, false)}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => proceedWithAddingInjury(true, false)}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {isCapturedModalOpen && (
        <div 
          className="fixed inset-0 min-h-screen bg-gray-300 bg-opacity-50 flex justify-center items-center z-[100] px-[10px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsCapturedModalOpen(false);
              setSelectedInjuryId('');
              setSelectedInjury(null);
            }
          }}
        >
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">Mark fighter as Captured?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsCapturedModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                  }}
                  className="text-muted-foreground hover:text-muted-foreground text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="px-[10px] py-4">
              <p>This injury results in the fighter being captured. Do you want to mark the fighter as Captured?</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsCapturedModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, false)}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                No
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false, true)}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalData && (
        <Modal
          title="Delete Lasting Injury"
          content={
            <div>
              <p>Are you sure you want to delete <strong>{deleteModalData.name}</strong>?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteInjury(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </>
  );
} 