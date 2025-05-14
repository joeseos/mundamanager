"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
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

interface BattleParticipant {
  role: 'attacker' | 'defender';
  gang_id: string;
}

interface Battle {
  id: string;
  created_at: string;
  updated_at?: string;
  scenario_number?: number;
  scenario_name?: string;
  scenario?: string; // New field for formatted scenario name
  attacker_id?: string;
  defender_id?: string;
  winner_id?: string;
  note?: string | null;
  participants?: BattleParticipant[];
  // Support for old data structure
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

interface Territory {
  id: string;
  name: string;
  controlled_by?: string; // gang_id of controlling gang
}

interface CampaignBattleLogsListProps {
  campaignId: string;
  battles: Battle[];
  isAdmin: boolean;
  onBattleAdd: () => void;
  members: Member[];
  territories?: Territory[];
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
  territories = [],
  noContainer = false,
  hideAddButton = false
}, ref) => {
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const { toast } = useToast();
  
  // Map of gang IDs to gang names for lookup
  const [gangNameMap, setGangNameMap] = useState<Map<string, string>>(new Map());

  // Sort battles by date (newest first)
  const sortedBattles = useMemo(() => {
    return [...battles].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [battles]);

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
      const gangNamesMap = new Map<string, string>();
      
      members.forEach(member => {
        if (member.gangs && member.gangs.length > 0) {
          member.gangs.forEach(gang => {
            if (!gangsMap.has(gang.gang_id)) {
              gangsMap.set(gang.gang_id, {
                id: gang.gang_id,
                name: gang.gang_name
              });
              gangNamesMap.set(gang.gang_id, gang.gang_name);
            }
          });
        }
      });
      
      setAvailableGangs(Array.from(gangsMap.values()));
      setGangNameMap(gangNamesMap);
    }
  }, [members]);

  // Get gang name by ID
  const getGangName = (gangId: string | undefined): string => {
    if (!gangId) return "Unknown";
    return gangNameMap.get(gangId) || "Unknown";
  };

  // Get all attackers for a battle
  const getAttackers = (battle: Battle): React.ReactNode => {
    // Parse participants if it's a string
    let participants = battle.participants;
    if (participants && typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch (e) {
        console.error('Error parsing participants:', e);
        participants = [];
      }
    }

    // If using the new data structure with participants
    if (participants && Array.isArray(participants) && participants.length > 0) {
      const attackers = participants.filter(p => p.role === 'attacker');
      
      return (
        <div className="space-y-1">
          {attackers.map((attacker, index) => (
            <div key={index}>
              {attacker.gang_id ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  <Link 
                    href={`/gang/${attacker.gang_id}`}
                    className="hover:text-gray-600 transition-colors"
                  >
                    {getGangName(attacker.gang_id)}
                  </Link>
                </span>
              ) : (
                getGangName(attacker.gang_id)
              )}
            </div>
          ))}
        </div>
      );
    }
    
    // Fallback to old data structure
    return battle.attacker?.gang_id ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <Link 
          href={`/gang/${battle.attacker.gang_id}`}
          className="hover:text-gray-600 transition-colors"
        >
          {battle.attacker.gang_name || 'Unknown'}
        </Link>
      </span>
    ) : (
      battle.attacker?.gang_name || getGangName(battle.attacker_id) || 'Unknown'
    );
  };

  // Get all defenders for a battle
  const getDefenders = (battle: Battle): React.ReactNode => {
    // Parse participants if it's a string
    let participants = battle.participants;
    if (participants && typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch (e) {
        console.error('Error parsing participants:', e);
        participants = [];
      }
    }

    // If using the new data structure with participants
    if (participants && Array.isArray(participants) && participants.length > 0) {
      const defenders = participants.filter(p => p.role === 'defender');
      
      return (
        <div className="space-y-1">
          {defenders.map((defender, index) => (
            <div key={index}>
              {defender.gang_id ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  <Link 
                    href={`/gang/${defender.gang_id}`}
                    className="hover:text-gray-600 transition-colors"
                  >
                    {getGangName(defender.gang_id)}
                  </Link>
                </span>
              ) : (
                getGangName(defender.gang_id)
              )}
            </div>
          ))}
        </div>
      );
    }
    
    // Fallback to old data structure
    return battle.defender?.gang_id ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <Link 
          href={`/gang/${battle.defender.gang_id}`}
          className="hover:text-gray-600 transition-colors"
        >
          {battle.defender.gang_name || 'Unknown'}
        </Link>
      </span>
    ) : (
      battle.defender?.gang_name || getGangName(battle.defender_id) || 'Unknown'
    );
  };

  // Get winner display
  const getWinner = (battle: Battle): React.ReactNode => {
    // Check for "draw" result
    if (battle.winner_id === "draw") {
      return <span className="font-medium">Draw</span>;
    }
    
    // Use existing winner data structure if available
    if (battle.winner?.gang_id) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <Link 
            href={`/gang/${battle.winner.gang_id}`}
            className="hover:text-gray-600 transition-colors"
          >
            {battle.winner.gang_name || 'Unknown'}
          </Link>
        </span>
      );
    }
    
    // Otherwise use the winner_id from new structure
    if (battle.winner_id) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <Link 
            href={`/gang/${battle.winner_id}`}
            className="hover:text-gray-600 transition-colors"
          >
            {getGangName(battle.winner_id)}
          </Link>
        </span>
      );
    }
    
    return "Unknown";
  };

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
              {/* Show Notes column only if any battle has a note */}
              {battles.some(battle => battle.note) && (
                <th className="px-4 py-2 text-left font-medium">Notes</th>
              )}
            </tr>
          </thead>
          <tbody>
            {battles.length === 0 ? (
              <tr>
                <td colSpan={battles.some(battle => battle.note) ? 6 : 5} className="text-gray-500 italic text-center py-4">
                  No battles recorded yet.
                </td>
              </tr>
            ) : (
              sortedBattles.map((battle) => (
                <tr key={battle.id} className="border-b">
                  <td className="px-4 py-2">
                    {formatDate(battle.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    {battle.scenario || (battle.scenario_number ? `${battle.scenario_name} (#${battle.scenario_number})` : battle.scenario_name || 'N/A')}
                  </td>
                  <td className="px-4 py-2">
                    {getAttackers(battle)}
                  </td>
                  <td className="px-4 py-2">
                    {getDefenders(battle)}
                  </td>
                  <td className="px-4 py-2">
                    {getWinner(battle)}
                  </td>
                  {/* Show Notes column only if any battle has a note */}
                  {battles.some(battle => battle.note) && (
                    <td className="px-4 py-2 max-w-[200px] truncate">
                      {battle.note || ""}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Use the Battle Log Modal component */}
      <CampaignBattleLogModal
        campaignId={campaignId}
        availableGangs={availableGangs}
        territories={territories}
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