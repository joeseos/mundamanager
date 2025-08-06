'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import Modal from '@/components/modal';
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface DeleteGangButtonProps {
  gangId: string;
}

class GangDeleteError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'GangDeleteError';
  }
}

export default function DeleteGangButton({ gangId }: DeleteGangButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new GangDeleteError('You must be logged in to delete a gang', 401);
      }

      const deleteResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/gangs?id=eq.${gangId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=representation'
          }
        }
      );

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => null);
        
        switch (deleteResponse.status) {
          case 401:
            throw new GangDeleteError('Your session has expired. Please log in again.', 401);
          case 403:
            throw new GangDeleteError('You do not have permission to delete this gang', 403);
          case 404:
            throw new GangDeleteError('Gang not found', 404);
          default:
            throw new GangDeleteError(
              errorData?.message || 'An unexpected error occurred while deleting the gang',
              deleteResponse.status
            );
        }
      }

      // Try to get the deleted data to confirm deletion
      const deletedData = await deleteResponse.json().catch(() => null);
      
      if (!deletedData || (Array.isArray(deletedData) && deletedData.length === 0)) {
        throw new GangDeleteError('Gang could not be deleted - no changes made', 403);
      }

      toast({
        description: "Gang successfully deleted",
        variant: "default"
      });

      router.push('/');
    } catch (error) {
      console.error('Error deleting gang:', error);
      
      const message = error instanceof GangDeleteError 
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
