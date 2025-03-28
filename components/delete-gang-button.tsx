'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import Modal from '@/components/modal';
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface DeleteGangButtonProps {
  gangId: string;
}

export default function DeleteGangButton({ gangId }: DeleteGangButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      
      const { error: deleteError } = await supabase
        .from('gangs')
        .delete()
        .eq('id', gangId);

      if (deleteError) throw deleteError;

      toast({
        description: "Gang successfully deleted"
      });

      router.push('/');
    } catch (error) {
      console.error('Error deleting gang:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete gang');
      toast({
        description: "Failed to delete gang",
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
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </div>

      {showModal && (
        <Modal
          title="Delete Gang"
          content="Are you sure you want to delete this gang? This action cannot be undone."
          onClose={() => setShowModal(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
