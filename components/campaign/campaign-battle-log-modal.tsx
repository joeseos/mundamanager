"use client"

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

interface CampaignBattleLogModalProps {
  campaignId: string;
  availableGangs: CampaignGang[];
  territories?: Territory[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type GangRole = 'none' | 'attacker' | 'defender';

type GangEntry = {
  id: number;
  gangId: string;
  role: GangRole;
}

const CampaignBattleLogModal = ({
  campaignId,
  availableGangs,
  territories = [],
  isOpen,
  onClose,
  onSuccess
}: CampaignBattleLogModalProps) => {
  const [selectedScenario, setSelectedScenario] = useState('');
  const [gangsInBattle, setGangsInBattle] = useState<GangEntry[]>([
    { id: 1, gangId: "", role: 'none' },
    { id: 2, gangId: "", role: 'none' },
  ]);
  const [winner, setWinner] = useState('');
  const [notes, setNotes] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoadingBattleData, setIsLoadingBattleData] = useState(false);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>([]);
  const [availableTerritories, setAvailableTerritories] = useState<Territory[]>([]);
  const { toast } = useToast();

  // Load battle data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadBattleData();
    }
  }, [isOpen, campaignId]);

  // Update available territories when winner changes
  useEffect(() => {
    if (winner && winner !== "draw") {
      // Find territories controlled by losing gangs
      const losingGangIds = gangsInBattle
        .filter(gang => gang.gangId && gang.gangId !== winner)
        .map(gang => gang.gangId);

      const territoriesFromLosers = territories.filter(
        territory => territory.controlled_by && losingGangIds.includes(territory.controlled_by)
      );

      setAvailableTerritories(territoriesFromLosers);
    } else {
      setAvailableTerritories([]);
      setSelectedTerritories([]);
    }
  }, [winner, gangsInBattle, territories]);

  const loadBattleData = async () => {
    setIsLoadingBattleData(true);
    try {
      const response = await fetch('/api/campaigns/battles', {
        headers: {
          'X-Campaign-Id': campaignId
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch battle data');
      
      const data = await response.json();
      // Sort scenarios by scenario_number
      const sortedScenarios = [...data.scenarios].sort((a, b) => {
        // Handle null scenario_number (put them at the end)
        if (a.scenario_number === null) return 1;
        if (b.scenario_number === null) return -1;
        return a.scenario_number - b.scenario_number;
      });
      setScenarios(sortedScenarios);
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

  const handleGangRoleChange = (gangEntryId: number, newRole: GangRole) => {
    setGangsInBattle(gangsInBattle.map(entry => 
      entry.id === gangEntryId 
        ? { ...entry, role: newRole } 
        : entry
    ));
  };

  const handleGangChange = (gangEntryId: number, gangId: string) => {
    setGangsInBattle(gangsInBattle.map((entry) => (
      entry.id === gangEntryId ? { ...entry, gangId, role: 'none' } : entry
    )));
  };

  const addGang = () => {
    const newId = Math.max(...gangsInBattle.map((g) => g.id)) + 1;
    setGangsInBattle([...gangsInBattle, { id: newId, gangId: "", role: 'none' }]);
  };

  const removeGang = (gangEntryId: number) => {
    if (gangsInBattle.length <= 2) return; // Keep at least 2 gangs
    setGangsInBattle(gangsInBattle.filter((entry) => entry.id !== gangEntryId));
  };

  const toggleTerritory = (territoryId: string) => {
    setSelectedTerritories(prev =>
      prev.includes(territoryId) 
        ? prev.filter(id => id !== territoryId) 
        : [...prev, territoryId]
    );
  };

  const getGangName = (gangId: string): string => {
    const gang = availableGangs.find(g => g.id === gangId);
    return gang ? gang.name : '';
  };

  // Get the list of gangs that are already selected in other entries
  const getSelectedGangs = (excludeEntryId: number): string[] => {
    return gangsInBattle
      .filter(entry => entry.id !== excludeEntryId && entry.gangId)
      .map(entry => entry.gangId);
  };

  const handleAddBattle = async () => {
    // Validate required fields
    if (!selectedScenario) {
      toast({
        variant: "destructive",
        description: "Please select a scenario"
      });
      return false;
    }

    // Find attacker and defender gangs
    const attackers = gangsInBattle.filter(g => g.role === 'attacker' && g.gangId);
    const defenders = gangsInBattle.filter(g => g.role === 'defender' && g.gangId);

    if (attackers.length === 0) {
      toast({
        variant: "destructive",
        description: "Please select at least one attacker"
      });
      return false;
    }

    if (defenders.length === 0) {
      toast({
        variant: "destructive",
        description: "Please select at least one defender"
      });
      return false;
    }

    if (!winner) {
      toast({
        variant: "destructive",
        description: "Please select a winner"
      });
      return false;
    }

    try {
      // Create participants array for the new API structure
      const participants = [
        ...attackers.map(gang => ({ role: "attacker", gang_id: gang.gangId })),
        ...defenders.map(gang => ({ role: "defender", gang_id: gang.gangId }))
      ];

      // Get the scenario name for the selected scenario
      const selectedScenarioObj = scenarios.find(s => s.id === selectedScenario);
      const scenarioName = selectedScenarioObj 
        ? (selectedScenarioObj.scenario_number !== null
            ? `${selectedScenarioObj.scenario_name} (#${selectedScenarioObj.scenario_number})`
            : selectedScenarioObj.scenario_name)
        : '';

      // Post to the API endpoint
      const response = await fetch('/api/campaigns/battles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Campaign-Id': campaignId
        },
        body: JSON.stringify({
          scenario: scenarioName,
          attacker_id: attackers[0].gangId,
          defender_id: defenders[0].gangId,
          winner_id: winner === "draw" ? null : winner,
          note: notes || null,
          participants: participants,
          claimed_territories: selectedTerritories.length > 0 
            ? selectedTerritories.map(id => ({ territory_id: id })) 
            : []
        }),
      });

      if (!response.ok) throw new Error('Failed to create battle log');

      onSuccess();
      toast({
        description: "Battle log added successfully"
      });
      resetForm();
      return true;
    } catch (error) {
      console.error('Error creating battle log:', error);
      toast({
        variant: "destructive",
        description: "Failed to create battle log"
      });
      return false;
    }
  };

  const resetForm = () => {
    setSelectedScenario('');
    setGangsInBattle([
      { id: 1, gangId: "", role: 'none' },
      { id: 2, gangId: "", role: 'none' },
    ]);
    setWinner('');
    setNotes('');
    setSelectedTerritories([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Add Battle Log"
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scenario
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-gray-100"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select scenario</option>
              {scenarios.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.scenario_number !== null 
                    ? `(${scenario.scenario_number}) ${scenario.scenario_name}`
                    : scenario.scenario_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Gangs
            </label>
            {gangsInBattle.map((gangEntry) => {
              // Get list of gangs already selected in other entries
              const selectedGangs = getSelectedGangs(gangEntry.id);
              
              // Filter out already selected gangs for this dropdown
              const availableGangsForThisEntry = availableGangs.filter(
                gang => !selectedGangs.includes(gang.id)
              );
              
              return (
                <div key={gangEntry.id} className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <select
                      className="flex-1 px-3 py-2 rounded-md border border-gray-300 bg-gray-100"
                      value={gangEntry.gangId}
                      onChange={(e) => handleGangChange(gangEntry.id, e.target.value)}
                      disabled={isLoadingBattleData}
                    >
                      <option value="">Gang {gangEntry.id}</option>
                      {availableGangsForThisEntry.map((gang) => (
                        <option key={gang.id} value={gang.id}>
                          {gang.name}
                        </option>
                      ))}
                    </select>

                    {gangsInBattle.length > 2 && (
                      <button
                        onClick={() => removeGang(gangEntry.id)}
                        className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-gray-100"
                        disabled={isLoadingBattleData}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 ml-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`role-${gangEntry.id}-attacker`}
                        name={`role-${gangEntry.id}`}
                        checked={gangEntry.role === 'attacker'}
                        onChange={() => handleGangRoleChange(gangEntry.id, 'attacker')}
                        disabled={isLoadingBattleData || !gangEntry.gangId}
                        className="h-4 w-4 text-black focus:ring-black border-gray-300"
                      />
                      <Label htmlFor={`role-${gangEntry.id}-attacker`} className="text-sm">
                        Attacker
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`role-${gangEntry.id}-defender`}
                        name={`role-${gangEntry.id}`}
                        checked={gangEntry.role === 'defender'}
                        onChange={() => handleGangRoleChange(gangEntry.id, 'defender')}
                        disabled={isLoadingBattleData || !gangEntry.gangId}
                        className="h-4 w-4 text-black focus:ring-black border-gray-300"
                      />
                      <Label htmlFor={`role-${gangEntry.id}-defender`} className="text-sm">
                        Defender
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`role-${gangEntry.id}-none`}
                        name={`role-${gangEntry.id}`}
                        checked={gangEntry.role === 'none'}
                        onChange={() => handleGangRoleChange(gangEntry.id, 'none')}
                        disabled={isLoadingBattleData || !gangEntry.gangId}
                        className="h-4 w-4 text-black focus:ring-black border-gray-300"
                      />
                      <Label htmlFor={`role-${gangEntry.id}-none`} className="text-sm">
                        None
                      </Label>
                    </div>
                  </div>
                </div>
              );
            })}

            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={addGang} 
              disabled={isLoadingBattleData}
            >
              <Plus className="h-4 w-4" />
              Add Gang
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Winner
            </label>
            <select
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-gray-100"
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select winner</option>
              <option value="draw">Draw</option>
              {gangsInBattle.map((entry) => {
                if (!entry.gangId) return null;
                return (
                  <option key={entry.id} value={entry.gangId}>
                    {getGangName(entry.gangId)}
                  </option>
                );
              })}
            </select>
          </div>

          {winner && winner !== "draw" && availableTerritories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim Territories
              </label>
              <div className="border rounded-md p-3 space-y-2 bg-gray-50">
                {availableTerritories.map((territory) => {
                  const controlledBy = getGangName(territory.controlled_by || "");
                  return (
                    <div key={territory.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`territory-${territory.id}`}
                          checked={selectedTerritories.includes(territory.id)}
                          onChange={() => toggleTerritory(territory.id)}
                          disabled={isLoadingBattleData}
                          className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                        />
                        <Label htmlFor={`territory-${territory.id}`} className="text-sm">
                          {territory.name}
                          {controlledBy && (
                            <span className="text-gray-500 text-xs ml-1">({controlledBy})</span>
                          )}
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <Textarea
              placeholder="Add any additional details about the battle..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] bg-gray-100"
              disabled={isLoadingBattleData}
            />
          </div>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleAddBattle}
      confirmText="Save"
      confirmDisabled={isLoadingBattleData}
    />
  );
};

export default CampaignBattleLogModal; 