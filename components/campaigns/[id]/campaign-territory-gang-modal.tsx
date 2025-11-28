'use client'

import Modal from "@/components/ui/modal"
import { useState, useEffect } from "react"
import Link from 'next/link'

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
  const [availableGangs, setAvailableGangs] = useState<Gang[]>([]);
  const [selectedGang, setSelectedGang] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadGangs = async () => {
      if (!isOpen) return;
      
      setIsLoading(true);
      try {
        // Use existing API route that combines all queries server-side
        const response = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch gangs: ${response.statusText}`);
        }

        const gangs = await response.json();
        setAvailableGangs(gangs);
      } catch (error) {
        console.error('Error loading gangs:', error);
        setAvailableGangs([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadGangs();
  }, [isOpen, campaignId]);

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
        <>
          <select
            value={selectedGang}
            onChange={(e) => setSelectedGang(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Select a gang</option>
            {availableGangs
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((gang) => (
                <option
                  key={gang.id}
                  value={gang.id}
                  disabled={existingGangId === gang.id}
                  className={existingGangId === gang.id ? "text-gray-400" : ""}
                >
                  {gang.name} 󠁯•󠁏 {gang.owner_username} {existingGangId === gang.id ? '(Already assigned)' : ''}
                </option>
            ))}
          </select>
        </>
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