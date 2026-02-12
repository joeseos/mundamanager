"use client"

import { useState, useEffect, useMemo, useCallback } from "react";
import { LuPlus } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { createBattleLog, updateBattleLog, BattleLogParams } from "@/app/actions/campaigns/[id]/battle-logs";
import { useMutation } from '@tanstack/react-query';
import { Battle, BattleParticipant, CampaignGang, Territory as BaseTerritory, Scenario } from '@/types/campaign';

interface BattleLogTerritory extends BaseTerritory {
  default_gang_territory?: boolean;
}

interface CampaignBattleLogModalProps {
  campaignId: string;
  availableGangs: CampaignGang[];
  territories?: BattleLogTerritory[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onBattleUpdate: (updatedBattles: Battle[] | ((prevBattles: Battle[]) => Battle[])) => void;
  localBattles: Battle[];
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
  onBattleUpdate,
  localBattles,
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
  const [selectedTerritory, setSelectedTerritory] = useState<string>('');
  const [availableTerritories, setAvailableTerritories] = useState<BattleLogTerritory[]>([]);
  const { toast } = useToast();
  const [battleDate, setBattleDate] = useState<string>(() => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  });
  const [cycle, setCycle] = useState<string>('');

  // Check if we're in edit mode
  const isEditMode = !!battleToEdit;

  // Check if the user has admin permissions (OWNER or ARBITRATOR)
  const isAdmin = userRole === 'OWNER' || userRole === 'ARBITRATOR';

  // Helper to get gang name by ID - extracted to avoid duplication
  const getGangName = (gangId: string | null | undefined) => {
    if (!gangId) return 'Unknown';
    const gang = availableGangs.find(g => g.id === gangId);
    return gang?.name || 'Unknown';
  };

  // Helper to get territory name - supports both name and territory_name
  const getTerritoryName = (territoryId: string) => {
    const territory = territories.find(t => t.id === territoryId);
    return territory?.name || territory?.territory_name;
  };

  // TanStack Query mutations for create and update
  const createBattleMutation = useMutation({
    mutationFn: async (battleData: BattleLogParams) => {
      const result = await createBattleLog(campaignId, battleData);
      return result;
    },
    onMutate: async (battleData) => {
      // Find territory name if selected
      let territoryName: string | undefined = undefined;
      if (battleData.claimed_territories && battleData.claimed_territories.length > 0) {
        const territoryId = battleData.claimed_territories[0].campaign_territory_id;
        territoryName = getTerritoryName(territoryId);
      }

      // Create optimistic battle entry with full gang data
      const optimisticBattle: Battle = {
        id: `optimistic-battle-${Date.now()}`,
        created_at: battleData.created_at || new Date().toISOString(),
        scenario: battleData.scenario,
        scenario_name: battleData.scenario,
        attacker_id: battleData.attacker_id,
        defender_id: battleData.defender_id,
        winner_id: battleData.winner_id,
        note: battleData.note,
        participants: battleData.participants,
        territory_id: battleData.territory_id,
        custom_territory_id: battleData.custom_territory_id,
        territory_name: territoryName,
        cycle: battleData.cycle,
        // Add full gang objects for display
        attacker: battleData.attacker_id ? {
          id: battleData.attacker_id,
          name: getGangName(battleData.attacker_id)
        } : undefined,
        defender: battleData.defender_id ? {
          id: battleData.defender_id,
          name: getGangName(battleData.defender_id)
        } : undefined,
        winner: battleData.winner_id ? {
          id: battleData.winner_id,
          name: getGangName(battleData.winner_id)
        } : undefined
      };

      // Store the optimistic ID for replacement later
      const optimisticId = optimisticBattle.id;

      // Optimistically add to battles list using functional update for fresh state
      onBattleUpdate((currentBattles) => [...currentBattles, optimisticBattle]);

      return { optimisticId };
    },
    onSuccess: (result, variables, context) => {
      // Replace optimistic entry with real server data if available
      if (result?.data && context?.optimisticId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.map(b =>
            b.id === context.optimisticId ? result.data : b
          )
        );
      }

      toast({
        description: "Battle report added successfully"
      });

      // Call onSuccess to trigger server refresh after optimistic update is complete
      onSuccess();
    },
    onError: (error, variables, context) => {
      console.error('Battle creation failed:', error);

      // Rollback optimistic update using functional update
      if (context?.optimisticId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.filter(b => b.id !== context.optimisticId)
        );
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to create battle report';
      toast({
        variant: "destructive",
        description: errorMessage
      });
    }
  });

  const updateBattleMutation = useMutation({
    mutationFn: async ({ battleId, battleData }: { battleId: string, battleData: BattleLogParams }) => {
      const result = await updateBattleLog(campaignId, battleId, battleData);
      return result;
    },
    onMutate: async ({ battleId, battleData }) => {
      // Find territory name if selected
      let territoryName: string | undefined = undefined;
      if (battleData.claimed_territories && battleData.claimed_territories.length > 0) {
        const territoryId = battleData.claimed_territories[0].campaign_territory_id;
        territoryName = getTerritoryName(territoryId);
      }

      // Find and update the battle optimistically using functional update
      onBattleUpdate((currentBattles) =>
        currentBattles.map(battle => {
          if (battle.id === battleId) {
            return {
              ...battle,
              scenario: battleData.scenario,
              scenario_name: battleData.scenario,
              attacker_id: battleData.attacker_id,
              defender_id: battleData.defender_id,
              winner_id: battleData.winner_id,
              note: battleData.note,
              participants: battleData.participants,
              territory_id: battleData.territory_id,
              custom_territory_id: battleData.custom_territory_id,
              territory_name: territoryName,
              cycle: battleData.cycle,
              updated_at: new Date().toISOString(),
              // Update full gang objects for display
              attacker: battleData.attacker_id ? {
                id: battleData.attacker_id,
                name: getGangName(battleData.attacker_id)
              } : undefined,
              defender: battleData.defender_id ? {
                id: battleData.defender_id,
                name: getGangName(battleData.defender_id)
              } : undefined,
              winner: battleData.winner_id ? {
                id: battleData.winner_id,
                name: getGangName(battleData.winner_id)
              } : undefined
            };
          }
          return battle;
        })
      );

      return { battleId };
    },
    onSuccess: (result, variables, context) => {
      // Replace with real server data if available
      if (result?.data && context?.battleId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.map(b =>
            b.id === context.battleId ? result.data : b
          )
        );
      }

      toast({
        description: "Battle report updated successfully"
      });

      // Call onSuccess to trigger server refresh after optimistic update is complete
      onSuccess();
    },
    onError: (error, variables, context) => {
      console.error('Battle update failed:', error);

      // For updates, we need to fetch the original data to rollback
      // Since we used functional updates, the state should be consistent
      // Just trigger a server refresh to get back to correct state
      onSuccess();

      const errorMessage = error instanceof Error ? error.message : 'Failed to update battle report';
      toast({
        variant: "destructive",
        description: errorMessage
      });
    }
  });

  // Compute isSubmitting from mutation states
  const isSubmitting = createBattleMutation.isPending || updateBattleMutation.isPending;

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

  // Populate a form with battle data when editing
  const populateFormWithBattleData = useCallback(() => {
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
    
    // Prefill date from created_at
    if (battleToEdit.created_at) {
      const dt = new Date(battleToEdit.created_at);
      const tzOffsetMs = dt.getTimezoneOffset() * 60000;
      setBattleDate(new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10));
    }

    // Set cycle
    if (battleToEdit.cycle !== undefined && battleToEdit.cycle !== null) {
      setCycle(String(battleToEdit.cycle));
    } else {
      setCycle('');
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
      
      if (battleToEdit.attacker_id || battleToEdit.attacker?.id) {
        const gangId = battleToEdit.attacker?.id || battleToEdit.attacker_id || '';
        if (gangId) {
          newGangsInBattle.push({
            id: idx++,
            gangId,
            role: 'attacker'
          });
        }
      }

      if (battleToEdit.defender_id || battleToEdit.defender?.id) {
        const gangId = battleToEdit.defender?.id || battleToEdit.defender_id || '';
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
    } else if (battleToEdit.winner?.id) {
      setWinner(battleToEdit.winner.id);
    } else {
      setWinner("");
    }
    
    // Set notes
    setNotes(battleToEdit.note || "");

    // Set territory if the battle has one
    if (battleToEdit.territory_id || battleToEdit.custom_territory_id) {
      const matchedTerritory = territories.find(t =>
        (battleToEdit.territory_id && t.territory_id === battleToEdit.territory_id) ||
        (battleToEdit.custom_territory_id && t.custom_territory_id === battleToEdit.custom_territory_id)
      );

      if (matchedTerritory) {
        setSelectedTerritory(matchedTerritory.id);
      }
    }
  }, [battleToEdit, scenarios, territories]);

  useEffect(() => {
    if (isOpen && battleToEdit && scenarios.length > 0) {
      populateFormWithBattleData();
    }
  }, [isOpen, battleToEdit, scenarios, populateFormWithBattleData]);

  // Update available territories when winner changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Skip the effect if territories aren't loaded yet or gangsInBattle doesn't have valid entries
    if (territories.length === 0 || gangsInBattle.every(gang => !gang.gangId)) {
      return;
    }

    // Define what the new available territories should be
    let newAvailableTerritories: BattleLogTerritory[] = [];

    if (winner && winner !== "draw") {
      // Show ALL territories - players can challenge over any territory
      newAvailableTerritories = territories;
    }
    
    // Compare by value using JSON.stringify to avoid infinite loops
    const currentTerritoriesJSON = JSON.stringify(availableTerritories.map(t => t.id).sort());
    const newTerritoriesJSON = JSON.stringify(newAvailableTerritories.map(t => t.id).sort());
    
    if (currentTerritoriesJSON !== newTerritoriesJSON) {
      setAvailableTerritories(newAvailableTerritories);

      // Don't clear selected territory in edit mode (preserve what was claimed)
      if (newAvailableTerritories.length === 0 && selectedTerritory && !isEditMode) {
        setSelectedTerritory('');
      }
    }
  }, [winner, gangsInBattle, territories]); // Don't include availableTerritories or selectedTerritory here

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

  // Get the list of gangs that are already selected in other entries
  const getSelectedGangs = (excludeEntryId: number): string[] => {
    return gangsInBattle
      .filter(entry => entry.id !== excludeEntryId && entry.gangId)
      .map(entry => entry.gangId);
  };

  const handleSaveBattle = async () => {
    // Guard against double-click
    if (isSubmitting) return false;

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

    // Validate and prepare cycle value
    let cycleValue: number | null = null;
    if (cycle) {
      const parsedCycle = parseInt(cycle, 10);
      if (!isNaN(parsedCycle) && parsedCycle > 0) {
        cycleValue = parsedCycle;
      }
    }

    // Prepare battle data for API
    const battleData: BattleLogParams = {
      scenario: scenarioName,
      attacker_id: attackers.length > 0 ? attackers[0].gangId : (gangsInBattle[0]?.gangId || firstGangId),
      defender_id: defenders.length > 0 ? defenders[0].gangId : (gangsInBattle[1]?.gangId || gangsInBattle[0]?.gangId || firstGangId),
      winner_id: winner === "draw" ? null : winner,
      note: notes || null,
      participants: participants,
      claimed_territories: selectedTerritory
        ? [{
            campaign_territory_id: selectedTerritory
          }]
        : [],
      created_at: new Date(battleDate + 'T00:00:00').toISOString(),
      cycle: cycleValue
    };

    // Close modal immediately for instant UX
    onClose();
    resetForm();

    // Create or update battle based on mode using mutations
    if (isEditMode && battleToEdit) {
      updateBattleMutation.mutate({ battleId: battleToEdit.id, battleData });
    } else {
      createBattleMutation.mutate(battleData);
    }

    return true;
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
    setSelectedTerritory('');
    setCycle('');
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    setBattleDate(new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10));
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

    // Check if cycle is valid (either empty or a positive number)
    const cycleValid = !cycle || (!isNaN(parseInt(cycle, 10)) && parseInt(cycle, 10) > 0);

    return scenarioValid && customScenarioValid && anyGangSelected && rolesValid && winnerValid && cycleValid;
  }, [selectedScenario, customScenario, gangsInBattle, winner, cycle]);

  if (!isOpen) return null;

  return (
    <Modal
      title={isEditMode ? "Edit Battle Report" : "Add Battle Report"}
      helper="Fields marked with * are required."
      content={
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Date *
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border border-border bg-muted"
              value={battleDate}
              onChange={(e) => setBattleDate(e.target.value)}
              disabled={isLoadingBattleData}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Cycle
            </label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-md border border-border bg-muted"
              placeholder="Enter cycle number (optional)"
              value={cycle}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string or only positive integers
                if (value === '') {
                  setCycle(value);
                } else {
                  const numValue = parseInt(value, 10);
                  if (!isNaN(numValue) && numValue > 0 && !value.includes('-') && !value.includes('.')) {
                    setCycle(value);
                  }
                }
              }}
              disabled={isLoadingBattleData}
              min="1"
              onKeyDown={(e) => {
                // Prevent entering minus, plus, period, and 'e' (scientific notation)
                if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Scenario *
            </label>
            <Combobox
              options={[
                { value: 'custom', label: 'Custom' },
                ...scenarios.map(scenario => ({
                  value: scenario.id,
                  label: scenario.scenario_number !== null 
                    ? `${scenario.scenario_number}. ${scenario.scenario_name}`
                    : scenario.scenario_name
                }))
              ]}
              value={selectedScenario === 'custom' ? 'custom' : selectedScenario}
              onValueChange={(value) => {
                if (value === 'custom') {
                  setSelectedScenario('custom');
                  setCustomScenario('');
                } else {
                  // Check if the value is a custom scenario (not in the options list)
                  const isCustomValue = !scenarios.some(scenario => scenario.id === value);
                  
                  if (isCustomValue) {
                    setSelectedScenario('custom');
                    setCustomScenario(value);
                  } else {
                    setSelectedScenario(value);
                    setCustomScenario('');
                  }
                }
              }}
              placeholder="Select or search for a Scenario..."
              disabled={isLoadingBattleData}
              allowCustom={true}
            />
            
            {selectedScenario === 'custom' && (
              <div className="mt-2">
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted"
                  placeholder="Enter custom Scenario name"
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  disabled={isLoadingBattleData}
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-muted-foreground">
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
                    <Combobox
                      className="flex-1"
                      value={gangEntry.gangId}
                      onValueChange={(value) => handleGangChange(gangEntry.id, value)}
                      disabled={isLoadingBattleData}
                      placeholder="Select a Gang"
                      options={[
                        { value: "", label: "No gang selected" },
                        ...availableGangsForThisEntry.map((gang) => {
                          const owner = gang.owner_username ? ` • ${gang.owner_username}` : "";
                          const displayValue = `${gang.name}${owner}`;
                          return {
                            value: gang.id,
                            label: owner ? (
                              <span>
                                <span>{gang.name}</span>
                                <span className="text-xs text-muted-foreground">{owner}</span>
                              </span>
                            ) : gang.name,
                            displayValue,
                          };
                        }),
                      ]}
                    />

                    {gangsInBattle.length > 2 && (
                      <button
                        onClick={() => removeGang(gangEntry.id)}
                        className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted"
                        disabled={isLoadingBattleData}
                      >
                        <HiX className="h-4 w-4" />
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
                        className="h-4 w-4 text-foreground focus:ring-black border-border"
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
                        className="h-4 w-4 text-foreground focus:ring-black border-border"
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
                        className="h-4 w-4 text-foreground focus:ring-black border-border"
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
              <LuPlus className="h-4 w-4" />
              Add Gang
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Winner *
            </label>
            <Combobox
              value={winner}
              onValueChange={setWinner}
              disabled={isLoadingBattleData}
              placeholder="Select winner"
              options={[
                { value: "", label: "No winner selected" },
                { value: "draw", label: "Draw" },
                ...gangsInBattle
                  .filter((entry) => !!entry.gangId)
                  .map((entry) => {
                    const gang = availableGangs.find(g => g.id === entry.gangId);
                    const gangName = getGangName(entry.gangId);
                    const owner = gang?.owner_username ? ` • ${gang.owner_username}` : "";
                    const displayValue = `${gangName}${owner}`;
                    return {
                      value: entry.gangId,
                      label: owner ? (
                        <span>
                          <span>{gangName}</span>
                          <span className="text-xs text-muted-foreground">{owner}</span>
                        </span>
                      ) : gangName,
                      displayValue,
                    };
                  }),
              ]}
            />
          </div>

          {winner && winner !== "draw" && availableTerritories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Claimed Territory
              </label>
              <Combobox
                value={selectedTerritory}
                onValueChange={setSelectedTerritory}
                disabled={isLoadingBattleData}
                placeholder="Select or search for a Territory..."
                options={[
                  { value: "", label: "No territory claimed" },
                  ...availableTerritories
                    .filter((territory) => !territory.default_gang_territory)
                    .slice()
                    .sort((a, b) => {
                      const nameA = (a.name ?? a.territory_name ?? "").toLocaleLowerCase();
                      const nameB = (b.name ?? b.territory_name ?? "").toLocaleLowerCase();
                      return nameA.localeCompare(nameB);
                    })
                    .map((territory) => {
                      const displayName = territory.name ?? territory.territory_name ?? "";
                      const controlledBy = territory.controlled_by ? getGangName(territory.controlled_by) : null;
                      const statusLabel = controlledBy ? ` (Held by ${controlledBy})` : " (Unclaimed)";

                      return {
                        value: territory.id,
                        label: (
                          <span>
                            <span>{displayName}</span><span className="text-xs text-muted-foreground">{statusLabel}</span>
                          </span>
                        ),
                        displayValue: `${displayName}${statusLabel}`,
                      };
                    }),
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Report
            </label>
            <Textarea
              placeholder="Add any additional details about the battle..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] bg-muted"
              disabled={isLoadingBattleData}
            />
          </div>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleSaveBattle}
      confirmText={isEditMode ? "Update" : "Add Battle Report"}
      confirmDisabled={isLoadingBattleData || !formValid}
    />
  );
};

export default CampaignBattleLogModal; 