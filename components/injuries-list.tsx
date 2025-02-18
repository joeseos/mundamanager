import { useState } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import Modal from './modal';
import React from 'react';

interface InjuryType {
  id: string;
  injury_name: string;
  code_1?: string;
  characteristic_1?: number;
  code_2?: string;
  characteristic_2?: number;
}

interface InjuriesListProps {
  injuries: Array<{
    id: string;
    injury_name: string;
    acquired_at: string;
    code_1?: string;
    characteristic_1?: number;
    code_2?: string;
    characteristic_2?: number;
  }>;
  availableInjuries: InjuryType[];
  onDeleteInjury: (injuryId: string) => Promise<void>;
  fighterId: string;
  onInjuryAdded: () => void;
}

export const InjuriesList = React.memo(function InjuriesList({ 
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
  const { toast } = useToast();

  const handleAddInjury = async () => {
    if (!selectedInjuryId) {
      toast({
        description: "Please select an injury",
        variant: "destructive"
      });
      return false;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/add_fighter_injury`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            input_fighter_id: fighterId,
            input_injury_id: selectedInjuryId
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add injury');
      }

      toast({
        description: "Injury added successfully",
        variant: "default"
      });

      setSelectedInjuryId('');
      onInjuryAdded();
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
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/fighter_injuries?id=eq.${injuryId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        }
      );

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
        <h2 className="text-2xl font-bold">Injuries</h2>
        <Button 
          onClick={() => setIsAddModalOpen(true)}
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
                  <td colSpan={2} className="px-1 py-1 text-center text-gray-500">
                    No injuries yet
                  </td>
                </tr>
              ) : (
                injuries
                  .sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime())
                  .map((injury) => (
                    <tr key={injury.id} className="border-t">
                      <td className="px-1 py-1">{injury.injury_name}</td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteModalData({
                              id: injury.id,
                              name: injury.injury_name
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
          title="Add Injury"
          content={
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="injurySelect" className="text-sm font-medium">
                  Select Injury
                </label>
                <select
                  id="injurySelect"
                  value={selectedInjuryId}
                  onChange={(e) => setSelectedInjuryId(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select an injury</option>
                  {availableInjuries.map((injury) => (
                    <option key={injury.id} value={injury.id}>
                      {injury.injury_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
          onClose={() => {
            setIsAddModalOpen(false);
            setSelectedInjuryId('');
          }}
          onConfirm={handleAddInjury}
          confirmText="Add Injury"
          confirmDisabled={!selectedInjuryId}
        />
      )}

      {deleteModalData && (
        <Modal
          title="Confirm Deletion"
          content={`Are you sure you want to delete the ${deleteModalData.name} injury? This action cannot be undone.`}
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteInjury(deleteModalData.id, deleteModalData.name)}
        />
      )}
    </div>
  );
}); 