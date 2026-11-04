'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { formatSkillUserKindSuffix } from '@/utils/skillSetComboboxOptions';

const SKILL_USER_KINDS = ['fighter', 'walker', 'vehicle'] as const;
export type SkillUserKind = (typeof SKILL_USER_KINDS)[number];

interface SkillUserKindCheckboxesProps {
  value: SkillUserKind[];
  onChange: (value: SkillUserKind[]) => void;
  disabled?: boolean;
}

export function SkillUserKindCheckboxes({
  value,
  onChange,
  disabled,
}: SkillUserKindCheckboxesProps) {
  const suffix = formatSkillUserKindSuffix(value);

  const isChecked = (kind: SkillUserKind) => value.includes(kind);

  const toggle = (kind: SkillUserKind, checked: boolean) => {
    onChange(
      checked
        ? SKILL_USER_KINDS.filter((item) => item === kind || isChecked(item))
        : value.filter((item) => item !== kind)
    );
  };

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        Usable by
      </label>
      <div className="flex flex-wrap gap-4 mb-2">
        {SKILL_USER_KINDS.map((kind) => (
          <div key={kind} className="flex items-center space-x-2">
            <Checkbox
              id={`usable-by-${kind}`}
              checked={isChecked(kind)}
              onCheckedChange={(checked) => toggle(kind, checked === true)}
              disabled={disabled}
            />
            <label
              htmlFor={`usable-by-${kind}`}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {kind.charAt(0).toUpperCase() + kind.slice(1)}
            </label>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        None checked: no restriction. Vehicle includes Walkers.
        {suffix ? ` Preview:${suffix}` : ''}
      </p>
    </div>
  );
}
