'use client';

import React from 'react';
import Modal from '@/components/modal';
import { rollD66, rollD3, resolveInjuryFromUtil, bannedFromUtil } from '@/utils/dice';

type Result<T> = { roll: number; item: T };

type Props<T> = {
  items: T[];
  ensureItems?: () => Promise<void>;
  getRange: (item: T) => { min: number; max: number } | null;
  getName: (item: T) => string;
  isMultiple?: (item: T) => boolean;
  getBanned?: (item: T) => string[] | undefined;
  onConfirm?: (results: Array<Result<T>>) => Promise<void> | void;
  onRolled?: (results: Array<Result<T>>) => void;
  inline?: boolean; // if true, show results inline instead of modal and call onRolled
  expandMultiple?: boolean; // if true, auto-roll extra results for "Multiple Injuries"
  buttonText?: string;
  disabled?: boolean;
  className?: string;
};

export default function DiceRoller<T>({
  items,
  ensureItems,
  getRange,
  getName,
  isMultiple,
  getBanned,
  onConfirm,
  onRolled,
  inline = false,
  expandMultiple = false,
  buttonText = 'Roll',
  disabled,
  className,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const [rolling, setRolling] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [results, setResults] = React.useState<Array<Result<T>>>([]);

  const resolveByRoll = React.useCallback(
    (r: number): T | undefined => {
      const match = items.find((i) => {
        const rg = getRange(i);
        return rg && r >= rg.min && r <= rg.max;
      });
      if (match) return match;
      // Fallback to util mapping by name if DB ranges are missing
      const util = resolveInjuryFromUtil(r);
      if (!util) return undefined;
      return items.find((i) => getName(i) === util.name);
    },
    [items, getRange, getName]
  );

  const performRoll = React.useCallback(async () => {
    try {
      setRolling(true);
      if (ensureItems) await ensureItems();

      const r = rollD66();
      const first = resolveByRoll(r);
      const out: Array<Result<T>> = [];

      if (first) {
        out.push({ roll: r, item: first });

        if (expandMultiple && isMultiple?.(first)) {
          const banned = new Set(getBanned?.(first) || bannedFromUtil(getName(first)));
          const extra = rollD3();
          for (let i = 0; i < extra; i++) {
            let rr: number;
            let pick: T | undefined;
            do {
              rr = rollD66();
              pick = resolveByRoll(rr);
            } while (!pick || banned.has(getName(pick)));
            out.push({ roll: rr, item: pick });
          }
        }
      }

      setResults(out);
      if (inline) {
        onRolled && onRolled(out);
      } else {
        setOpen(true);
      }
    } finally {
      setRolling(false);
    }
  }, [ensureItems, resolveByRoll, isMultiple, getBanned, getName, inline, onRolled, expandMultiple]);

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
          className={`px-3 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 ${className || ''}`}
          onClick={performRoll}
          disabled={disabled || rolling}
          type="button"
        >
          {rolling ? 'Rolling...' : buttonText}
        </button>

        {inline && results.length > 0 && (
          <div className="text-sm">
            {results.map((r, idx) => (
              <span key={idx}>
                {idx > 0 ? ', ' : ''}Roll {r.roll}: {getName(r.item)}
              </span>
            ))}
          </div>
        )}
      </div>

      {!inline && open && (
        <Modal
          title="D66 Roll Result"
          content={
            <div className="space-y-3">
              {results.length === 0 ? (
                <div className="text-sm text-red-600">No entry matched the roll. Check ranges.</div>
              ) : (
                results.map((r, idx) => (
                  <div key={idx} className="p-2 border rounded">
                    <div className="font-semibold">Roll {r.roll}: {getName(r.item)}</div>
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


