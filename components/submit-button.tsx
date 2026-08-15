"use client";

import { Button } from "@/components/ui/button";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
  /** For forms that submit via onSubmit, where useFormStatus never reports pending. */
  pending?: boolean;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  pending,
  disabled,
  ...props
}: Props) {
  const { pending: formPending } = useFormStatus();
  const isPending = pending || formPending;

  return (
    <Button
      type="submit"
      aria-disabled={isPending}
      // Actually disabled, not just aria-disabled: a second click while a submit
      // is in flight resubmits, which on sign-in burns the Turnstile token.
      disabled={isPending || disabled}
      {...props}
    >
      {isPending ? pendingText : children}
    </Button>
  );
}
