'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { rollD6 } from '@/utils/dice';

interface SellConfirmModalProps {
  itemName: string;
  initialCost: number;
  title?: string;
  showD6Roll?: boolean;
  costLabel?: string;
  showMinimumHint?: boolean;
  description?: string;
  confirmText?: string;
  onConfirm: (cost: number) => void;
  onClose: () => void;
}

export function SellConfirmModal({
  itemName,
  initialCost,
  title = 'Confirm Sale',
  showD6Roll = false,
  costLabel = 'Cost',
  showMinimumHint,
  description,
  confirmText = 'Sell',
  onConfirm,
  onClose,
}: SellConfirmModalProps) {
  const [manualCost, setManualCost] = useState(initialCost);
  const [lastRoll, setLastRoll] = useState<number | null>(null);

  const shouldShowMinimumHint = showMinimumHint ?? showD6Roll;

  const handleRoll = () => {
    const r = rollD6();
    setLastRoll(r);
    const deduction = r * 10;
    const final = Math.max(5, initialCost - deduction);
    setManualCost(final);
    toast(`Roll ${r}: -${deduction} → ${final} credits`);
  };

  return (
    <Modal
      title={title}
      content={
        <div className="space-y-4">
          <p>Are you sure you want to sell <strong>{itemName}</strong>?</p>
          {showD6Roll && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRoll}
                className="px-3 py-2 bg-neutral-900 text-white rounded-sm hover:bg-gray-800 disabled:opacity-50"
              >
                Roll D6
              </button>
              {lastRoll !== null && (
                <div className="text-sm">
                  Roll {lastRoll}: -{lastRoll * 10} → {Math.max(5, initialCost - lastRoll * 10)} credits
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {costLabel}
              </label>
              <Input
                type="number"
                value={manualCost}
                onChange={(e) => setManualCost(Number(e.target.value))}
                min={0}
              />
              {shouldShowMinimumHint && (
                <p className="text-xs text-muted-foreground mt-1">Minimum 5 credits</p>
              )}
            </div>
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      }
      onClose={onClose}
      onConfirm={() => { onConfirm(manualCost); return true; }}
      confirmText={confirmText}
    />
  );
}
