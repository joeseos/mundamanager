'use client';

import { LuMinus, LuPlus } from "react-icons/lu";

interface QuantityStepperProps {
  value: number;
  /** Lowest selectable value (default 0). */
  min?: number;
  /** Highest selectable value. */
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Small inline +/- stepper for choosing how many copies of an equipment
 * option to add (bounded by the option's configured Max Number).
 */
export function QuantityStepper({ value, min = 0, max, onChange, disabled }: QuantityStepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
        className="flex h-6 w-6 items-center justify-center rounded-sm border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
      >
        <LuMinus className="h-3 w-3" />
      </button>
      <span className="w-5 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
        className="flex h-6 w-6 items-center justify-center rounded-sm border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
      >
        <LuPlus className="h-3 w-3" />
      </button>
    </div>
  );
}
