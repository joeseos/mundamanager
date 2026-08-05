'use client';

import { Input } from "@/components/ui/input";
import { WeaponProfileInput } from "@/types/equipment";

interface WeaponProfileFieldsProps {
  profile: WeaponProfileInput;
  index: number;
  onChange: (index: number, field: keyof WeaponProfileInput, value: string) => void;
  /** N26 statline: SR, LR, Str, AP, Lethality. N23: Rng S/L, Acc S/L, Str, AP, D, Am. */
  usesLethality: boolean;
  disabled?: boolean;
}

const LABEL_CLASS = 'block text-sm font-medium text-muted-foreground mb-1';

/**
 * The stat row of a weapon profile, shared by the admin create and edit
 * equipment modals. Which stats an edition has is decided once here rather
 * than once per modal, so a future edition's statline is a single-file change.
 *
 * Profile name, sort order and weapon group stay with the callers -- those
 * genuinely differ between the two modals.
 */
export function WeaponProfileFields({ profile, index, onChange, usesLethality, disabled = false }: WeaponProfileFieldsProps) {
  const field = (name: keyof WeaponProfileInput, label: string, placeholder: string) => (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <Input
        value={profile[name] as string}
        onChange={(e) => onChange(index, name, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );

  // Tailwind cannot see interpolated class names, so both column counts are
  // written out in full
  const gridClass = usesLethality
    ? 'grid grid-cols-4 md:grid-cols-5 gap-2 md:gap-4'
    : 'grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-4';

  return (
    <div className={gridClass}>
      {field('range_short', usesLethality ? 'SR' : 'Rng S', 'e.g. 4", -')}
      {field('range_long', usesLethality ? 'LR' : 'Rng L', 'e.g. 8", E')}

      {!usesLethality && (
        <>
          {field('acc_short', 'Acc S', 'e.g. +1, -')}
          {field('acc_long', 'Acc L', 'e.g. -1, -')}
        </>
      )}

      {field('strength', 'Strength', 'e.g. 3, S+1')}
      {field('ap', 'AP', 'e.g. -1, -')}

      {usesLethality ? (
        field('lethality', 'Lethality', 'e.g. 1, 3')
      ) : (
        <>
          {field('damage', 'Damage', 'e.g. 1, D3')}
          {field('ammo', 'Am', 'e.g. 5+')}
        </>
      )}
    </div>
  );
}
