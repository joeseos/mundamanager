"use client"

import { useState } from "react";
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SortableRankList, type SortableRankItem } from "@/components/ui/sortable-rank-list";
import { generateChallengeRound } from "@/app/actions/campaigns/[id]/battle-logs";
import type { Battle } from "@/types/campaign";

interface CampaignChallengeRoundModalProps {
  campaignId: string;
  /** Accepted gangs, in the order offered before the arbitrator changes it. */
  gangs: SortableRankItem[];
  defaultCycle?: number | null;
  onClose: () => void;
  onSuccess: (created: Battle[]) => void;
}

const CampaignChallengeRoundModal = ({
  campaignId,
  gangs,
  defaultCycle,
  onClose,
  onSuccess,
}: CampaignChallengeRoundModalProps) => {
  const [cycle, setCycle] = useState<string>(
    defaultCycle != null ? String(defaultCycle) : ''
  );
  const [order, setOrder] = useState(gangs);
  const gangCount = order.length;

  // Fisher-Yates, so every order is equally likely.
  const randomiseOrder = () => {
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  };

  const cycleValue = cycle ? parseInt(cycle, 10) : null;
  const cycleValid = !cycle || (!isNaN(cycleValue as number) && (cycleValue as number) > 0);

  const generateMutation = useMutation({
    mutationFn: () => generateChallengeRound(
      campaignId,
      cycleValid ? cycleValue : null,
      order.map((g) => g.id)
    ),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to open challenge round');
        return;
      }
      toast.success(`Opened ${result.created} challenge${result.created === 1 ? '' : 's'}`);
      onSuccess((result.battles ?? []) as Battle[]);
    },
    onError: () => toast.error('Failed to open challenge round'),
  });

  return (
    <Modal
      title="Open Challenge Round"
      helper="Every gang in the campaign gets a challenge to issue, in the order set below."
      confirmText="Open Round"
      confirmDisabled={!cycleValid || gangCount === 0}
      onClose={onClose}
      onConfirm={async () => {
        if (!cycleValid) return false;
        onClose();
        generateMutation.mutate();
        return true;
      }}
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Cycle
            </label>
            <input
              type="number"
              min={1}
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              placeholder="Enter cycle number (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {!cycleValid && (
              <p className="mt-1 text-xs text-red-600">Cycle must be a positive number.</p>
            )}
          </div>

          {gangCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">Challenge Order</p>
                <Button type="button" variant="outline" size="sm" onClick={randomiseOrder}>
                  Randomise
                </Button>
              </div>
              <SortableRankList items={order} onReorder={setOrder} />
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {gangCount === 0
              ? 'There are no accepted gangs in this campaign yet.'
              : `This creates ${gangCount} challenge${gangCount === 1 ? '' : 's'}, one per gang. ` +
                'Each gang’s owner then picks who to challenge. You can open more than one round per cycle.'}
          </p>
        </div>
      }
    />
  );
};

export default CampaignChallengeRoundModal;
