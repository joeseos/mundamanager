'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import Modal from '@/components/ui/modal';
import { useToast } from "@/components/ui/use-toast";
import { deleteGang } from '@/app/actions/delete-gang';

interface DeleteGangButtonProps {
  gangId: string;
  gangName?: string;
}

export default function DeleteGangButton({ gangId, gangName }: DeleteGangButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);

      const result = await deleteGang(gangId);
      console.log('[DeleteGang] Result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete gang');
      }

      toast({
        description: "Gang successfully deleted. You'll be automatically redirected to the home page in a few secondsy.",
        variant: "default"
      });

      router.push('/');
    } catch (error) {
      console.error('Error deleting gang:', error);
      
      const message = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred. Please try again.';

      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowModal(false);
      setConfirmText('');
    }
  };

  return (
    <>
      <div className="mt-2">
        <Button
          onClick={() => setShowModal(true)}
          variant="destructive"
          className="w-full"
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete Gang'}
        </Button>
      </div>

      {showModal && (
        <Modal
          title="Delete Gang"
          content={
            <div className="space-y-4">
              <p>
                Are you sure you want to delete the gang <strong>{gangName || 'this gang'}</strong>?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-bold">Delete</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Delete"
                  className="w-full"
                />
              </div>
              {isDeleting && (
                <p className="text-sm text-amber-500">This action will take a few seconds to complete. You'll be automatically redirected to the home page once it's complete.</p>
              )}
            </div>
          }
          onClose={() => {
            setShowModal(false);
            setConfirmText('');
          }}
          onConfirm={handleDelete}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          confirmDisabled={confirmText !== 'Delete'}
        />
      )}
    </>
  );
}
