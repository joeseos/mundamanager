'use client'

import Modal from "@/components/ui/modal"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { buildGangComboboxOption } from '@/utils/gang-combobox-option'

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour?: string;
  campaign_gang_id?: string;
  user_id?: string;
  campaign_member_id?: string;
  owner_username?: string;
}


interface TerritoryGangModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (gangId: string) => void;
  campaignId: string;
  territoryName: string;
  existingGangId?: string | null;
  isAssigning?: boolean;
}

export default function TerritoryGangModal({
  isOpen,
  onClose,
  onConfirm,
  campaignId,
  territoryName,
  existingGangId = null,
  isAssigning = false
}: TerritoryGangModalProps) {
  const [selectedGang, setSelectedGang] = useState<string>('');

  const { data: availableGangs = [], isLoading } = useQuery({
    queryKey: ['campaign-gangs', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign gangs');
      return res.json() as Promise<Gang[]>;
    },
    enabled: isOpen,
    staleTime: 0,
  });

  const modalContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select a gang to take control of <strong>{territoryName}</strong>
      </p>
      {isLoading ? (
        <p>Loading gangs...</p>
      ) : availableGangs.length === 0 ? (
        <p className="text-muted-foreground italic text-sm text-muted-foreground">No gangs have been added to this campaign.</p>
      ) : (
        <Combobox
          value={selectedGang}
          onValueChange={setSelectedGang}
          placeholder="Select a gang"
          options={availableGangs
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((gang) => {
              const alreadyAssigned = existingGangId === gang.id;
              return {
                ...buildGangComboboxOption(gang, {
                  labelSuffix: alreadyAssigned
                    ? <span className="text-xs text-muted-foreground">(Already assigned)</span>
                    : undefined,
                  displayValueSuffix: alreadyAssigned ? ' (Already assigned)' : '',
                }),
                disabled: alreadyAssigned,
              };
            })
          }
        />
      )}
    </div>
  );

  return (
    <Modal
      title="Assign Territory"
      content={modalContent}
      onClose={onClose}
      onConfirm={() => selectedGang && onConfirm(selectedGang)}
      confirmText="Assign Territory"
      confirmDisabled={!selectedGang || isAssigning}
    />
  );
} 