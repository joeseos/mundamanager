'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import Modal from '@/components/modal';
import { useToast } from "@/components/ui/use-toast";
import { deleteGang } from '@/app/actions/delete-gang';

interface DeleteGangButtonProps {
  gangId: string;
}

export default function DeleteGangButton({ gangId }: DeleteGangButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);

      const result = await deleteGang(gangId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete gang');
      }

      toast({
        description: "Gang successfully deleted",
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
            <div>
              <p>Are you sure you want to delete this gang?</p>
              <br />
              <p className="text-sm text-red-600">
                This action cannot be undone.
              </p>
            </div>
          }
          onClose={() => setShowModal(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
