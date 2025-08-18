"use client";

import React, { useState } from 'react';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { copyGang } from '@/app/actions/copy-gang';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';

interface CopyGangModalProps {
  gangId: string;
  currentName: string;
  isOpen: boolean;
  onClose: () => void;
  redirectOnSuccess?: boolean;
}

export default function CopyGangModal({
  gangId,
  currentName,
  isOpen,
  onClose,
  redirectOnSuccess = true,
}: CopyGangModalProps) {
  const [name, setName] = useState(`${currentName} copy`);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!name.trim()) return false;
    setSubmitting(true);
    const result = await copyGang({ sourceGangId: gangId, newName: name.trim() });
    setSubmitting(false);

    if (!result.success) {
      toast({ title: 'Copy failed', description: result.error || 'Unknown error', variant: 'destructive' });
      return false;
    }

    toast({ title: 'Gang copied', description: 'Your gang was successfully copied.' });
    const newId = result.newGangId!;
    onClose();
    if (redirectOnSuccess && newId) {
      router.push(`/gang/${newId}`);
    }
    return true;
  };

  return (
    <Modal
      title={<span>Copy Gang</span>}
      helper="Choose a name for the new gang."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText={submitting ? 'Copying...' : 'Copy'}
      confirmDisabled={!name.trim() || submitting}
      width="sm"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">New gang name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={`${currentName} copy`} />
      </div>
    </Modal>
  );
} 