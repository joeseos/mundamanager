"use client"

import { useState } from "react";
import { toast } from 'sonner';
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { grantCampaignCredits, type CampaignGangBalance } from "@/app/actions/campaigns/[id]/campaign-gangs";

/** The Downtime grant in the Core Campaign; arbitrators change it for house rules. */
const DEFAULT_CREDITS = 250;

interface CampaignGrantCreditsModalProps {
  campaignId: string;
  /** Accepted gangs; all are ticked to start with. */
  gangs: { id: string; name: string }[];
  onClose: () => void;
  onGranted: (balances: CampaignGangBalance[]) => void;
}

export default function CampaignGrantCreditsModal({
  campaignId,
  gangs,
  onClose,
  onGranted,
}: CampaignGrantCreditsModalProps) {
  const [credits, setCredits] = useState(String(DEFAULT_CREDITS));
  const [selectedGangIds, setSelectedGangIds] = useState(() => new Set(gangs.map((gang) => gang.id)));

  const amount = Number(credits);
  const amountValid = Number.isInteger(amount) && amount > 0;

  const toggleGang = (gangId: string, checked: boolean) => {
    setSelectedGangIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(gangId);
      else next.delete(gangId);
      return next;
    });
  };

  const handleConfirm = async () => {
    const result = await grantCampaignCredits({ campaignId, gangIds: [...selectedGangIds], amount });
    if (!result.success) {
      toast.error(result.error || 'Failed to grant credits');
      return false;
    }
    if (result.failed > 0) {
      toast.error(`Credits could not be granted to ${result.failed} gang${result.failed === 1 ? '' : 's'}`);
    }
    toast.success(`Granted ${amount} credits to ${result.balances.length} gang${result.balances.length === 1 ? '' : 's'}`);
    onGranted(result.balances);
    return true;
  };

  return (
    <Modal
      title="Grant Credits"
      helper="Adds the same number of credits to each ticked gang, for example at the start of Downtime."
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Grant credits"
      confirmDisabled={!amountValid || selectedGangIds.size === 0}
      content={
        <div className="space-y-4">
          <div>
            <label htmlFor="grant-credits-amount" className="block text-sm font-medium text-muted-foreground mb-1">
              Credits
            </label>
            <Input
              id="grant-credits-amount"
              type="number"
              min={1}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
            {!amountValid && (
              <p className="mt-1 text-xs text-red-600">Credits must be a whole number of 1 or more.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Gangs</p>
            {gangs.length > 0 ? (
              gangs.map((gang) => (
                <div key={gang.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`grant-credits-${gang.id}`}
                    checked={selectedGangIds.has(gang.id)}
                    onCheckedChange={(checked) => toggleGang(gang.id, checked === true)}
                  />
                  <label htmlFor={`grant-credits-${gang.id}`} className="text-sm leading-none cursor-pointer">
                    {gang.name}
                  </label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">There are no accepted gangs in this campaign yet.</p>
            )}
          </div>
        </div>
      }
    />
  );
}
