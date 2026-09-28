'use client';

import { HiX } from "react-icons/hi";
import { DefaultEquipmentSlot } from "@/types/fighter-type";

interface DefaultEquipmentItem {
  id: string;
  equipment_name: string;
  equipment_type: string;
  equipment_category?: string;
}

interface AdminDefaultEquipmentProps {
  /** Every equipment row, so a slot outside the current edition filter still renders. */
  equipment: DefaultEquipmentItem[];
  /** The equipment offered in the add dropdown. */
  options: DefaultEquipmentItem[];
  value: DefaultEquipmentSlot[];
  onChange: (slots: DefaultEquipmentSlot[]) => void;
  disabled?: boolean;
}

/** Keeps the slots that pass keep, unlinking any accessory whose weapon was dropped. */
export function keepDefaultEquipmentSlots(
  slots: DefaultEquipmentSlot[],
  keep: (slot: DefaultEquipmentSlot) => boolean
): DefaultEquipmentSlot[] {
  const kept = slots.filter(keep);
  const keptIds = new Set(kept.map(slot => slot.id));
  return kept.map(slot =>
    slot.target_fighter_default_id && !keptIds.has(slot.target_fighter_default_id)
      ? { ...slot, target_fighter_default_id: null }
      : slot
  );
}

/**
 * A fighter type's default equipment. The same item can be added more than once, and a
 * Weapon Accessory can be attached to one of the default weapons, which add-fighter.ts
 * applies at recruitment.
 */
export function AdminDefaultEquipment({ equipment, options, value, onChange, disabled }: AdminDefaultEquipmentProps) {
  const equipmentById = new Map(equipment.map(item => [item.id, item]));

  // Weapons are numbered in list order so two of the same weapon can be told apart, both on
  // the weapon's row and in each accessory's Attach to dropdown.
  const weaponNumbers = new Map<string, number>();
  value.forEach(slot => {
    if (equipmentById.get(slot.equipment_id)?.equipment_type === 'weapon') {
      weaponNumbers.set(slot.id, weaponNumbers.size + 1);
    }
  });
  const weaponSlots = value.filter(slot => weaponNumbers.has(slot.id));

  const addSlot = (equipmentId: string) => {
    onChange([...value, { id: crypto.randomUUID(), equipment_id: equipmentId, target_fighter_default_id: null }]);
  };

  const setTarget = (slotId: string, targetId: string | null) => {
    onChange(value.map(slot => slot.id === slotId ? { ...slot, target_fighter_default_id: targetId } : slot));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        Default Equipment
      </label>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) addSlot(e.target.value);
          e.target.value = "";
        }}
        className="w-full p-2 border rounded-md"
        disabled={disabled}
      >
        <option value="">Select equipment to add</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.equipment_name}
          </option>
        ))}
      </select>

      <div className="mt-2 flex flex-col gap-2">
        {value.map((slot) => {
          const item = equipmentById.get(slot.equipment_id);
          if (!item) return null;

          const weaponNumber = weaponNumbers.get(slot.id);
          const isWeaponAccessory = item.equipment_category?.toLowerCase() === 'weapon accessories';

          return (
            <div
              key={slot.id}
              className="flex flex-wrap items-center justify-between gap-2 bg-muted px-2 py-1 rounded-md text-sm"
            >
              <span>
                {item.equipment_name}
                {weaponNumber !== undefined && (
                  <span className="text-muted-foreground"> #{weaponNumber}</span>
                )}
              </span>

              <div className="flex items-center gap-2">
                {isWeaponAccessory && weaponSlots.length > 0 && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Attach to
                    <select
                      value={slot.target_fighter_default_id || ''}
                      onChange={(e) => setTarget(slot.id, e.target.value || null)}
                      className="p-1 border rounded-md bg-background text-foreground"
                      disabled={disabled}
                    >
                      <option value="">Not attached</option>
                      {weaponSlots.map((weaponSlot) => (
                        <option key={weaponSlot.id} value={weaponSlot.id}>
                          {equipmentById.get(weaponSlot.equipment_id)?.equipment_name} #{weaponNumbers.get(weaponSlot.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => onChange(keepDefaultEquipmentSlots(value, s => s.id !== slot.id))}
                  className="hover:text-red-500 focus:outline-hidden"
                  disabled={disabled}
                >
                  <HiX className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
