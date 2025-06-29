"use client"

import { useState, useEffect, useMemo } from "react";
import { Plus, X } from "lucide-react";
import Modal from "@/components/modal";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBattleLog, updateBattleLog, BattleLogParams } from "@/app/lib/battle-logs";

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
  scenario?: string;
  attacker_id?: string;
  defender_id?: string;
  winner_id?: string;
  note?: string | null;
  participants?: BattleParticipant[] | string;
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

interface CampaignBattleLogModalProps {
  campaignId: string;
  availableGangs: CampaignGang[];
  territories?: Territory[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  battleToEdit?: Battle | null;
  userRole?: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
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
  onSuccess,
  battleToEdit = null,
  userRole = 'MEMBER'
}: CampaignBattleLogModalProps) => {
  const [selectedScenario, setSelectedScenario] = useState('');
  const [customScenario, setCustomScenario] = useState('');
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

  // Check if we're in edit mode
  const isEditMode = !!battleToEdit;
  
  // Check if the user has admin permissions (OWNER or ARBITRATOR)
  const isAdmin = userRole === 'OWNER' || userRole === 'ARBITRATOR';
  
  // If in edit mode and the user is not admin, show an error and close the modal
  useEffect(() => {
    if (isOpen && isEditMode && !isAdmin) {
      toast({
        variant: "destructive",
        description: "You don't have permission to edit battle logs."
      });
      onClose();
    }
  }, [isOpen, isEditMode, isAdmin, onClose, toast]);

  // Load battle data when the modal opens
  useEffect(() => {
    let isMounted = true;
    
    if (isOpen && campaignId) {
      setIsLoadingBattleData(true);
      
      const fetchData = async () => {
        try {
          const response = await fetch('/api/campaigns/battles', {
            headers: {
              'X-Campaign-Id': campaignId
            }
          });
          
          if (!response.ok) throw new Error('Failed to fetch battle data');
          
          if (isMounted) {
            const data = await response.json();
            // Sort scenarios by scenario_number
            const sortedScenarios = [...data.scenarios].sort((a, b) => {
              // Handle null scenario_number (put them at the end)
              if (a.scenario_number === null) return 1;
              if (b.scenario_number === null) return -1;
              return a.scenario_number - b.scenario_number;
            });
            setScenarios(sortedScenarios);
          }
        } catch (error) {
          console.error('Error loading battle data:', error);
          if (isMounted) {
            toast({
              variant: "destructive",
              description: "Failed to load battle data"
            });
          }
        } finally {
          if (isMounted) {
            setIsLoadingBattleData(false);
          }
        }
      };
      
      fetchData();
    }
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, campaignId, toast]);

  useEffect(() => {
    if (isOpen && battleToEdit && scenarios.length > 0) {
      populateFormWithBattleData();
    }
  }, [isOpen, battleToEdit, scenarios]);

  // Populate a form with battle data when editing
  const populateFormWithBattleData = () => {
    if (!battleToEdit) return;
    
    // Set scenario
    // Look for a matching scenario in the list
    const matchingScenario = scenarios.find(s => 
      s.scenario_name === battleToEdit.scenario_name || 
      s.scenario_name === battleToEdit.scenario
    );
    
    if (matchingScenario) {
      setSelectedScenario(matchingScenario.id);
    } else {
      // If no matching scenario, set as custom
      setSelectedScenario('custom');
      setCustomScenario(battleToEdit.scenario || battleToEdit.scenario_name || '');
    }
    
    // Set gangs and roles
    const newGangsInBattle: GangEntry[] = [];
    
    // Parse participants if it's a string
    let participants = battleToEdit.participants;
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
      // Add gangs with roles from participants
      participants.forEach((participant: BattleParticipant, index: number) => {
        if (participant.gang_id) {
          newGangsInBattle.push({
            id: index + 1,
            gangId: participant.gang_id,
            role: participant.role as GangRole
          });
        }
      });
    } else {
      // Fallback to old data structure
      let idx = 1;
      
      if (battleToEdit.attacker_id || battleToEdit.attacker?.gang_id) {
        const gangId = battleToEdit.attacker?.gang_id || battleToEdit.attacker_id || '';
        if (gangId) {
          newGangsInBattle.push({
            id: idx++,
            gangId,
            role: 'attacker'
          });
        }
      }
      
      if (battleToEdit.defender_id || battleToEdit.defender?.gang_id) {
        const gangId = battleToEdit.defender?.gang_id || battleToEdit.defender_id || '';
        if (gangId) {
          newGangsInBattle.push({
            id: idx++,
            gangId,
            role: 'defender'
          });
        }
      }
    }
    
    // If no gangs were added, use default
    if (newGangsInBattle.length === 0) {
      setGangsInBattle([
        { id: 1, gangId: "", role: 'none' },
        { id: 2, gangId: "", role: 'none' },
      ]);
    } else {
      // Ensure at least 2 gang entries
      while (newGangsInBattle.length < 2) {
        newGangsInBattle.push({
          id: newGangsInBattle.length + 1,
          gangId: "",
          role: 'none'
        });
      }
      setGangsInBattle(newGangsInBattle);
    }
    
    // Set winner
    if (battleToEdit.winner_id === null) {
      setWinner("draw");
    } else if (battleToEdit.winner_id) {
      setWinner(battleToEdit.winner_id);
    } else if (battleToEdit.winner?.gang_id) {
      setWinner(battleToEdit.winner.gang_id);
    } else {
      setWinner("");
    }
    
    // Set notes
    setNotes(battleToEdit.note || "");
  };

  // Update available territories when winner changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Skip the effect if territories aren't loaded yet or gangsInBattle doesn't have valid entries
    if (territories.length === 0 || gangsInBattle.every(gang => !gang.gangId)) {
      return;
    }

    // Define what the new available territories should be
    let newAvailableTerritories: Territory[] = [];
    
    if (winner && winner !== "draw") {
      // Find territories controlled by losing gangs
      const losingGangIds = gangsInBattle
        .filter(gang => gang.gangId && gang.gangId !== winner)
        .map(gang => gang.gangId);

      newAvailableTerritories = territories.filter(
        territory => territory.controlled_by && losingGangIds.includes(territory.controlled_by)
      );
    }
    
    // Compare by value using JSON.stringify to avoid infinite loops
    const currentTerritoriesJSON = JSON.stringify(availableTerritories.map(t => t.id).sort());
    const newTerritoriesJSON = JSON.stringify(newAvailableTerritories.map(t => t.id).sort());
    
    if (currentTerritoriesJSON !== newTerritoriesJSON) {
      setAvailableTerritories(newAvailableTerritories);
      
      // Clear selected territories if none are available
      if (newAvailableTerritories.length === 0 && selectedTerritories.length > 0) {
        setSelectedTerritories([]);
      }
    }
  }, [winner, gangsInBattle, territories]); // Don't include availableTerritories or selectedTerritories here

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

  const handleSaveBattle = async () => {
    // Prevent non-admin users from updating existing battles
    if (isEditMode && !isAdmin) {
      toast({
        variant: "destructive",
        description: "You don't have permission to edit battle logs."
      });
      return false;
    }
    
    // Validate required fields
    if (selectedScenario === '') {
      toast({
        variant: "destructive",
        description: "Please select a scenario"
      });
      return false;
    }
    
    if (selectedScenario === 'custom' && !customScenario.trim()) {
      toast({
        variant: "destructive",
        description: "Please enter a custom scenario name"
      });
      return false;
    }

    // Check if at least one gang is selected
    const anyGangSelected = gangsInBattle.some(g => g.gangId);
    
    if (!anyGangSelected) {
      toast({
        variant: "destructive",
        description: "Please select at least one gang"
      });
      return false;
    }

    // Find attacker and defender gangs
    const attackers = gangsInBattle.filter(g => g.role === 'attacker' && g.gangId);
    const defenders = gangsInBattle.filter(g => g.role === 'defender' && g.gangId);
    const gangsWithRole = gangsInBattle.filter(g => g.role !== 'none' && g.gangId);

    // If any gang has a role, ensure both attackers and defenders exist
    if (gangsWithRole.length > 0 && (attackers.length === 0 || defenders.length === 0)) {
      const missingRole = attackers.length === 0 ? 'attacker' : 'defender';
      toast({
        variant: "destructive",
        description: `Since you've assigned roles, please select at least one ${missingRole}`
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
      // Create a participants array for the new API structure
      const participants = gangsInBattle
        .filter(gang => gang.gangId)
        .map(gang => ({ 
          role: gang.role, 
          gang_id: gang.gangId 
        }));

      // Get the scenario name for the selected scenario
      let scenarioName = '';
      if (selectedScenario === 'custom') {
        scenarioName = customScenario.trim();
      } else {
        const selectedScenarioObj = scenarios.find(s => s.id === selectedScenario);
        scenarioName = selectedScenarioObj 
          ? selectedScenarioObj.scenario_name
          : '';
      }

      // Get a default attacker/defender if needed for the API
      const firstGangId = gangsInBattle.find(g => g.gangId)?.gangId || '';

      // Prepare battle data for API
      const battleData: BattleLogParams = {
        scenario: scenarioName,
        attacker_id: attackers.length > 0 ? attackers[0].gangId : firstGangId,
        defender_id: defenders.length > 0 ? defenders[0].gangId : firstGangId,
        winner_id: winner === "draw" ? null : winner,
        note: notes || null,
        participants: participants,
        claimed_territories: selectedTerritories.length > 0 
          ? selectedTerritories.map(id => ({ territory_id: id })) 
          : []
      };

      // Create or update battle based on mode
      if (isEditMode && battleToEdit) {
        await updateBattleLog(campaignId, battleToEdit.id, battleData);
        toast({
          description: "Battle report updated successfully"
        });
      } else {
        await createBattleLog(campaignId, battleData);
        toast({
          description: "Battle report added successfully"
        });
      }

      onSuccess();
      resetForm();
      return true;
    } catch (error) {
      console.error(isEditMode ? 'Error updating battle report:' : 'Error creating battle report:', error);
      toast({
        variant: "destructive",
        description: isEditMode ? "Failed to update battle report" : "Failed to create battle report"
      });
      return false;
    }
  };

  const resetForm = () => {
    setSelectedScenario('');
    setCustomScenario('');
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

  // Check if form is valid using useMemo to avoid unnecessary recalculations
  const formValid = useMemo(() => {
    // Check if a scenario is selected
    const scenarioValid = selectedScenario !== '';
    
    // Check if custom scenario has text (when custom is selected)
    const customScenarioValid = selectedScenario !== 'custom' || 
      (selectedScenario === 'custom' && customScenario.trim() !== '');
    
    // Check if at least one gang is selected
    const anyGangSelected = gangsInBattle.some(g => g.gangId);
    
    // Find gangs with roles
    const attackers = gangsInBattle.filter(g => g.role === 'attacker' && g.gangId);
    const defenders = gangsInBattle.filter(g => g.role === 'defender' && g.gangId);
    const gangsWithRole = gangsInBattle.filter(g => g.role !== 'none' && g.gangId);
    
    // If any gang has a role, both attackers and defenders should exist
    const rolesValid = gangsWithRole.length === 0 || 
      (gangsWithRole.length > 0 && attackers.length > 0 && defenders.length > 0);
    
    // Check if a winner is selected
    const winnerValid = !!winner;
    
    return scenarioValid && customScenarioValid && anyGangSelected && rolesValid && winnerValid;
  }, [selectedScenario, customScenario, gangsInBattle, winner]);

  if (!isOpen) return null;

  return (
    <Modal
      title={isEditMode ? "Edit Battle Report" : "Add Battle Report"}
      helper="Fields marked with * are required."
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scenario *
            </label>
            <select 
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-gray-100"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              disabled={isLoadingBattleData}
            >
              <option value="">Select scenario</option>
              <option value="custom">Custom scenario</option>
              {scenarios.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.scenario_number !== null 
                    ? `${scenario.scenario_number}. ${scenario.scenario_name}`
                    : scenario.scenario_name}
                </option>
              ))}
            </select>
            
            {selectedScenario === 'custom' && (
              <div className="mt-2">
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 bg-gray-100"
                  placeholder="Enter custom scenario name"
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  disabled={isLoadingBattleData}
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Gangs *
            </label>
            {gangsInBattle.map((gangEntry) => {
              // Get list of gangs already selected in other entries
              const selectedGangs = getSelectedGangs(gangEntry.id);
              
              // Filter out already selected gangs for this dropdown
              const availableGangsForThisEntry = availableGangs.filter(
                gang => !selectedGangs.includes(gang.id) || gang.id === gangEntry.gangId
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
              Winner *
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
              Report
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
      onConfirm={handleSaveBattle}
      confirmText={isEditMode ? "Update" : "Save"}
      confirmDisabled={isLoadingBattleData || !formValid}
    />
  );
};

export default CampaignBattleLogModal; 