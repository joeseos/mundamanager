"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { copyFighter } from '@/app/actions/copy-fighter';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';

interface CopyFighterModalProps {
  fighterId: string;
  currentName: string;
  currentGangId: string;
  currentGangName: string;
  campaignId?: string | null;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  fighterBaseCost: number; // Base fighter cost (without advancements)
  fighterFullCost: number; // Full cost including advancements
}

interface CampaignGang {
  id: string;
  gang_name: string;
  gang_type: string;
  user_id: string;
}

export default function CopyFighterModal({
  fighterId,
  currentName,
  currentGangId,
  currentGangName,
  campaignId,
  isAdmin,
  isOpen,
  onClose,
  fighterBaseCost,
  fighterFullCost,
}: CopyFighterModalProps) {
  const [name, setName] = useState(currentName);
  const [targetGangId, setTargetGangId] = useState(currentGangId);
  const [campaignGangs, setCampaignGangs] = useState<CampaignGang[]>([]);
  const [loadingGangs, setLoadingGangs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addToRating, setAddToRating] = useState(true);
  const [deductCredits, setDeductCredits] = useState(true);
  const [copyAsExperienced, setCopyAsExperienced] = useState(false);
  const [targetGangCredits, setTargetGangCredits] = useState<number | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const calculatedCost = useMemo(() => {
    return copyAsExperienced ? fighterFullCost : fighterBaseCost;
  }, [copyAsExperienced, fighterBaseCost, fighterFullCost]);

  useEffect(() => {
    if (isOpen && isAdmin && campaignId) {
      const fetchCampaignGangs = async () => {
        setLoadingGangs(true);
        try {
          const response = await fetch(`/api/campaigns/${campaignId}/gangs`);
          if (response.ok) {
            const gangs = await response.json();
            setCampaignGangs(gangs);
          }
        } catch (error) {
          console.error('Error fetching campaign gangs:', error);
        } finally {
          setLoadingGangs(false);
        }
      };
      fetchCampaignGangs();
    } else {
      setCampaignGangs([]);
    }
  }, [isOpen, isAdmin, campaignId]);

  useEffect(() => {
    if (isOpen && targetGangId) {
      const fetchTargetGangCredits = async () => {
        try {
          const response = await fetch(`/api/gangs/${targetGangId}`);
          if (response.ok) {
            const data = await response.json();
            setTargetGangCredits(data.gang?.credits || 0);
          }
        } catch (error) {
          console.error('Error fetching target gang credits:', error);
        }
      };
      fetchTargetGangCredits();
    }
  }, [isOpen, targetGangId]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!name.trim()) return false;

    setSubmitting(true);
    const result = await copyFighter({
      fighter_id: fighterId,
      target_gang_id: targetGangId,
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

    onClose();
    router.refresh();

    return true;
  };

  const showGangSelector = isAdmin && campaignGangs.length > 0;

  return (
    <Modal
      title="Copy Fighter"
      headerContent={
        targetGangCredits !== null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Gang Credits</span>
            <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
              {targetGangCredits}
            </span>
          </div>
        )
      }
      helper={showGangSelector
        ? "Choose a name and target gang for the fighter copy."
        : "Choose a name for the fighter copy."}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText={submitting ? 'Copying...' : 'Copy'}
      confirmDisabled={!name.trim() || submitting || loadingGangs}
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

        {showGangSelector && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Target gang</label>
            {loadingGangs ? (
              <div className="text-sm text-muted-foreground">Loading gangs...</div>
            ) : (
              <select
                value={targetGangId}
                onChange={e => setTargetGangId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value={currentGangId}>
                  {currentGangName} (Current gang)
                </option>
                {campaignGangs
                  .filter(gang => gang.id !== currentGangId)
                  .map(gang => (
                    <option key={gang.id} value={gang.id}>
                      {gang.gang_name} ({gang.gang_type})
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}

        {!isAdmin && (
          <div className="text-sm text-muted-foreground">
            Fighter will be copied to the same gang. Only admins can copy to other gangs.
          </div>
        )}

        <div className="space-y-3 pt-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Copy Type</div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="copyAsExperienced"
              checked={copyAsExperienced}
              onCheckedChange={(checked) => setCopyAsExperienced(checked === true)}
            />
            <label htmlFor="copyAsExperienced" className="text-sm font-medium cursor-pointer">
              Copy as experienced fighter (includes XP, advancements, and lasting injuries)
            </label>
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
              <label htmlFor="addToRating" className="text-sm font-medium cursor-pointer">
                Add fighter cost to gang rating ({calculatedCost} credits)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="deductCredits"
                checked={deductCredits}
                onCheckedChange={(checked) => setDeductCredits(checked === true)}
              />
              <label htmlFor="deductCredits" className="text-sm font-medium cursor-pointer">
                Deduct fighter cost from gang credits ({calculatedCost} credits)
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
