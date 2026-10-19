'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserPermissions } from '@/types/user-permissions';
import { reputationIncome } from '@/utils/postCycleActions';
import { collectReputationIncome } from '@/app/actions/post-cycle-actions';

interface CollectIncomeProps {
  gangId: string;
  gangReputation: number;
  userPermissions?: UserPermissions;
  onGangFinancialsUpdate?: (financials: { credits: number; rating: number; wealth: number }) => void;
}

/** The Post-cycle Sequence's Collect Income step: the gang's Reputation income. */
export default function CollectIncome({
  gangId,
  gangReputation,
  userPermissions,
  onGangFinancialsUpdate,
}: CollectIncomeProps) {
  const [collecting, setCollecting] = useState(false);
  const income = reputationIncome(gangReputation);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const result = await collectReputationIncome(gangId);
      if (result.gang) onGangFinancialsUpdate?.(result.gang);
      if (result.success) {
        toast.success(`Collected ${result.credits} credits from Reputation`);
      } else {
        toast.error(result.error || 'Failed to collect income');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to collect income');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">Collect Income</h3>

      <div className="rounded-md border px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm">
          {gangReputation} Reputation: +{income} credits
        </span>
        <Button
          size="sm"
          onClick={handleCollect}
          disabled={!(userPermissions?.canEdit ?? false) || collecting || income === 0}
        >
          {collecting ? 'Collecting…' : 'Collect'}
        </Button>
      </div>
    </div>
  );
}
