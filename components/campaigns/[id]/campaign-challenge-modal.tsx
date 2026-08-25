"use client"

import { useMemo, useState } from "react";
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import Modal from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { issueChallenge } from "@/app/actions/campaigns/[id]/battle-logs";
import type { Battle, CampaignGang, Territory } from '@/types/campaign';

const noteCharLimit = 4096;

interface CampaignChallengeModalProps {
  campaignId: string;
  challenge: Battle;
  availableGangs: CampaignGang[];
  territories?: Territory[];
  onClose: () => void;
  onSuccess: () => void;
}

const CampaignChallengeModal = ({
  campaignId,
  challenge,
  availableGangs,
  territories = [],
  onClose,
  onSuccess,
}: CampaignChallengeModalProps) => {
  const [challengedGangId, setChallengedGangId] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [scenario, setScenario] = useState('');
  const [note, setNote] = useState('');

  const challengerName = challenge.challenger?.name
    ?? availableGangs.find(g => g.id === challenge.challenger_gang_id)?.name
    ?? 'Your gang';

  const opponentOptions = useMemo(
    () => availableGangs
      .filter(g => g.id !== challenge.challenger_gang_id)
      .map(g => buildGangComboboxOption(g)),
    [availableGangs, challenge.challenger_gang_id]
  );

  const territoryOptions = useMemo(
    () => territories.map(t => ({
      value: t.id,
      label: t.name || t.territory_name || 'Unnamed territory',
      displayValue: t.name || t.territory_name || 'Unnamed territory',
    })),
    [territories]
  );

  const issueMutation = useMutation({
    mutationFn: () => issueChallenge(campaignId, challenge.id, {
      challenged_gang_id: challengedGangId,
      campaign_territory_id: territoryId || null,
      scenario: scenario.trim() || null,
      note: note.trim() || null,
    }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to issue challenge');
        return;
      }
      toast.success('Challenge issued');
      onSuccess();
    },
    onError: () => toast.error('Failed to issue challenge'),
  });

  const isNoteOverLimit = note.length > noteCharLimit;

  return (
    <Modal
      title="Issue Challenge"
      helper={`${challengerName} is challenging. Fields marked with * are required.`}
      confirmText="Issue Challenge"
      confirmDisabled={!challengedGangId || isNoteOverLimit}
      onClose={onClose}
      onConfirm={async () => {
        if (!challengedGangId) return false;
        onClose();
        issueMutation.mutate();
        return true;
      }}
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Gang to challenge *
            </label>
            <Combobox
              options={opponentOptions}
              value={challengedGangId}
              onValueChange={setChallengedGangId}
              placeholder="Select a gang"
              clearable
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Territory at stake
            </label>
            <Combobox
              options={territoryOptions}
              value={territoryId}
              onValueChange={setTerritoryId}
              placeholder="Select a territory (optional)"
              clearable
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Recorded as the stake. It stays with its current owner until the battle is reported.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Scenario
            </label>
            <input
              type="text"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Optional — if you have already rolled it"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {isNoteOverLimit && (
              <p className="mt-1 text-xs text-red-600">
                Note is {note.length - noteCharLimit} characters over the limit.
              </p>
            )}
          </div>
        </div>
      }
    />
  );
};

export default CampaignChallengeModal;
