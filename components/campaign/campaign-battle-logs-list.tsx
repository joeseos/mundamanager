"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useToast } from "@/components/ui/use-toast";
import CampaignBattleLogModal from "./campaign-battle-log-modal";

interface Member {
  user_id: string;
  username: string;
  role: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  status: string | null;
  invited_at: string;
  joined_at: string | null;
  invited_by: string;
  profile: {
    id: string;
    username: string;
    updated_at: string;
    user_role: string;
  };
  gangs: {
    id: string;
    gang_id: string;
    gang_name: string;
    status: string | null;
    rating?: number;
  }[];
}

interface Battle {
  id: string;
  created_at: string;
  scenario_number: number;
  scenario_name: string;
  attacker?: {
    gang_id?: string;
    gang_name: string;
  };
  defender?: {
    gang_id?: string;
    gang_name: string;
  };
  winner?: {
    gang_id?: string;
    gang_name: string;
  };
}

interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
}

interface CampaignGang {
  id: string;
  name: string;
}

interface CampaignBattleLogsListProps {
  campaignId: string;
  battles: Battle[];
  isAdmin: boolean;
  onBattleAdd: () => void;
  members: Member[];
  noContainer?: boolean;
  hideAddButton?: boolean;
}

export interface CampaignBattleLogsListRef {
  openAddModal: () => void;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const CampaignBattleLogsList = forwardRef<CampaignBattleLogsListRef, CampaignBattleLogsListProps>(({ 
  campaignId, 
  battles, 
  isAdmin, 
  onBattleAdd,
  members,
  noContainer = false,
  hideAddButton = false
}, ref) => {
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const { toast } = useToast();

  // Expose the openAddModal function to parent components
  useImperativeHandle(ref, () => ({
    openAddModal: () => {
      setShowBattleModal(true);
    }
  }));

  // Extract gangs from members
  useEffect(() => {
    if (members && members.length > 0) {
      // Extract unique gangs from all members
      const gangsMap = new Map<string, CampaignGang>();
      
      members.forEach(member => {
        if (member.gangs && member.gangs.length > 0) {
          member.gangs.forEach(gang => {
            if (!gangsMap.has(gang.gang_id)) {
              gangsMap.set(gang.gang_id, {
                id: gang.gang_id,
                name: gang.gang_name
              });
            }
          });
        }
      });
      
      setAvailableGangs(Array.from(gangsMap.values()));
    }
  }, [members]);

  // The content to render
  const content = (
    <>
      {!noContainer && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">Battle Logs</h2>
          {isAdmin && !hideAddButton && (
            <Button
              onClick={() => setShowBattleModal(true)}
              className="bg-black hover:bg-gray-800 text-white"
              aria-label="Add battle log"
            >
              Add
            </Button>
          )}
        </div>
      )}
      {noContainer && isAdmin && !hideAddButton && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setShowBattleModal(true)}
            className="bg-black hover:bg-gray-800 text-white"
            aria-label="Add battle log"
          >
            Add
          </Button>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Scenario</th>
              <th className="px-4 py-2 text-left font-medium">Attacker</th>
              <th className="px-4 py-2 text-left font-medium">Defender</th>
              <th className="px-4 py-2 text-left font-medium">Winner</th>
            </tr>
          </thead>
          <tbody>
            {battles.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-gray-500 italic text-center">
                  No battles recorded yet.
                </td>
              </tr>
            ) : (
              battles.map((battle) => (
                <tr key={battle.id} className="border-b">
                  <td className="px-4 py-2">
                    {formatDate(battle.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    {battle.scenario_number ? `${battle.scenario_name} (#${battle.scenario_number})` : battle.scenario_name || 'N/A'}
                  </td>
                  <td className="px-4 py-2">
                    {battle.attacker?.gang_id ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Link 
                          href={`/gang/${battle.attacker.gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {battle.attacker.gang_name || 'Unknown'}
                        </Link>
                      </span>
                    ) : (
                      battle.attacker?.gang_name || 'Unknown'
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {battle.defender?.gang_id ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Link 
                          href={`/gang/${battle.defender.gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {battle.defender.gang_name || 'Unknown'}
                        </Link>
                      </span>
                    ) : (
                      battle.defender?.gang_name || 'Unknown'
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {battle.winner?.gang_id ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Link 
                          href={`/gang/${battle.winner.gang_id}`}
                          className="hover:text-gray-600 transition-colors"
                        >
                          {battle.winner.gang_name || 'Unknown'}
                        </Link>
                      </span>
                    ) : (
                      battle.winner?.gang_name || 'Unknown'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Use the new Battle Log Modal component */}
      <CampaignBattleLogModal
        campaignId={campaignId}
        availableGangs={availableGangs}
        isOpen={showBattleModal}
        onClose={() => setShowBattleModal(false)}
        onSuccess={onBattleAdd}
      />
    </>
  );

  // Return with or without container based on prop
  return noContainer ? content : (
    <div className="bg-white shadow-md rounded-lg p-4">
      {content}
    </div>
  );
});

CampaignBattleLogsList.displayName = "CampaignBattleLogsList";

export default CampaignBattleLogsList; 