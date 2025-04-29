import { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { FighterEffect, } from '@/types/fighter';

import { useToast } from '../ui/use-toast';
import Modal from '../modal';
import { createClient } from '@/utils/supabase/client';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  availableInjuries?: FighterEffect[];
  onDeleteInjury: (injuryId: string) => Promise<void>;
  fighterId: string;
  onInjuryAdded: () => void;
  fighterRecovery?: boolean;
}

export function InjuriesList({ 
  injuries = [],
  availableInjuries = [],
  onDeleteInjury,
  fighterId,
  onInjuryAdded,
  fighterRecovery = false,
}: InjuriesListProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
  const [selectedInjury, setSelectedInjury] = useState<FighterEffect | null>(null);
  const [localAvailableInjuries, setLocalAvailableInjuries] = useState<FighterEffect[]>([]);
  const [isLoadingInjuries, setIsLoadingInjuries] = useState(false);
  const { toast } = useToast();

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
      
      if (!response.ok) throw new Error('Failed to fetch injuries');
      const data: FighterEffect[] = await response.json();
      
      setLocalAvailableInjuries(data);
    } catch (error) {
      console.error('Error fetching injuries:', error);
      toast({
        description: 'Failed to load injury types',
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
        description: "Please select an injury",
        variant: "destructive"
      });
      return false;
    }

    // Find the selected injury object
    const injury = localAvailableInjuries.find(injury => injury.id === selectedInjuryId);
    if (!injury) {
      toast({
        description: "Selected injury not found",
        variant: "destructive"
      });
      return false;
    }
    
    setSelectedInjury(injury);

    // Check if the injury requires recovery
    const requiresRecovery = injury.type_specific_data && 
                            typeof injury.type_specific_data === 'object' && 
                            injury.type_specific_data.recovery === "true";

    // If fighter is already in recovery, don't show the recovery modal again
    if (requiresRecovery && !fighterRecovery) {
      // Close the injury selection modal and open the recovery confirmation modal
      setIsAddModalOpen(false);
      setIsRecoveryModalOpen(true);
      return false;
    } else {
      // Directly add the injury without asking for recovery
      // If fighter is already in recovery or injury doesn't require recovery
      return await proceedWithAddingInjury(false);
    }
  };

  const proceedWithAddingInjury = async (sendToRecovery: boolean = false) => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select an injury",
        variant: "destructive"
      });
      return false;
    }

    try {
      const supabase = createClient();
      
      // Get the current user's session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('No authenticated user');
      }

      const { data, error } = await supabase
        .rpc('add_fighter_injury', {
          in_fighter_id: fighterId,
          in_injury_type_id: selectedInjuryId,
          in_user_id: session.user.id,
          in_recovery: sendToRecovery
        });

      if (error) throw error;

      toast({
        description: `Injury added successfully${sendToRecovery ? ' and fighter sent to recovery' : ''}`,
        variant: "default"
      });

      setSelectedInjuryId('');
      setSelectedInjury(null);
      onInjuryAdded();
      setIsRecoveryModalOpen(false);
      return true;
    } catch (error) {
      console.error('Error adding injury:', error);
      toast({
        description: 'Failed to add injury',
        variant: "destructive"
      });
      return false;
    }
  };

  const handleDeleteInjury = async (injuryId: string, injuryName: string) => {
    try {
      setIsDeleting(injuryId);
      
      const response = await fetch(`/api/fighters/injuries?effectId=${injuryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete injury');
      }

      await onDeleteInjury(injuryId);
      toast({
        description: `${injuryName} removed successfully`,
        variant: "default"
      });
      return true;
    } catch (error) {
      console.error('Error deleting injury:', error);
      toast({
        description: 'Failed to delete injury',
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
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-xl md:text-2xl font-bold">Lasting Injuries</h2>
        <Button 
          onClick={handleOpenModal}
          className="bg-black hover:bg-gray-800 text-white"
        >
          Add
        </Button>
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            {(injuries.length > 0) && (
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-1 py-1 text-left">Name</th>
                  <th className="px-1 py-1 text-right">Action</th>
                </tr>
              </thead>
            )}
            <tbody>
              {injuries.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-gray-500 italic text-center">
                    No lasting injuries yet.
                  </td>
                </tr>
              ) : (
                injuries
                  .sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return dateA - dateB;
                  })
                  .map((injury) => (
                    <tr key={injury.id} className="border-t">
                      
                      <td className="px-1 py-1">
                        <span>{injury.effect_name}</span>
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteModalData({
                              id: injury.id,
                              name: injury.effect_name
                            })}
                            disabled={isDeleting === injury.id}
                            className="text-xs px-1.5 h-6"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <Modal
          title="Lasting Injuries"
          content={
            <div className="space-y-4">
              <div className="space-y-2">
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
                  {localAvailableInjuries.map((injury) => (
                    <option key={injury.id} value={injury.id}>
                      {injury.effect_name}
                    </option>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md min-h-0 max-h-svh overflow-y-auto">
            <div className="border-b px-[10px] py-2 flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900">Send ganger into recovery?</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsRecoveryModalOpen(false);
                    setSelectedInjuryId('');
                    setSelectedInjury(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="px-[10px] py-4">
              <p>You will need to remove the recovery flag yourself when you update the gang next.</p>
            </div>

            <div className="border-t px-[10px] py-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsRecoveryModalOpen(false);
                  setSelectedInjuryId('');
                  setSelectedInjury(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => proceedWithAddingInjury(false)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                No
              </button>
              <button
                onClick={() => proceedWithAddingInjury(true)}
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
              <p>Are you sure you want to delete "{deleteModalData.name}"?</p>
              <br />
              <p>This action cannot be undone.</p>
            </div>
          }
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteInjury(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </div>
  );
} 