'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/modal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SellFighterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sellValue: number) => Promise<boolean>;
  fighterName: string;
  fighterValue: number; // Total calculated value of the fighter (credits + equipment + advancements etc.)
  isEnslaved: boolean; // Whether fighter is currently enslaved
}

export function SellFighterModal({
  isOpen,
  onClose,
  onConfirm,
  fighterName,
  fighterValue,
  isEnslaved,
}: SellFighterModalProps) {
  const [sellValue, setSellValue] = useState<number>(0);
  const [useFullValue, setUseFullValue] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Calculate default sell value (50% rounded up to nearest 5)
  const calculateDefaultSellValue = (value: number): number => {
    const halfValue = Math.ceil(value * 0.5);
    return Math.ceil(halfValue / 5) * 5;
  };

  // Update sell value when fighter value changes or checkbox is toggled
  useEffect(() => {
    if (useFullValue) {
      setSellValue(fighterValue);
    } else {
      setSellValue(calculateDefaultSellValue(fighterValue));
    }
  }, [fighterValue, useFullValue]);

  const handleSellValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setSellValue(value);
  };

  const handleCheckboxChange = (checked: boolean) => {
    setUseFullValue(checked);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const success = await onConfirm(sellValue);
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error('Error selling fighter:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={isEnslaved ? 'Rescue from Guilders' : 'Sell to Guilders'}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText={isEnslaved ? 'Rescue' : 'Sell'}
      confirmDisabled={isSubmitting}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {isEnslaved
            ? `Are you sure you want to rescue "${fighterName}" from the Guilders?`
            : `Are you sure you want to sell "${fighterName}" to the Guilders?`}
        </p>

        {!isEnslaved && (
          <>
            <div className="space-y-2">
              <Label htmlFor="sell-value">Sell Value (Credits)</Label>
              <Input
                id="sell-value"
                type="number"
                value={sellValue}
                onChange={handleSellValueChange}
                min={0}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Fighter&apos;s total value: {fighterValue} credits
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="full-value"
                checked={useFullValue}
                onCheckedChange={handleCheckboxChange}
              />
              <Label htmlFor="full-value" className="text-sm">
                Use 100% of fighter&apos;s value ({fighterValue} credits)
              </Label>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
