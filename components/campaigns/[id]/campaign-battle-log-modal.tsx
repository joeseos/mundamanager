"use client"

import { useState, useEffect, useMemo } from "react";
import { LuPlus } from "react-icons/lu";
import { HiX } from "react-icons/hi";
import Modal from "@/components/ui/modal";
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { createBattleLog, updateBattleLog, BattleLogParams } from "@/app/actions/campaigns/[id]/battle-logs";
import { useMutation } from '@tanstack/react-query';
import { Battle, BattleParticipant, CampaignGang, Territory as BaseTerritory, Scenario } from '@/types/campaign';
import { getClaimerGangId, getWinnerIds } from '@/utils/battle-winners';
import { useWinnerSelection } from '@/utils/hooks/use-winner-selection';

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

const reportCharLimit = 4096;

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
  localBattles: _localBattles,
  battleToEdit = null,
  userRole = 'MEMBER'
}: CampaignBattleLogModalProps) => {
  const [selectedScenario, setSelectedScenario] = useState('');
  const [customScenario, setCustomScenario] = useState('');
  const [gangsInBattle, setGangsInBattle] = useState<GangEntry[]>([
    { id: 1, gangId: "", role: 'none' },
    { id: 2, gangId: "", role: 'none' },
  ]);
  const [notes, setNotes] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoadingBattleData, setIsLoadingBattleData] = useState(false);
  const [selectedTerritory, setSelectedTerritory] = useState<string>('');
  const isReportOverLimit = notes.length > reportCharLimit;

  const selectedGangs = useMemo(
    () => gangsInBattle.filter((entry) => !!entry.gangId),
    [gangsInBattle]
  );

  const {
    winners,
    isDraw,
    claimedByGangId,
    setClaimedByGangId,
    activeWinners,
    hasAnyWinnerSelected,
    slotsToRender,
    canAddAnotherWinner,
    handleWinnerChange,
    addWinnerSlot,
    removeWinnerSlot,
    loadExistingWinners,
    removeGangFromWinners,
    resetWinnerSelection,
  } = useWinnerSelection({
    maxParticipants: selectedGangs.length,
    selectedTerritory,
  });
  
  const [battleDate, setBattleDate] = useState<string>(() => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  });
  const [cycle, setCycle] = useState<string>('');

  // Check if we're in edit mode
  const isEditMode = !!battleToEdit;

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

      // Derive attacker/defender from participants
      const attackerParticipant = battleData.participants.find(p => p.role === 'attacker');
      const defenderParticipant = battleData.participants.find(p => p.role === 'defender');

      // Derive winners + claimer from the flags we just attached to participants.
      const winnerIds = battleData.participants
        .filter((p) => p.is_winner === true)
        .map((p) => p.gang_id);
      const claimerId =
        battleData.participants.find((p) => p.claimed_territory === true)?.gang_id ?? null;
      const legacyWinnerId = claimerId ?? winnerIds[0] ?? null;

      // Create optimistic battle entry with full gang data
      const optimisticBattle: Battle = {
        id: `optimistic-battle-${Date.now()}`,
        created_at: battleData.created_at || new Date().toISOString(),
        scenario: battleData.scenario,
        scenario_name: battleData.scenario,
        winner_id: legacyWinnerId,
        note: battleData.note,
        participants: battleData.participants,
        campaign_territory_id: battleData.claimed_territories && battleData.claimed_territories.length > 0
          ? battleData.claimed_territories[0].campaign_territory_id
          : null,
        territory_name: territoryName,
        cycle: battleData.cycle,
        attacker: attackerParticipant ? {
          id: attackerParticipant.gang_id,
          name: getGangName(attackerParticipant.gang_id)
        } : undefined,
        defender: defenderParticipant ? {
          id: defenderParticipant.gang_id,
          name: getGangName(defenderParticipant.gang_id)
        } : undefined,
        winner: legacyWinnerId ? {
          id: legacyWinnerId,
          name: getGangName(legacyWinnerId)
        } : undefined,
        winners: winnerIds.map((id) => ({ id, name: getGangName(id) })),
        territory_claimer: claimerId
          ? { id: claimerId, name: getGangName(claimerId) }
          : null,
      };

      // Store the optimistic ID for replacement later
      const optimisticId = optimisticBattle.id;

      // Optimistically add to battles list using functional update for fresh state
      onBattleUpdate((currentBattles) => [...currentBattles, optimisticBattle]);

      return { optimisticId };
    },
    onSuccess: (result, _variables, context) => {
      // Replace optimistic entry with real server data if available
      if (result?.data && context?.optimisticId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.map(b =>
            b.id === context.optimisticId ? result.data : b
          )
        );
      }

      toast.success("Battle report added successfully");

      // Call onSuccess to trigger server refresh after optimistic update is complete
      onSuccess();
    },
    onError: (error, _variables, context) => {
      console.error('Battle creation failed:', error);

      // Rollback optimistic update using functional update
      if (context?.optimisticId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.filter(b => b.id !== context.optimisticId)
        );
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to create battle report';
      toast.error(errorMessage);
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

      // Derive attacker/defender from participants
      const attackerP = battleData.participants.find(p => p.role === 'attacker');
      const defenderP = battleData.participants.find(p => p.role === 'defender');

      // Derive winners + claimer from the flags.
      const winnerIds = battleData.participants
        .filter((p) => p.is_winner === true)
        .map((p) => p.gang_id);
      const claimerId =
        battleData.participants.find((p) => p.claimed_territory === true)?.gang_id ?? null;
      const legacyWinnerId = claimerId ?? winnerIds[0] ?? null;

      // Find and update the battle optimistically using functional update
      onBattleUpdate((currentBattles) =>
        currentBattles.map(battle => {
          if (battle.id === battleId) {
            return {
              ...battle,
              scenario: battleData.scenario,
              scenario_name: battleData.scenario,
              winner_id: legacyWinnerId,
              note: battleData.note,
              participants: battleData.participants,
              campaign_territory_id: battleData.claimed_territories && battleData.claimed_territories.length > 0
                ? battleData.claimed_territories[0].campaign_territory_id
                : null,
              territory_name: territoryName,
              cycle: battleData.cycle,
              updated_at: new Date().toISOString(),
              attacker: attackerP ? {
                id: attackerP.gang_id,
                name: getGangName(attackerP.gang_id)
              } : undefined,
              defender: defenderP ? {
                id: defenderP.gang_id,
                name: getGangName(defenderP.gang_id)
              } : undefined,
              winner: legacyWinnerId ? {
                id: legacyWinnerId,
                name: getGangName(legacyWinnerId)
              } : undefined,
              winners: winnerIds.map((id) => ({ id, name: getGangName(id) })),
              territory_claimer: claimerId
                ? { id: claimerId, name: getGangName(claimerId) }
                : null,
            };
          }
          return battle;
        })
      );

      return { battleId };
    },
    onSuccess: (result, _variables, context) => {
      // Replace with real server data if available
      if (result?.data && context?.battleId) {
        onBattleUpdate((currentBattles) =>
          currentBattles.map(b =>
            b.id === context.battleId ? result.data : b
          )
        );
      }

      toast.success("Battle report updated successfully");

      // Call onSuccess to trigger server refresh after optimistic update is complete
      onSuccess();
    },
    onError: (error) => {
      console.error('Battle update failed:', error);

      // For updates, we need to fetch the original data to rollback
      // Since we used functional updates, the state should be consistent
      // Just trigger a server refresh to get back to correct state
      onSuccess();

      const errorMessage = error instanceof Error ? error.message : 'Failed to update battle report';
      toast.error(errorMessage);
    }
  });

  // Compute isSubmitting from mutation states
  const isSubmitting = createBattleMutation.isPending || updateBattleMutation.isPending;

  // Load battle data when the modal opens
  useEffect(() => {
    let isMounted = true;

    if (isOpen && campaignId) {
      const fetchData = async () => {
        setIsLoadingBattleData(true);
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
              if (a.scenario_number === null) return 1;
              if (b.scenario_number === null) return -1;
              return a.scenario_number - b.scenario_number;
            });
            setScenarios(sortedScenarios);
          }
        } catch (error) {
          console.error('Error loading battle data:', error);
          if (isMounted) {
            toast.error("Failed to load battle data");
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
  }, [isOpen, campaignId]);

  // Populate form when modal opens with edit data and scenarios are loaded
  const [populatedForBattle, setPopulatedForBattle] = useState<string | null>(null);
  if (!isOpen && populatedForBattle !== null) {
    setPopulatedForBattle(null);
  }
  if (isOpen && battleToEdit && scenarios.length > 0 && battleToEdit.id !== populatedForBattle) {
    setPopulatedForBattle(battleToEdit.id);

    const matchingScenario = scenarios.find(s =>
      s.scenario_name === battleToEdit.scenario_name ||
      s.scenario_name === battleToEdit.scenario
    );

    if (matchingScenario) {
      setSelectedScenario(matchingScenario.id);
    } else {
      setSelectedScenario('custom');
      setCustomScenario(battleToEdit.scenario || battleToEdit.scenario_name || '');
    }

    if (battleToEdit.created_at) {
      const dt = new Date(battleToEdit.created_at);
      const tzOffsetMs = dt.getTimezoneOffset() * 60000;
      setBattleDate(new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10));
    }

    if (battleToEdit.cycle !== undefined && battleToEdit.cycle !== null) {
      setCycle(String(battleToEdit.cycle));
    } else {
      setCycle('');
    }

    const newGangsInBattle: GangEntry[] = [];
    let participants = battleToEdit.participants;
    if (participants && typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch (e) {
        console.error('Error parsing participants:', e);
        participants = [];
      }
    }

    if (participants && Array.isArray(participants) && participants.length > 0) {
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
      let idx = 1;
      if (battleToEdit.attacker?.id) {
        newGangsInBattle.push({ id: idx++, gangId: battleToEdit.attacker.id, role: 'attacker' });
      }
      if (battleToEdit.defender?.id) {
        newGangsInBattle.push({ id: idx++, gangId: battleToEdit.defender.id, role: 'defender' });
      }
    }

    if (newGangsInBattle.length === 0) {
      setGangsInBattle([
        { id: 1, gangId: "", role: 'none' },
        { id: 2, gangId: "", role: 'none' },
      ]);
    } else {
      while (newGangsInBattle.length < 2) {
        newGangsInBattle.push({ id: newGangsInBattle.length + 1, gangId: "", role: 'none' });
      }
      setGangsInBattle(newGangsInBattle);
    }

    const winnerIds = getWinnerIds(battleToEdit);
    loadExistingWinners({
      winnerIds,
      claimerId: getClaimerGangId(battleToEdit),
      isDraw: battleToEdit.winner_id === null && winnerIds.length === 0,
    });

    setNotes(battleToEdit.note || "");

    if (battleToEdit.campaign_territory_id) {
      const matched = territories.find(t => t.id === battleToEdit.campaign_territory_id);
      if (matched) setSelectedTerritory(matched.id);
    }
  }

  // Derive available territories from winner state
  const availableTerritories = useMemo(() => {
    if (territories.length === 0 || gangsInBattle.every(gang => !gang.gangId)) {
      return [] as BattleLogTerritory[];
    }
    return hasAnyWinnerSelected ? territories : ([] as BattleLogTerritory[]);
  }, [hasAnyWinnerSelected, gangsInBattle, territories]);

  // Clear selected territory when no territories are available (non-edit mode only)
  const [prevHasAvailable, setPrevHasAvailable] = useState(false);
  const hasAvailable = availableTerritories.length > 0;
  if (hasAvailable !== prevHasAvailable) {
    setPrevHasAvailable(hasAvailable);
    if (!hasAvailable && selectedTerritory && !isEditMode) {
      setSelectedTerritory('');
    }
  }

  const handleGangRoleChange = (gangEntryId: number, newRole: GangRole) => {
    setGangsInBattle(gangsInBattle.map(entry => 
      entry.id === gangEntryId 
        ? { ...entry, role: newRole } 
        : entry
    ));
  };

  const handleGangChange = (gangEntryId: number, gangId: string) => {
    setGangsInBattle((current) =>
      current.map((entry) => (
        entry.id === gangEntryId ? { ...entry, gangId, role: 'none' } : entry
      ))
    );
    // If the user changed away from a previously-selected gang, remove it from
    // the winners list so we don't keep dangling references.
    const previousGangId = gangsInBattle.find((g) => g.id === gangEntryId)?.gangId;
    if (previousGangId && previousGangId !== gangId) {
      removeGangFromWinners(previousGangId);
    }
  };

  const addGang = () => {
    const newId = Math.max(...gangsInBattle.map((g) => g.id)) + 1;
    setGangsInBattle([...gangsInBattle, { id: newId, gangId: "", role: 'none' }]);
  };

  const removeGang = (gangEntryId: number) => {
    if (gangsInBattle.length <= 2) return; // Keep at least 2 gangs
    const removedGangId = gangsInBattle.find((g) => g.id === gangEntryId)?.gangId;
    setGangsInBattle((current) => current.filter((entry) => entry.id !== gangEntryId));
    if (removedGangId) {
      removeGangFromWinners(removedGangId);
    }
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
      toast.error("Please select a scenario");
      return false;
    }
    
    if (selectedScenario === 'custom' && !customScenario.trim()) {
      toast.error("Please enter a custom scenario name");
      return false;
    }

    // Check if at least one gang is selected
    const anyGangSelected = gangsInBattle.some(g => g.gangId);
    
    if (!anyGangSelected) {
      toast.error("Please select at least one gang");
      return false;
    }

    // Find attacker and defender gangs
    const attackers = gangsInBattle.filter(g => g.role === 'attacker' && g.gangId);
    const defenders = gangsInBattle.filter(g => g.role === 'defender' && g.gangId);
    const gangsWithRole = gangsInBattle.filter(g => g.role !== 'none' && g.gangId);

    // If any gang has a role, ensure both attackers and defenders exist
    if (gangsWithRole.length > 0 && (attackers.length === 0 || defenders.length === 0)) {
      const missingRole = attackers.length === 0 ? 'attacker' : 'defender';
      toast.error(`Since you've assigned roles, please select at least one ${missingRole}`);
      return false;
    }

    if (!hasAnyWinnerSelected) {
      toast.error("Please select a winner");
      return false;
    }

    // Validate every active winner is one of the participating gangs
    const participantGangIds = new Set(
      gangsInBattle.filter((g) => g.gangId).map((g) => g.gangId)
    );
    if (!isDraw) {
      const invalidWinner = activeWinners.find((w) => !participantGangIds.has(w));
      if (invalidWinner) {
        toast.error("Each winner must be one of the selected gangs");
        return false;
      }
      // Defensive: detect duplicate winner slots
      const uniqueWinners = new Set(activeWinners);
      if (uniqueWinners.size !== activeWinners.length) {
        toast.error("The same gang cannot be selected as winner twice");
        return false;
      }
    }

    // Validate claimer when multi-winner + territory selected
    if (!isDraw && selectedTerritory && activeWinners.length > 1) {
      if (!claimedByGangId) {
        toast.error("Please select which winner claims the Territory");
        return false;
      }
      if (!activeWinners.includes(claimedByGangId)) {
        toast.error("The territory claimer must be one of the selected winners");
        return false;
      }
    }

    // Create a participants array for the new API structure, attaching
    // is_winner / claimed_territory flags. The server normaliser will treat
    // anything else as `false`.
    const claimerForPayload = isDraw
      ? null
      : selectedTerritory
        ? activeWinners.length > 1
          ? claimedByGangId
          : activeWinners[0] ?? null
        : null;
    const winnerSet = new Set(isDraw ? [] : activeWinners);
    const participants = gangsInBattle
      .filter(gang => gang.gangId)
      .map(gang => ({
        role: gang.role,
        gang_id: gang.gangId,
        is_winner: winnerSet.has(gang.gangId),
        claimed_territory: !!claimerForPayload && gang.gangId === claimerForPayload,
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

    // Validate and prepare cycle value
    let cycleValue: number | null = null;
    if (cycle) {
      const parsedCycle = parseInt(cycle, 10);
      if (!isNaN(parsedCycle) && parsedCycle > 0) {
        cycleValue = parsedCycle;
      }
    }

    // Prepare battle data for API.
    // The server derives `winner_id` from participants[].is_winner /
    // claimed_territory so we don't need to send it. `null` means "draw".
    const battleData: BattleLogParams = {
      scenario: scenarioName,
      winner_id: isDraw ? null : (claimerForPayload ?? activeWinners[0] ?? null),
      note: notes || null,
      participants: participants,
      claimed_territories: selectedTerritory
        ? [{
            campaign_territory_id: selectedTerritory
          }]
        : [],
      territory_claimed_by_gang_id: claimerForPayload,
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
    resetWinnerSelection();
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

    // Check the winner state: either Draw, or at least one valid winner.
    // Multi-winner battles with a claimed territory must also pick a claimer.
    const winnerValid = isDraw || activeWinners.length > 0;
    const claimerRequired = !isDraw && activeWinners.length > 1 && !!selectedTerritory;
    const claimerValid =
      !claimerRequired || (!!claimedByGangId && activeWinners.includes(claimedByGangId));

    // Check if cycle is valid (either empty or a positive number)
    const cycleValid = !cycle || (!isNaN(parseInt(cycle, 10)) && parseInt(cycle, 10) > 0);

    return scenarioValid && customScenarioValid && anyGangSelected && rolesValid && winnerValid && claimerValid && cycleValid;
  }, [
    selectedScenario,
    customScenario,
    gangsInBattle,
    isDraw,
    activeWinners,
    selectedTerritory,
    claimedByGangId,
    cycle,
  ]);

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
                        ...availableGangsForThisEntry.map(gang => buildGangComboboxOption(gang)),
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
            <div className="space-y-2">
              {Array.from({ length: slotsToRender }).map((_, slotIndex) => {
                const slotValue = isDraw && slotIndex === 0 ? 'draw' : (winners[slotIndex] ?? '');
                const isFirstSlot = slotIndex === 0;
                const excludedGangIds = new Set(
                  winners.filter((_, i) => i !== slotIndex && !!winners[i])
                );
                // Build per-slot options including the campaign-specific owner label.
                const gangOptions = selectedGangs
                  .filter((entry) => !excludedGangIds.has(entry.gangId))
                  .map((entry) => {
                    const gang = availableGangs.find((g) => g.id === entry.gangId);
                    return buildGangComboboxOption({
                      id: entry.gangId,
                      name: getGangName(entry.gangId),
                      gang_colour: gang?.gang_colour,
                      owner_username: gang?.owner_username,
                    });
                  });

                const baseOptions = isFirstSlot
                  ? [
                      { value: "", label: "No winner selected" },
                      { value: "draw", label: "Draw" },
                      ...gangOptions,
                    ]
                  : [
                      { value: "", label: "Select winner" },
                      ...gangOptions,
                    ];

                return (
                  <div key={`winner-slot-${slotIndex}`} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Combobox
                        value={slotValue}
                        onValueChange={(value) => handleWinnerChange(slotIndex, value)}
                        disabled={isLoadingBattleData}
                        placeholder={isFirstSlot ? "Select winner" : "Select another winner"}
                        options={baseOptions}
                      />
                    </div>
                    {slotIndex > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove winner"
                        onClick={() => removeWinnerSlot(slotIndex)}
                        disabled={isLoadingBattleData}
                      >
                        <HiX className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {canAddAnotherWinner && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={addWinnerSlot}
                  disabled={isLoadingBattleData}
                >
                  <LuPlus className="h-4 w-4" />
                  Add Winner
                </Button>
              )}
            </div>
          </div>

          {hasAnyWinnerSelected && availableTerritories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {isDraw ? "Contested Territory" : "Claimed Territory"}
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

              {!isDraw && activeWinners.length > 1 && selectedTerritory && (
                <>
                  <p className="mt-2 text-sm text-amber-600">
                    Only one winner can claim a Territory.
                  </p>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      Territory claimed by *
                    </label>
                    <Combobox
                      value={claimedByGangId}
                      onValueChange={setClaimedByGangId}
                      disabled={isLoadingBattleData}
                      placeholder="Select the claiming winner"
                      options={[
                        { value: "", label: "Select the claiming winner" },
                        ...activeWinners.map((gangId) => {
                          const gang = availableGangs.find((g) => g.id === gangId);
                          return buildGangComboboxOption({
                            id: gangId,
                            name: getGangName(gangId),
                            gang_colour: gang?.gang_colour,
                            owner_username: gang?.owner_username,
                          });
                        }),
                      ]}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Report</span>
              <span className={`text-sm ${isReportOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
                {notes.length}/{reportCharLimit} characters
              </span>
            </label>
            <Textarea
              placeholder="Add any additional details about the battle..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={reportCharLimit}
              className="min-h-[100px] bg-muted"
              disabled={isLoadingBattleData}
            />
          </div>
        </div>
      }
      onClose={handleClose}
      onConfirm={handleSaveBattle}
      confirmText={isEditMode ? "Update" : "Add Battle Report"}
      confirmDisabled={isLoadingBattleData || !formValid || isReportOverLimit}
    />
  );
};

export default CampaignBattleLogModal; 