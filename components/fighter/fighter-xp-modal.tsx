'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from "@/components/ui/modal";
import { Plus, Minus } from "lucide-react";
import { useMutation } from '@tanstack/react-query';
import { updateFighterXpWithOoa } from '@/app/actions/edit-fighter';
import { useToast } from "@/components/ui/use-toast";

interface XpCase {
  id: string;
  label: string;
  xp: number;
  onSelectText?: (count: number) => string;
}

interface FighterXpModalProps {
  isOpen: boolean;
  fighterId: string;
  currentXp: number;
  currentTotalXp: number;
  currentKills: number;
  currentKillCount?: number;
  is_spyrer?: boolean;
  onClose: () => void;
  onXpUpdated: (newXp: number, newTotalXp: number, newKills: number, newKillCount?: number) => void;
}

export function FighterXpModal({
  isOpen,
  fighterId,
  currentXp,
  currentTotalXp,
  currentKills,
  currentKillCount = 0,
  is_spyrer = false,
  onClose,
  onXpUpdated
}: FighterXpModalProps) {
  const { toast } = useToast();
  const fighterXpMutation = useMutation({
    mutationFn: updateFighterXpWithOoa,
    onError: (error) => {
      console.error('Fighter XP mutation failed:', error)
    },
  });
  
  // Internal state for XP amount and errors
  const [xpAmount, setXpAmount] = useState('');
  const [xpError, setXpError] = useState('');
  // Define XP "events" for the checkbox list
  const xpCountCases: XpCase[] = [
    { id: 'seriousInjury', label: 'Cause Serious Injury', xp: 1 },
    { id: 'outOfAction', label: 'Cause OOA', xp: 2, onSelectText: (count) => `⚠️ Adds ${count} to the OOA count` },
    { id: 'leaderChampionBonus', label: 'Leader/Champion', xp: 1 },
    { id: 'vehicleWrecked', label: 'Wreck Vehicle', xp: 2 },
    { id: 'rally', label: 'Successful Rally', xp: 1 },
    { id: 'assistance', label: 'Provide Assistance', xp: 1 },
    { id: 'misc', label: 'Misc.', xp: 1 },
  ];

  const xpCheckboxCases: XpCase[] = [
    { id: 'battleParticipation', label: 'Battle Participation', xp: 1 },
  ];

  // Track which of these XP events are checked
  const [xpCounts, setXpCounts] = useState<Record<string, number>>(
    xpCountCases.reduce((acc, xpCase) => {
      acc[xpCase.id] = 0;
      return acc;
    }, {} as Record<string, number>)
  );

  const [xpCheckboxes, setXpCheckboxes] = useState<Record<string, boolean>>(
    xpCheckboxCases.reduce((acc, xpCase) => {
      acc[xpCase.id] = false;
      return acc;
    }, {} as Record<string, boolean>)
  );

  // Handle toggling a checkbox
  const handleXpCheckboxChange = (id: string) => {
    setXpCheckboxes(prev => {
      // Clone current state
      const newState = { ...prev };

      // Toggle the clicked checkbox
      newState[id] = !prev[id];

      // If they clicked seriousInjury, uncheck outOfAction
      if (id === 'seriousInjury' && newState.seriousInjury) {
        newState.outOfAction = false;
      }
      // If they clicked outOfAction, uncheck seriousInjury
      if (id === 'outOfAction' && newState.outOfAction) {
        newState.seriousInjury = false;
      }

      return newState;
    });
  };

  const handleXpCountChange = (id: string, value: number) => {
    setXpCounts(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Compute total from checkboxes
  const totalXpFromCountsAndCheckboxes =
    // Sum XP from counts (repeatable actions)
    Object.entries(xpCounts).reduce((sum, [id, count]) => {
      const xpCase = xpCountCases.find(x => x.id === id);
      return sum + (xpCase ? xpCase.xp * count : 0);
    }, 0) +
    // Sum XP from checkboxes (one-time actions)
    Object.entries(xpCheckboxes).reduce((sum, [id, isChecked]) => {
      if (isChecked) {
        const xpCase = xpCheckboxCases.find(x => x.id === id);
        return sum + (xpCase ? xpCase.xp : 0);
      }
      return sum;
    }, 0);

  // Update the XP amount whenever the checkboxes/counts change
  useEffect(() => {
    // Always update the XP amount when the calculation changes
    const calculatedAmount = totalXpFromCountsAndCheckboxes === 0 ? "" : String(totalXpFromCountsAndCheckboxes);
    
    // Update the input field with the calculated value
    setXpAmount(calculatedAmount);
  }, [totalXpFromCountsAndCheckboxes]);

  // Function to check if the input is valid
  const isValidXpInput = (value: string) => {
    // Allow empty string, minus sign, or only digits
    return value === '' || value === '-' || /^-?\d+$/.test(value);
  };

  // Handle XP mutation
  const handleAddXp = async (ooaCount?: number) => {
    if (!/^-?\d+$/.test(xpAmount)) {
      setXpError('Please enter a valid integer');
      return false;
    }

    const amount = parseInt(xpAmount || '0');

    if (isNaN(amount) || !Number.isInteger(Number(amount))) {
      setXpError('Please enter a valid integer');
      return false;
    }

    setXpError('');

    // Calculate optimistic values (absolute values)
    const optimisticXp = currentXp + amount;
    const optimisticTotalXp = currentTotalXp + amount;
    const optimisticKills = currentKills + (ooaCount || 0);
    const optimisticKillCount = is_spyrer ? currentKillCount + (ooaCount || 0) : currentKillCount;

    // Update parent immediately with optimistic values
    onXpUpdated(optimisticXp, optimisticTotalXp, optimisticKills, optimisticKillCount);

    // Close modal immediately for instant UX
    handleModalClose();

    // Fire mutation in background
    fighterXpMutation.mutateAsync({
      fighter_id: fighterId,
      xp_to_add: amount,
      ooa_count: ooaCount
    }).then((result) => {
      if (!result.success) {
        throw new Error(result.error || 'Failed to add XP');
      }

      // Server confirmation - sync with actual values
      const serverXp = result.data?.xp || optimisticXp;
      const serverTotalXp = result.data?.total_xp || optimisticTotalXp;
      const serverKills = result.data?.kills || optimisticKills;
      const serverKillCount = result.data?.kill_count !== undefined ? result.data.kill_count : optimisticKillCount;

      // Update parent with server values if different
      if (serverXp !== optimisticXp || serverTotalXp !== optimisticTotalXp || serverKills !== optimisticKills || serverKillCount !== optimisticKillCount) {
        onXpUpdated(serverXp, serverTotalXp, serverKills, serverKillCount);
      }

      // Create success message
      let successMessage = `Successfully added ${amount} XP`;
      if (ooaCount && ooaCount > 0) {
        if (is_spyrer) {
          successMessage += `, ${ooaCount} OOA${ooaCount > 1 ? 's' : ''}, and ${ooaCount} Kill${ooaCount > 1 ? 's' : ''}`;
        } else {
          successMessage += ` and ${ooaCount} OOA${ooaCount > 1 ? 's' : ''}`;
        }
      }

      toast({
        description: successMessage,
        variant: "default"
      });
    }).catch((error) => {
      console.error('Error adding XP:', error);
      
      // Rollback optimistic updates by reverting to original values
      onXpUpdated(currentXp, currentTotalXp, currentKills, currentKillCount);

      toast({
        description: error instanceof Error ? error.message : 'Failed to add XP',
        variant: "destructive"
      });
    });

    return true;
  };

  // Handle modal close - resets all state
  const handleModalClose = () => {
    // Reset all checkboxes
    setXpCheckboxes(
      xpCheckboxCases.reduce((acc, xpCase) => {
        acc[xpCase.id] = false;
        return acc;
      }, {} as Record<string, boolean>)
    );
    // Reset all counters
    setXpCounts(
      xpCountCases.reduce((acc, xpCase) => {
        acc[xpCase.id] = 0;
        return acc;
      }, {} as Record<string, number>)
    );
    // Clear XP amount and error
    setXpAmount('');
    setXpError('');
    // Call the parent onClose function
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Add XP"
      headerContent={
        <div className="flex items-center">
          <span className="mr-2 text-sm text-muted-foreground">Fighter XP</span>
          <span className="bg-green-500 text-white text-sm rounded-full px-2 py-1">
            {currentXp}
          </span>
        </div>
      }
      content={
        <div className="space-y-4">
          <div className="space-y-2">
            {/* Repeatable XP with counters */}
            {xpCountCases.map((xpCase) => (
              <div key={xpCase.id} className="flex items-center justify-between">
                <label className="text-sm text-foreground">
                  {xpCase.label} <span className="text-xs text-muted-foreground">(+{xpCase.xp} XP each)</span>
                  {xpCase.onSelectText && xpCounts[xpCase.id] > 0 && (
                    <p className="text-xs text-amber-700">{xpCase.onSelectText(xpCounts[xpCase.id])}</p>
                  )}
                </label>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                    onClick={() => handleXpCountChange(xpCase.id, Math.max(0, xpCounts[xpCase.id] - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center">{xpCounts[xpCase.id]}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex items-center justify-center border bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-md"
                    onClick={() => handleXpCountChange(xpCase.id, xpCounts[xpCase.id] + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Separator after the first cases */}
            <hr className="my-2 border-border" />

            {/* Single XP Checkboxes */}
            {xpCheckboxCases.map((xpCase, idx, arr) => (
              <div key={xpCase.id}>
                <div className="flex items-center justify-between mb-2 mr-[52px]">
                  <label htmlFor={xpCase.id} className="text-sm text-foreground">
                    {xpCase.label} <span className="text-xs text-muted-foreground">(+{xpCase.xp} XP)</span>
                  </label>
                  <Checkbox
                    id={xpCase.id}
                    checked={xpCheckboxes[xpCase.id]}
                    onCheckedChange={() => handleXpCheckboxChange(xpCase.id)}
                    className="h-4 w-4 mt-1"
                  />
                </div>
                {/* Only show a separator if it's not the last item in this slice */}
                {idx < arr.length - 1 && <hr className="my-2 border-border" />}
              </div>
            ))}
          </div>

          {/* XP Summary */}
          <div className="text-xs text-muted-foreground">
            <div>Total XP: {totalXpFromCountsAndCheckboxes}</div>
            <div>Below value can be overridden (use a negative value to subtract)</div>
          </div>

          {/* Manual Override */}
          <Input
            type="tel"
            inputMode="url"
            pattern="-?[0-9]+"
            value={xpAmount}
            onChange={(e) => {
              // When user enters a value manually, update the internal state
              setXpAmount(e.target.value);
            }}
            placeholder="XP Amount"
            className="w-full"
          />
          {xpError && (
            <p className="text-red-500 text-sm mt-1">{xpError}</p>
          )}
        </div>
      }
      onClose={handleModalClose}
      onConfirm={() => handleAddXp(xpCounts.outOfAction)}
      confirmText={parseInt(xpAmount || '0', 10) < 0 ? 'Subtract XP' : 'Add XP'}
      confirmDisabled={!xpAmount || !isValidXpInput(xpAmount)}
    />
  );
} 