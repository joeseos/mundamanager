'use client'

import Modal from "@/components/modal"
import { useEffect, useState } from "react"
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
      try {
        // First get campaign_gangs entries, joining with campaign_members for member-specific gangs
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

        // Then get the gang details
        const { data: gangs, error: gangsError } = await supabase
          .from('gangs')
          .select('id, name, gang_type')
          .in('id', campaignGangs.map(cg => cg.gang_id));

        if (gangsError) throw gangsError;

        // Combine the data with user information
        const enhancedGangs = gangs?.map(gang => {
          // Find the campaign_gang entry for this gang
          const campaignGang = campaignGangs.find(cg => cg.gang_id === gang.id);
          return {
            ...gang,
            campaign_gang_id: campaignGang?.id,
            user_id: campaignGang?.user_id,
            campaign_member_id: campaignGang?.campaign_member_id
          };
        }) || [];

        setAvailableGangs(enhancedGangs);
      } catch (error) {
        console.error('Error loading gangs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      loadGangs();
    }
  }, [isOpen, campaignId]);

  const modalContent = (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select a gang to control {territoryName}
      </p>
      {isLoading ? (
        <p>Loading gangs...</p>
      ) : availableGangs.length === 0 ? (
        <p className="text-sm text-gray-500">No gangs available in this campaign</p>
      ) : (
        <>
          <select
            value={selectedGang}
            onChange={(e) => setSelectedGang(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Select a gang</option>
            {availableGangs.map((gang) => (
              <option 
                key={gang.id} 
                value={gang.id}
                disabled={existingGangId === gang.id}
                className={existingGangId === gang.id ? "text-gray-400" : ""}
              >
                {gang.name} - {gang.gang_type} {existingGangId === gang.id ? '(Already assigned)' : ''}
              </option>
            ))}
          </select>

          {/* Gang list with links */}
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium mb-2">View gang details:</p>
            <div className="max-h-40 overflow-y-auto">
              <ul className="space-y-2">
                {availableGangs.map((gang) => (
                  <li key={gang.id} className="flex justify-between items-center">
                    <span className="text-sm">
                      {gang.name} - {gang.gang_type}
                    </span>
                    <Link 
                      href={`/gang/${gang.id}`}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Modal
      title="Assign Gang to Territory"
      content={modalContent}
      onClose={onClose}
      onConfirm={() => selectedGang && onConfirm(selectedGang)}
      confirmText="Assign Gang"
      confirmDisabled={!selectedGang}
    />
  );
} 