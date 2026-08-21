"use client";

import { useId, useState } from "react";
import { RiErrorWarningFill } from "react-icons/ri";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/app/lib/utils";

const EMAIL_REQUIRED_MESSAGE = "Email is required";
const EMAIL_INVALID_MESSAGE = "Must be an email address";
// HTML type="email" allows local domains like "user@host"; require a dot in the domain.
const EMAIL_PATTERN = String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;

function errorFromValidity(validity: ValidityState): string | null {
  if (validity.valid) return null;
  if (validity.valueMissing) return EMAIL_REQUIRED_MESSAGE;
  return EMAIL_INVALID_MESSAGE;
}

type ValidatedEmailFieldProps = {
  id?: string;
  name?: string;
  className?: string;
  autoComplete?: string;
};

export function ValidatedEmailField({
  id,
  name = "email",
  className,
  autoComplete = "email",
}: ValidatedEmailFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [emailError, setEmailError] = useState<string | null>(null);

  return (
    <div>
      <Label htmlFor={inputId}>Email</Label>
      <Input
        id={inputId}
        name={name}
        type="email"
        placeholder="you@example.com"
        required
        pattern={EMAIL_PATTERN}
        className={cn("text-foreground mt-1", className)}
        autoComplete={autoComplete}
        aria-invalid={!!emailError}
        aria-describedby={emailError ? errorId : undefined}
        onInvalid={(e) => {
          e.preventDefault();
          const target = e.target as HTMLInputElement;
          setEmailError(errorFromValidity(target.validity) ?? EMAIL_INVALID_MESSAGE);
        }}
        onChange={(e) => {
          const nextError = errorFromValidity(e.target.validity);
          if (nextError === null) {
            setEmailError(null);
          } else if (emailError) {
            setEmailError(nextError);
          }
        }}
      />
      {emailError && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-red-400 text-sm mt-1 flex items-start gap-1"
        >
          <RiErrorWarningFill className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          {emailError}
        </p>
      )}
    </div>
  );
}
