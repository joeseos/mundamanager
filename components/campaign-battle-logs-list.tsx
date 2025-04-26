"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";

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
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

export default function CampaignBattleLogsList({ 
  campaignId, 
  battles, 
  isAdmin, 
  onBattleAdd,
  members
}: CampaignBattleLogsListProps) {
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [selectedAttacker, setSelectedAttacker] = useState('');
  const [selectedDefender, setSelectedDefender] = useState('');
  const [selectedWinner, setSelectedWinner] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [availableGangs, setAvailableGangs] = useState<CampaignGang[]>([]);
  const [isLoadingBattleData, setIsLoadingBattleData] = useState(false);
  const { toast } = useToast();

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

  const loadBattleData = async () => {
    setIsLoadingBattleData(true);
    try {
      // Only need to fetch scenarios, gangs are extracted from members
      const response = await fetch('/api/campaigns/battles', {
        headers: {
          'X-Campaign-Id': campaignId
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch battle data');
      
      const data = await response.json();
      setScenarios(data.scenarios);
      
      // Gangs are already set from members in the useEffect
    } catch (error) {
      console.error('Error loading battle data:', error);
      toast({
        variant: "destructive",
        description: "Failed to load battle data"
      });
    } finally {
      setIsLoadingBattleData(false);
    }
  };

  const handleAddBattle = async () => {
    if (!selectedScenario || !selectedAttacker || !selectedDefender || !selectedWinner) {
      toast({
        variant: "destructive",
        description: "Please fill in all fields"
      });
      return false;
    }

    try {
      const response = await fetch('/api/campaigns/battles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Campaign-Id': campaignId
        },
        body: JSON.stringify({
          scenario_id: selectedScenario,
          attacker_id: selectedAttacker,
          defender_id: selectedDefender,
          winner_id: selectedWinner
        }),
      });

      if (!response.ok) throw new Error('Failed to create battle log');

      onBattleAdd();
      toast({
        description: "Battle log added successfully"
      });
      setShowBattleModal(false);
      // Reset form
      setSelectedScenario('');
      setSelectedAttacker('');
      setSelectedDefender('');
      setSelectedWinner('');
      return false;
    } catch (error) {
      console.error('Error creating battle log:', error);
      toast({
        variant: "destructive",
        description: "Failed to create battle log"
      });
      return false;
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Battle Logs</h2>
        {isAdmin && (
          <Button
            onClick={() => {
              setShowBattleModal(true);
              loadBattleData();
            }}
            className="bg-black hover:bg-gray-800 text-white"
          >
            Add
          </Button>
        )}
      </div>
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
                  <td className="px-4 py-2">{battle.scenario_name || 'N/A'}</td>
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

      {/* Battle Log Modal */}
      {showBattleModal && (
        <Modal
          title="Add Battle Log"
          content={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scenario
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-md border border-gray-300"
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  disabled={isLoadingBattleData}
                >
                  <option value="">Select scenario</option>
                  {scenarios.map(scenario => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.scenario_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Attacker
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-md border border-gray-300"
                  value={selectedAttacker}
                  onChange={(e) => setSelectedAttacker(e.target.value)}
                  disabled={isLoadingBattleData}
                >
                  <option value="">Select gang</option>
                  {availableGangs.map(gang => (
                    <option key={gang.id} value={gang.id}>
                      {gang.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Defender
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-md border border-gray-300"
                  value={selectedDefender}
                  onChange={(e) => setSelectedDefender(e.target.value)}
                  disabled={isLoadingBattleData}
                >
                  <option value="">Select gang</option>
                  {availableGangs.map(gang => (
                    <option key={gang.id} value={gang.id}>
                      {gang.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Winner
                </label>
                <select 
                  className="w-full px-3 py-2 rounded-md border border-gray-300"
                  value={selectedWinner}
                  onChange={(e) => setSelectedWinner(e.target.value)}
                  disabled={isLoadingBattleData}
                >
                  <option value="">Select gang</option>
                  {availableGangs.map(gang => (
                    <option key={gang.id} value={gang.id}>
                      {gang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
          onClose={() => {
            setShowBattleModal(false);
            setSelectedScenario('');
            setSelectedAttacker('');
            setSelectedDefender('');
            setSelectedWinner('');
          }}
          onConfirm={handleAddBattle}
          confirmText="Save"
        />
      )}
    </div>
  );
} 