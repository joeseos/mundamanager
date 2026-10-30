"use client"

import { useState } from "react";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { updateCampaignCycle, type CampaignGangBalance } from "@/app/actions/campaigns/[id]/campaign-settings";

interface CampaignCycleModalProps {
  campaignId: string;
  currentCycle: number | null;
  currentPhase: string | null;
  /** The highest logged cycle prefills the cycle when none is set yet. */
  battles: { cycle?: number | null }[];
  /** The campaign type's phase names, offered as suggestions. */
  phases: string[];
  /** To list the accepted gangs that still hold Trade Points. */
  members: { gangs: { name: string; status: string | null; trade_points?: number }[] }[];
  onClose: () => void;
  onSaved: (
    balances: CampaignGangBalance[],
    campaign: { current_cycle: number; current_phase: string | null; updated_at: string }
  ) => void;
}

export default function CampaignCycleModal({
  campaignId,
  currentCycle,
  currentPhase,
  battles,
  phases,
  members,
  onClose,
  onSaved,
}: CampaignCycleModalProps) {
  const gangsWithTradePoints = members
    .flatMap((member) => member.gangs)
    .filter((gang) => gang.status === 'ACCEPTED' && (gang.trade_points ?? 0) > 0);

  const [cycle, setCycle] = useState(() =>
    String(currentCycle ?? Math.max(1, ...battles.flatMap((battle) => battle.cycle ?? [])))
  );
  const [phase, setPhase] = useState(currentPhase ?? '');
  const [clearTradePoints, setClearTradePoints] = useState(false);
  const [credits, setCredits] = useState('');

  const cycleValue = Number(cycle);
  const cycleValid = Number.isInteger(cycleValue) && cycleValue > 0;
  const creditsValue = Number(credits);
  const creditsValid = Number.isInteger(creditsValue) && creditsValue >= 0;

  const handleConfirm = async () => {
    const result = await updateCampaignCycle({
      campaignId,
      fromCycle: currentCycle,
      cycle: cycleValue,
      phase,
      clearTradePoints,
      credits: creditsValue,
    });
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} gang${result.failed === 1 ? ' was' : 's were'} not updated`);
    }
    toast.success(`Campaign is now in cycle ${result.campaign.current_cycle}`);
    onSaved(result.balances, result.campaign);
    return true;
  };

  return (
    <Modal
      title="Edit cycle"
      helper="Changes the cycle and phase shown to everyone in the campaign."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmDisabled={!cycleValid || !creditsValid}
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

          {gangsWithTradePoints.length > 0 && (
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
                Still holding Trade Points: {gangsWithTradePoints.map((gang) => `${gang.name} (${gang.trade_points})`).join(', ')}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="campaign-cycle-credits" className="block text-sm font-medium text-muted-foreground mb-1">
              Grant credits to all gangs
            </label>
            <Input
              id="campaign-cycle-credits"
              type="number"
              min={0}
              placeholder="e.g. 250"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
            {!creditsValid && (
              <p className="mt-1 text-xs text-red-600">Credits must be a whole number of 0 or more.</p>
            )}
          </div>
        </div>
      }
    />
  );
}
