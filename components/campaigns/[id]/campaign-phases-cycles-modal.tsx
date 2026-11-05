"use client"

import { useState } from "react";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  updateCampaignPhaseAndCycle,
  type CampaignGangBalance,
  type CampaignPhaseAndCycle,
} from "@/app/actions/campaigns/[id]/campaign-settings";
import { hasTradePoints } from "@/types/edition";

interface CampaignPhasesCyclesModalProps {
  campaignId: string;
  editionSlug: string | null;
  currentCycle: number | null;
  currentPhase: string | null;
  /** The highest logged cycle prefills the cycle when none is set yet. */
  battles: { cycle?: number | null }[];
  phases: string[];
  /** To list the accepted gangs that still hold Trade Points. */
  members: { gangs: { name: string; status: string | null; trade_points?: number }[] }[];
  onClose: () => void;
  onSaved: (balances: CampaignGangBalance[], campaign: CampaignPhaseAndCycle) => void;
}

export default function CampaignPhasesCyclesModal({
  campaignId,
  editionSlug,
  currentCycle,
  currentPhase,
  battles,
  phases,
  members,
  onClose,
  onSaved,
}: CampaignPhasesCyclesModalProps) {
  const gangsWithTradePoints = hasTradePoints(editionSlug)
    ? members
        .flatMap((member) => member.gangs)
        .filter((gang) => gang.status === 'ACCEPTED' && (gang.trade_points ?? 0) > 0)
    : [];

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
    const result = await updateCampaignPhaseAndCycle({
      campaignId,
      phase,
      cycle: cycleValue,
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
    toast.success('Phase and cycle updated');
    onSaved(result.balances, result.campaign);
    return true;
  };

  return (
    <Modal
      title="Phases & Cycles"
      helper="Changes the cycle and phase shown to everyone in the campaign."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmDisabled={!cycleValid || !creditsValid}
      content={
        <div className="space-y-4">
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
