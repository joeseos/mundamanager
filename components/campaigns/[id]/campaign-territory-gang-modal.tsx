'use client'

import Modal from "@/components/modal"
import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import Link from 'next/link'

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  campaign_gang_id?: string;
  user_id?: string;
  campaign_member_id?: string;
}


interface TerritoryGangModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (gangId: string) => void;
  campaignId: string;
  territoryName: string;
  existingGangId?: string | null;
}

export default function TerritoryGangModal({
  isOpen,
  onClose,
  onConfirm,
  campaignId,
  territoryName,
  existingGangId = null
}: TerritoryGangModalProps) {
  const [availableGangs, setAvailableGangs] = useState<Gang[]>([]);
  const [selectedGang, setSelectedGang] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const loadGangs = async () => {
      if (!isOpen) return;
      
      setIsLoading(true);
      try {
        // Get campaign gangs
        const { data: campaignGangs, error: campaignGangsError } = await supabase
          .from('campaign_gangs')
          .select(`
            id,
            gang_id,
            user_id,
            campaign_member_id
          `)
          .eq('campaign_id', campaignId);

        if (campaignGangsError) throw campaignGangsError;

        if (!campaignGangs?.length) {
          setAvailableGangs([]);
          setIsLoading(false);
          return;
        }

        // Get the gang details
        const { data: gangs, error: gangsError } = await supabase
          .from('gangs')
          .select('id, name, gang_type, gang_colour')
          .in('id', campaignGangs.map(cg => cg.gang_id));

        if (gangsError) throw gangsError;

        // Combine the data with user information
        const enhancedGangs = gangs?.map(gang => {
          // Find the campaign_gang entry for this gang
          const campaignGang = campaignGangs.find(cg => cg.gang_id === gang.id);
          return {
            id: gang.id,
            name: gang.name,
            gang_type: gang.gang_type,
            campaign_gang_id: campaignGang?.id,
            user_id: campaignGang?.user_id,
            campaign_member_id: campaignGang?.campaign_member_id
          };
        }) || [];

        setAvailableGangs(enhancedGangs);
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
      <p className="text-sm text-gray-500">
        Select a gang to take control of <strong>{territoryName}</strong>
      </p>
      {isLoading ? (
        <p>Loading gangs...</p>
      ) : availableGangs.length === 0 ? (
        <p className="text-gray-500 italic text-sm text-gray-500">No gangs have been added to this campaign.</p>
      ) : (
        <>
          <select
            value={selectedGang}
            onChange={(e) => setSelectedGang(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
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
      {gang.name} ({gang.gang_type}) {existingGangId === gang.id ? '(Already assigned)' : ''}
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
      confirmDisabled={!selectedGang}
    />
  );
} 