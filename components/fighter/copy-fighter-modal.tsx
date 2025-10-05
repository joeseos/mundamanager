"use client";

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
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
}: CopyFighterModalProps) {
  const [name, setName] = useState(`${currentName} (Copy)`);
  const [targetGangId, setTargetGangId] = useState(currentGangId);
  const [campaignGangs, setCampaignGangs] = useState<CampaignGang[]>([]);
  const [loadingGangs, setLoadingGangs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Fetch campaign gangs if admin and in a campaign
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

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!name.trim()) return false;

    setSubmitting(true);
    const result = await copyFighter({
      fighter_id: fighterId,
      target_gang_id: targetGangId,
      new_name: name.trim(),
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

    // Refresh the page to show the new fighter
    router.refresh();

    return true;
  };

  const showGangSelector = isAdmin && campaignGangs.length > 0;

  return (
    <Modal
      title={<span>Copy Fighter</span>}
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
            placeholder={`${currentName} (Copy)`}
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
      </div>
    </Modal>
  );
}
