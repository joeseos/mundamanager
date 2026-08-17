'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { rollD6 } from '@/utils/dice';
import { hasItemSaleD6Deduction } from '@/types/edition';

interface SellConfirmModalProps {
  itemName: string;
  initialCost: number;
  title?: string;
  /** A credits sale rather than a resource refund. The edition decides how it is priced. */
  showD6Roll?: boolean;
  costLabel?: string;
  showMinimumHint?: boolean;
  description?: string;
  confirmText?: string;
  editionSlug?: string | null;
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
  editionSlug,
  onConfirm,
  onClose,
}: SellConfirmModalProps) {
  // An unresolved slug keeps the roll: legacy rows predate edition_id and are N23,
  // so the capability answering false for them must not switch the formula.
  const offersHalfValue =
    showD6Roll && editionSlug != null && !hasItemSaleD6Deduction(editionSlug);
  const showRoll = showD6Roll && !offersHalfValue;
  const halfPrice = Math.max(5, Math.ceil(initialCost / 2));

  const [manualCost, setManualCost] = useState(initialCost);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [useHalfValue, setUseHalfValue] = useState(false);

  const shouldShowMinimumHint = showMinimumHint ?? showD6Roll;

  const handleHalfValueChange = (checked: boolean) => {
    setUseHalfValue(checked);
    setManualCost(checked ? halfPrice : initialCost);
  };

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
          {showRoll && (
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
                  Roll {lastRoll}: {initialCost}-{lastRoll * 10} → {Math.max(5, initialCost - lastRoll * 10)} credits
                </div>
              )}
              {shouldShowMinimumHint && (
                <p className="text-sm text-muted-foreground">(Minimum 5 credits)</p>
              )}
            </div>
          )}
          {offersHalfValue && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="half-value"
                checked={useHalfValue}
                onCheckedChange={handleHalfValueChange}
              />
              <Label htmlFor="half-value" className="text-sm">
                Half of {initialCost} rounded up (minimum 5 credits)
              </Label>
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
