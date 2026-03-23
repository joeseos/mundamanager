'use client';

import React from 'react';
import Modal from '@/components/ui/modal';
import { formatRollOutcomeLine, normaliseRollFnResult, type RollOutcome } from '@/utils/dice';

type Result<T> = { roll: number; item: T; dice: number[] };

type Props<T> = {
  items: T[];
  ensureItems?: () => Promise<void>;
  getRange: (item: T) => { min: number; max: number } | null;
  getName: (item: T) => string;
  onConfirm?: (results: Array<Result<T>>) => Promise<void> | void;
  onRolled?: (results: Array<Result<T>>) => void;
  /** Called when no table row matched (inline mode). Includes dice breakdown when the roll produced them. */
  onRoll?: (roll: number, dice: number[]) => void;
  inline?: boolean; // if true, show results inline instead of modal and call onRolled
  /** Return a total, or totals plus individual dice for breakdown in the UI. */
  rollFn: () => number | RollOutcome;
  resolveNameForRoll?: (roll: number) => string | undefined; // display-only fallback label
  buttonText?: string;
  disabled?: boolean;
  className?: string;
};

export default function DiceRoller<T>({
  items,
  ensureItems,
  getRange,
  getName,
  onConfirm,
  onRolled,
  onRoll,
  inline = false,
  rollFn,
  resolveNameForRoll,
  buttonText = 'Roll',
  disabled,
  className,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const [rolling, setRolling] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [results, setResults] = React.useState<Array<Result<T>>>([]);
  const [lastOutcome, setLastOutcome] = React.useState<RollOutcome | null>(null);

  const resolveByRoll = React.useCallback(
    (r: number): T | undefined => {
      const match = items.find((i) => {
        const rg = getRange(i);
        return rg && r >= rg.min && r <= rg.max;
      });
      return match;
    },
    [items, getRange]
  );

  const performRoll = React.useCallback(async () => {
    try {
      setRolling(true);
      if (ensureItems) await ensureItems();

      const raw = rollFn();
      const { total, dice } = normaliseRollFnResult(raw);
      setLastOutcome({ total, dice });
      const first = resolveByRoll(total);
      const out: Array<Result<T>> = [];
      if (first) out.push({ roll: total, item: first, dice });

      setResults(out);
      if (inline) {
        if (out.length > 0) {
          onRolled && onRolled(out);
        } else {
          onRoll && onRoll(total, dice);
        }
      } else {
        setOpen(true);
      }
    } finally {
      setRolling(false);
    }
  }, [ensureItems, resolveByRoll, inline, onRolled, onRoll, rollFn]);

  const handleConfirm = async () => {
    setApplying(true);
    try {
      if (onConfirm) {
        await onConfirm(results);
      }
      setOpen(false);
      setResults([]);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          className={`px-3 py-2 bg-neutral-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 ${className || ''}`}
          onClick={performRoll}
          disabled={disabled || rolling}
          type="button"
        >
          {rolling ? 'Rolling...' : buttonText}
        </button>

        {inline && (
          <div className="text-sm">
            {results.length > 0 ? (
              results.map((r, idx) => (
                <span key={idx}>
                  {idx > 0 ? ', ' : ''}
                  {formatRollOutcomeLine(r.roll, r.dice, getName(r.item))}
                </span>
              ))
            ) : lastOutcome !== null ? (
              <span>
                {formatRollOutcomeLine(
                  lastOutcome.total,
                  lastOutcome.dice,
                  resolveNameForRoll?.(lastOutcome.total)
                )}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {!inline && open && (
        <Modal
          title="Roll Result"
          content={
            <div className="space-y-3">
              {results.length === 0 ? (
                <div className="text-sm space-y-2">
                  <div className="text-red-600">No entry matched the roll. Check ranges.</div>
                  {lastOutcome && (
                    <div className="text-muted-foreground">
                      {formatRollOutcomeLine(lastOutcome.total, lastOutcome.dice)}
                    </div>
                  )}
                </div>
              ) : (
                results.map((r, idx) => (
                  <div key={idx} className="p-2 border rounded">
                    <div className="font-semibold">
                      {formatRollOutcomeLine(r.roll, r.dice, getName(r.item))}
                    </div>
                  </div>
                ))
              )}
            </div>
          }
          onClose={() => { setOpen(false); setResults([]); }}
          onConfirm={handleConfirm}
          confirmText={applying ? 'Applying...' : 'Apply Result(s)'}
          confirmDisabled={applying || results.length === 0}
        />
      )}
    </>
  );
}

