'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from "@/components/ui/modal";
import { Plus, Minus } from "lucide-react";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFighterXpWithOoa } from "@/app/lib/server-functions/edit-fighter";
import { queryKeys } from '@/app/lib/queries/keys';
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
  onClose: () => void;
}

export function FighterXpModal({
  isOpen,
  fighterId,
  currentXp,
  onClose
}: FighterXpModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Internal state for XP amount and error
  const [xpAmount, setXpAmount] = useState('');
  const [xpError, setXpError] = useState('');

  // XP mutation with optimistic updates
  const updateXpMutation = useMutation({
    mutationFn: updateFighterXpWithOoa,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fighters.detail(fighterId) });

      // Snapshot the previous value
      const previousFighter = queryClient.getQueryData(queryKeys.fighters.detail(fighterId));

      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.fighters.detail(fighterId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          xp: old.xp + variables.xp_to_add
        };
      });

      // Return a context object with the snapshotted value
      return { previousFighter };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousFighter) {
        queryClient.setQueryData(queryKeys.fighters.detail(fighterId), context.previousFighter);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the server state
      queryClient.invalidateQueries({ queryKey: queryKeys.fighters.detail(fighterId) });
    },
  });
  // Define XP "events" for the checkbox list
  const xpCountCases: XpCase[] = [
    { id: 'seriousInjury', label: 'Cause Serious Injury', xp: 1 },
    { id: 'outOfAction', label: 'Cause OOA', xp: 2, onSelectText: (count) => `⚠️ Adds ${count} to the OOA count` },
    { id: 'leaderChampionBonus', label: 'Leader/Champion', xp: 1 },
    { id: 'vehicleWrecked', label: 'Wreck Vehicle', xp: 2 },
    { id: 'rally', label: 'Successful Rally', xp: 1 },
    { id: 'assistance', label: 'Provide Assistance', xp: 1 },
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

  // XP handling function
  const handleAddXp = async (ooaCount?: number) => {
    if (xpAmount !== '' && !/^-?\d+$/.test(xpAmount)) {
      setXpError('Please enter a valid integer');
      return false;
    }

    const amount = parseInt(xpAmount || '0', 10);

    if (isNaN(amount) || !Number.isInteger(amount)) {
      setXpError('Please enter a valid integer');
      return false;
    }

    setXpError('');

    // Execute mutation in background, return true immediately to close modal
    setTimeout(async () => {
      try {
        await updateXpMutation.mutateAsync({
          fighter_id: fighterId,
          xp_to_add: amount,
          ooa_count: ooaCount
        });

        // Create success message
        let successMessage = `Successfully added ${amount} XP`;
        if (ooaCount && ooaCount > 0) {
          successMessage += ` and ${ooaCount} OOA${ooaCount > 1 ? 's' : ''}`;
        }

        toast({
          description: successMessage,
          variant: "default"
        });
      } catch (error) {
        console.error('Error adding XP:', error);
        
        toast({
          description: error instanceof Error ? error.message : 'Failed to add XP',
          variant: "destructive"
        });
      }
    }, 0);

    return true;
  };

  // Update the XP amount whenever the checkboxes/counts change
  useEffect(() => {
    // Always update the XP amount when the calculation changes
    const calculatedAmount = String(totalXpFromCountsAndCheckboxes);
    
    // Update the input field with the calculated value
    setXpAmount(calculatedAmount);
  }, [totalXpFromCountsAndCheckboxes]);

  // Function to check if the input is valid
  const isValidXpInput = (value: string) => {
    // Allow empty string, minus sign, or only digits
    return value === '' || value === '-' || /^-?\d+$/.test(value);
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
          <span className="mr-2 text-sm text-gray-600">Fighter XP</span>
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
                <label className="text-sm text-gray-800">
                  {xpCase.label} (+{xpCase.xp} XP each)
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
            <hr className="my-2 border-gray-300" />

            {/* Single XP Checkboxes */}
            {xpCheckboxCases.map((xpCase, idx, arr) => (
              <div key={xpCase.id}>
                <div className="flex items-center justify-between mb-2 mr-[52px]">
                  <label htmlFor={xpCase.id} className="text-sm text-gray-800">
                    {xpCase.label} (+{xpCase.xp} XP)
                  </label>
                  <Checkbox
                    id={xpCase.id}
                    checked={xpCheckboxes[xpCase.id]}
                    onCheckedChange={() => handleXpCheckboxChange(xpCase.id)}
                    className="h-4 w-4 mt-1"
                  />
                </div>
                {/* Only show a separator if it's not the last item in this slice */}
                {idx < arr.length - 1 && <hr className="my-2 border-gray-300" />}
              </div>
            ))}
          </div>

          {/* XP Summary */}
          <div className="text-xs text-gray-600">
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
              setXpError(''); // Clear error when user types
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
      confirmDisabled={!isValidXpInput(xpAmount) || !!xpError}
    />
  );
} 