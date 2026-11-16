"use client"

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SortableRankList, type SortableRankItem } from "@/components/ui/sortable-rank-list";
import { generateChallengeRound, reorderChallengeRound } from "@/app/actions/campaigns/[id]/battle-logs";
import { shuffle } from "@/utils/dice";
import type { Battle } from "@/types/campaign";

interface CampaignChallengeRoundModalProps {
  campaignId: string;
  /** Accepted gangs, in the order offered before the arbitrator changes it. */
  gangs: SortableRankItem[];
  /** The latest round's open challenges, keyed by battle id, in their current order. */
  currentRound: SortableRankItem[];
  defaultCycle?: number | null;
  onClose: () => void;
  onSuccess: (created: Battle[]) => void;
  onReorder: (battleIds: string[]) => void;
}

const CampaignChallengeRoundModal = ({
  campaignId,
  gangs,
  currentRound,
  defaultCycle,
  onClose,
  onSuccess,
  onReorder,
}: CampaignChallengeRoundModalProps) => {
  const [activeTab, setActiveTab] = useState<'current' | 'new'>(currentRound.length > 0 ? 'current' : 'new');
  const [cycle, setCycle] = useState<string>(
    defaultCycle != null ? String(defaultCycle) : ''
  );
  const [order, setOrder] = useState(gangs);
  const [roundOrder, setRoundOrder] = useState(currentRound);

  const cycleValue = cycle ? parseInt(cycle, 10) : null;
  const cycleValid = !cycle || (!isNaN(cycleValue as number) && (cycleValue as number) > 0);
  const isCurrent = activeTab === 'current';

  const generateMutation = useMutation({
    mutationFn: () => generateChallengeRound(
      campaignId,
      cycleValid ? cycleValue : null,
      order.map((g) => g.id)
    ),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to create challenge round');
        return;
      }
      toast.success(`Created ${result.created} challenge${result.created === 1 ? '' : 's'}`);
      onSuccess((result.battles ?? []) as Battle[]);
    },
    onError: () => toast.error('Failed to create challenge round'),
  });

  const reorderMutation = useMutation({
    mutationFn: (battleIds: string[]) => reorderChallengeRound(campaignId, battleIds),
    onSuccess: (result, battleIds) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to reorder challenge round');
        return;
      }
      toast.success('Challenge order saved');
      onReorder(battleIds);
    },
    onError: () => toast.error('Failed to reorder challenge round'),
  });

  const renderChallengeOrder = (
    items: SortableRankItem[],
    setItems: Dispatch<SetStateAction<SortableRankItem[]>>
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">Challenge Order</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => shuffle(prev))}>
          Randomise
        </Button>
      </div>
      <SortableRankList items={items} onReorder={setItems} />
    </div>
  );

  return (
    <Modal
      title="Challenge Round"
      helper={isCurrent
        ? "Set the order gangs issue their challenges in for the current round."
        : "Every gang in the campaign gets a challenge to issue, in the order set below."}
      confirmText={isCurrent ? 'Save Order' : 'Create Round'}
      confirmDisabled={isCurrent ? roundOrder.length === 0 : !cycleValid || order.length === 0}
      onClose={onClose}
      onConfirm={async () => {
        if (isCurrent) {
          onClose();
          reorderMutation.mutate(roundOrder.map((c) => c.id));
          return true;
        }
        if (!cycleValid) return false;
        onClose();
        generateMutation.mutate();
        return true;
      }}
      content={
        <div className="space-y-4">
          {currentRound.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isCurrent ? 'default' : 'outline'}
                size="sm"
                className="w-full"
                onClick={() => setActiveTab('current')}
              >
                Current Round
              </Button>
              <Button
                type="button"
                variant={isCurrent ? 'outline' : 'default'}
                size="sm"
                className="w-full"
                onClick={() => setActiveTab('new')}
              >
                New Round
              </Button>
            </div>
          )}

          {isCurrent ? (
            renderChallengeOrder(roundOrder, setRoundOrder)
          ) : (
            <>
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

              {order.length > 0 ? (
                renderChallengeOrder(order, setOrder)
              ) : (
                <p className="text-sm text-muted-foreground">
                  There are no accepted gangs in this campaign yet.
                </p>
              )}
            </>
          )}
        </div>
      }
    />
  );
};

export default CampaignChallengeRoundModal;
