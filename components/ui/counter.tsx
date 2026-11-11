import * as React from "react";
import { LuMinus, LuPlus } from "react-icons/lu";

import { Button, type ButtonProps } from "@/components/ui/button";

interface CounterButtonProps extends Omit<ButtonProps, "variant" | "size" | "children"> {
  direction: "decrement" | "increment";
}

// Square outline -/+ icon button used for stepping a numeric value.
export function CounterButton({ direction, ...props }: CounterButtonProps) {
  const Icon = direction === "decrement" ? LuMinus : LuPlus;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={direction === "decrement" ? "Decrease" : "Increase"}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

interface CounterProps {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  // When set, the decrement button is disabled once value reaches it.
  min?: number;
}

// [-] value [+] row.
export function Counter({ value, onDecrement, onIncrement, min }: CounterProps) {
  return (
    <div className="flex items-center space-x-2">
      <CounterButton
        direction="decrement"
        onClick={onDecrement}
        disabled={min !== undefined && value <= min}
      />
      <span className="w-6 text-center">{value}</span>
      <CounterButton direction="increment" onClick={onIncrement} />
    </div>
  );
}
