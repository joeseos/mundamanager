"use client"

import { useState } from "react";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { updateCampaignCycle, type CampaignGangBalance } from "@/app/actions/campaigns/[id]/campaign-gangs";

interface CampaignCycleModalProps {
  campaignId: string;
  title: string;
  currentCycle: number | null;
  currentPhase: string | null;
  /** Prefills the cycle when none is set yet: where the battle logs have got to. */
  latestBattleCycle: number | null;
  /** The campaign type's phase names, offered as suggestions. */
  phases: string[];
  /** Accepted gangs, to show which still hold Trade Points. */
  gangs: { id: string; name: string; trade_points?: number }[];
  onClose: () => void;
  onSaved: (saved: {
    current_cycle: number | null;
    current_phase: string | null;
    updated_at: string | null;
    balances: CampaignGangBalance[];
  }) => void;
}

export default function CampaignCycleModal({
  campaignId,
  title,
  currentCycle,
  currentPhase,
  latestBattleCycle,
  phases,
  gangs,
  onClose,
  onSaved,
}: CampaignCycleModalProps) {
  const [cycle, setCycle] = useState(String(currentCycle !== null ? currentCycle + 1 : latestBattleCycle ?? 1));
  const [phase, setPhase] = useState(currentPhase ?? '');
  // Ending a cycle clears Trade Points by default; starting or setting one does not.
  const [clearTradePoints, setClearTradePoints] = useState(currentCycle !== null);

  const cycleValue = Number(cycle);
  const cycleValid = Number.isInteger(cycleValue) && cycleValue > 0;
  const gangsWithTradePoints = gangs.filter((gang) => (gang.trade_points ?? 0) > 0);

  const handleConfirm = async () => {
    const result = await updateCampaignCycle({
      campaignId,
      fromCycle: currentCycle,
      cycle: cycleValue,
      phase: phase || null,
      clearTradePoints,
    });
    if (!result.success) {
      toast.error(result.error || 'Failed to update the cycle');
      return false;
    }
    if (result.failed > 0) {
      toast.error(`Trade Points could not be cleared for ${result.failed} gang${result.failed === 1 ? '' : 's'}`);
    }
    toast.success(`Campaign is now in cycle ${result.campaign.current_cycle}`);
    onSaved({ ...result.campaign, balances: result.balances });
    return true;
  };

  return (
    <Modal
      title={title}
      helper="Changes the cycle and phase shown to everyone in the campaign."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Confirm"
      confirmDisabled={!cycleValid}
      content={
        <div className="space-y-4">
          <div>
            <label htmlFor="campaign-cycle" className="block text-sm font-medium text-muted-foreground mb-1">
              Cycle
            </label>
            <Input
              id="campaign-cycle"
              type="number"
              min={1}
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
            />
            {!cycleValid && (
              <p className="mt-1 text-xs text-red-600">Cycle must be a whole number of 1 or more.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Phase
            </label>
            <Combobox
              options={phases.map((name) => ({ value: name, label: name }))}
              value={phase}
              onValueChange={setPhase}
              placeholder="Select or type a phase (optional)"
              allowCustom
              clearable
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="clear-trade-points"
                checked={clearTradePoints}
                onCheckedChange={(checked) => setClearTradePoints(checked === true)}
              />
              <label htmlFor="clear-trade-points" className="text-sm font-medium leading-none cursor-pointer">
                Clear Trade Points for all gangs
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {gangsWithTradePoints.length > 0
                ? `Still holding Trade Points: ${gangsWithTradePoints
                    .map((gang) => `${gang.name} (${gang.trade_points})`)
                    .join(', ')}`
                : 'No gang holds Trade Points.'}
            </p>
          </div>
        </div>
      }
    />
  );
}
