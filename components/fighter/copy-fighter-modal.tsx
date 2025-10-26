"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { copyFighter } from '@/app/actions/copy-fighter';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { ImInfo } from 'react-icons/im';

interface CopyFighterModalProps {
  fighterId: string;
  currentName: string;
  currentGangId: string;
  isOpen: boolean;
  onClose: () => void;
  fighterBaseCost: number;
  fighterFullCost: number;
}

export default function CopyFighterModal({
  fighterId,
  currentName,
  currentGangId,
  isOpen,
  onClose,
  fighterBaseCost,
  fighterFullCost,
}: CopyFighterModalProps) {
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [addToRating, setAddToRating] = useState(true);
  const [deductCredits, setDeductCredits] = useState(true);
  const [copyAsExperienced, setCopyAsExperienced] = useState(false);
  const [gangCredits, setGangCredits] = useState<number | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const calculatedCost = useMemo(() => {
    return copyAsExperienced ? fighterFullCost : fighterBaseCost;
  }, [copyAsExperienced, fighterBaseCost, fighterFullCost]);

  useEffect(() => {
    if (isOpen && currentGangId) {
      const fetchGangCredits = async () => {
        try {
          const response = await fetch(`/api/gangs/${currentGangId}`);
          if (response.ok) {
            const data = await response.json();
            setGangCredits(data.gang?.credits || 0);
          }
        } catch (error) {
          console.error('Error fetching gang credits:', error);
        }
      };
      fetchGangCredits();
    }
  }, [isOpen, currentGangId]);

  if (!isOpen) return null;

  const resetModalState = () => {
    setName(currentName);
    setSubmitting(false);
    setAddToRating(true);
    setDeductCredits(true);
    setCopyAsExperienced(false);
    setGangCredits(null);
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const handleConfirm = async () => {
    if (!name.trim()) return false;

    setSubmitting(true);
    const result = await copyFighter({
      fighter_id: fighterId,
      target_gang_id: currentGangId,
      new_name: name.trim(),
      add_to_rating: addToRating,
      deduct_credits: deductCredits,
      copy_as_experienced: copyAsExperienced,
      calculated_cost: calculatedCost,
    });
    setSubmitting(false);

    if (!result.success) {
      toast({
        title: 'Copy failed',
        description: result.error || 'Unknown error',
        variant: 'destructive'
      });
      return false;
    }

    toast({
      title: 'Fighter copied',
      description: `${result.data?.fighter_name} was successfully copied.`
    });

    resetModalState();
    onClose();
    router.refresh();

    return true;
  };

  return (
    <Modal
      title="Copy Fighter"
      headerContent={
        gangCredits !== null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Gang Credits</span>
            <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
              {gangCredits}
            </span>
          </div>
        )
      }
      helper="Choose a name for the fighter copy."
      onClose={handleClose}
      onConfirm={handleConfirm}
      confirmText={submitting ? 'Copying...' : 'Copy'}
      confirmDisabled={!name.trim() || submitting}
      width="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">New fighter name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={currentName}
          />
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Copy Type</div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="copyAsExperienced"
              checked={copyAsExperienced}
              onCheckedChange={(checked) => setCopyAsExperienced(checked === true)}
            />
            <label htmlFor="copyAsExperienced" className="text-sm font-medium text-muted-foreground cursor-pointer">
              Copy as experienced fighter
            </label>
            <div className="relative group">
              <ImInfo />
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs p-2 rounded w-72 -left-36 z-50">
                Includes XP, advancements, and lasting injuries
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground ml-6">
            {copyAsExperienced
              ? `Full copy with all experience, stat advancements, and injuries`
              : `Base fighter with equipment only (fresh recruit)`
            }
          </div>

          <div className="border-t pt-3 mt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Credits & Rating</div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="addToRating"
                checked={addToRating}
                onCheckedChange={(checked) => setAddToRating(checked === true)}
              />
              <label htmlFor="addToRating" className="text-sm font-medium text-muted-foreground cursor-pointer">
                Add fighter cost to gang rating ({calculatedCost} credits)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="deductCredits"
                checked={deductCredits}
                onCheckedChange={(checked) => setDeductCredits(checked === true)}
              />
              <label htmlFor="deductCredits" className="text-sm font-medium text-muted-foreground cursor-pointer">
                Deduct fighter cost from gang credits ({calculatedCost} credits)
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
