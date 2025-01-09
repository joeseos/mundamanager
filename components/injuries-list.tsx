import { useState } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import Modal from './modal';

interface InjuriesListProps {
  injuries: Array<{
    id: string;
    injury_name: string;
    acquired_at: string;
  }>;
  onDeleteInjury: (injuryId: string) => Promise<void>;
  fighterId: string;
  onInjuryAdded: () => void;
}

export function InjuriesList({ 
  injuries = [],
  onDeleteInjury,
  fighterId,
  onInjuryAdded,
}: InjuriesListProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteModalData, setDeleteModalData] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  const handleDeleteInjury = async (injuryId: string) => {
    setIsDeleting(injuryId);

    try {
      await onDeleteInjury(injuryId);
      
      toast({
        description: "Injury successfully deleted",
        variant: "default"
      });
    } catch (error) {
      console.error('Error deleting injury:', error);
      toast({
        description: error instanceof Error ? error.message : 'Failed to delete injury',
        variant: "destructive"
      });
    } finally {
      setIsDeleting(null);
      setDeleteModalData(null);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Injuries</h2>
        <Button 
          onClick={() => {/* TODO: Add injury modal */}}
          className="bg-black hover:bg-gray-800 text-white"
        >
          Add
        </Button>
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-1 py-1 text-left">Injury</th>
                <th className="px-1 py-1 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {injuries.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-1 py-1 text-center text-gray-500">
                    No injuries
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

      {deleteModalData && (
        <Modal
          title="Confirm Deletion"
          content={`Are you sure you want to delete the ${deleteModalData.name} injury? This action cannot be undone.`}
          onClose={() => setDeleteModalData(null)}
          onConfirm={() => handleDeleteInjury(deleteModalData.id)}
        />
      )}
    </div>
  );
} 