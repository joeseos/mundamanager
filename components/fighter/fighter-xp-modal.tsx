'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from "@/components/ui/modal";
import { Plus, Minus } from "lucide-react";

interface XpCase {
  id: string;
  label: string;
  xp: number;
}

interface FighterXpModalProps {
  isOpen: boolean;
  fighterId: string;
  currentXp: number;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  xpAmountState: {
    xpAmount: string;
    xpError: string;
  };
  onXpAmountChange: (value: string) => void;
}

export function FighterXpModal({
  isOpen,
  fighterId,
  currentXp,
  onClose,
  onConfirm,
  xpAmountState,
  onXpAmountChange
}: FighterXpModalProps) {
  // Define XP "events" for the checkbox list
  const xpCountCases: XpCase[] = [
    { id: 'seriousInjury', label: 'Cause Serious Injury', xp: 1 },
    { id: 'outOfAction', label: 'Cause OOA', xp: 2 },
    { id: 'leaderChampionBonus', label: 'Leader/Champion', xp: 1 },
    { id: 'vehicleWrecked', label: 'Wreck Vehicle', xp: 2 },
  ];

  const xpCheckboxCases: XpCase[] = [
    { id: 'battleParticipation', label: 'Battle Participation', xp: 1 },
    { id: 'rally', label: 'Successful Rally', xp: 1 },
    { id: 'assistance', label: 'Provide Assistance', xp: 1 },
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
    onXpAmountChange(calculatedAmount);
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
    // Clear XP amount and error - we use an empty string to ensure it's properly reset
    onXpAmountChange('');
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

            {/* Separator after the first three */}
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
            value={xpAmountState.xpAmount}
            onChange={(e) => {
              // When user enters a value manually, update the parent state
              onXpAmountChange(e.target.value);
            }}
            placeholder="XP Amount"
            className="w-full"
          />
          {xpAmountState.xpError && (
            <p className="text-red-500 text-sm mt-1">{xpAmountState.xpError}</p>
          )}
        </div>
      }
      onClose={handleModalClose}
      onConfirm={onConfirm}
      confirmText={parseInt(xpAmountState.xpAmount || '0', 10) < 0 ? 'Subtract XP' : 'Add XP'}
      confirmDisabled={!xpAmountState.xpAmount || !isValidXpInput(xpAmountState.xpAmount)}
    />
  );
} 