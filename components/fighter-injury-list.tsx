import { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { FighterEffect, } from '@/types/fighter';

import { useToast } from './ui/use-toast';
import Modal from './modal';
import { createClient } from '@/utils/supabase/client';

interface InjuriesListProps {
  injuries: Array<FighterEffect>;
  availableInjuries?: FighterEffect[];
  onDeleteInjury: (injuryId: string) => Promise<void>;
  fighterId: string;
  onInjuryAdded: () => void;
}

export function InjuriesList({ 
  injuries = [],
  availableInjuries = [],
  onDeleteInjury,
  fighterId,
  onInjuryAdded,
}: InjuriesListProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>('');
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
  }, []);

  const handleAddInjury = async () => {
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
        .rpc('add_fighter_effect', {
          in_fighter_id: fighterId,
          in_fighter_effect_category_id: "1cc0f7d5-3c5b-4098-9892-bcd4843f69b6", // injuries category
          in_fighter_effect_type_id: selectedInjuryId,
          in_user_id: session.user.id
        });

      if (error) throw error;

      toast({
        description: "Injury added successfully",
        variant: "default"
      });

      setSelectedInjuryId('');
      onInjuryAdded();
      handleCloseModal();
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

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Lasting Injuries</h2>
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
                  onChange={(e) => setSelectedInjuryId(e.target.value)}
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