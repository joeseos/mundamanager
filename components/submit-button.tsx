"use client";

import { Button } from "@/components/ui/button";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  disabled,
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      aria-disabled={pending}
      // Actually disabled, not just aria-disabled: a second click while a submit
      // is in flight resubmits, which on sign-in burns the Turnstile token.
      disabled={pending || disabled}
      {...props}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
