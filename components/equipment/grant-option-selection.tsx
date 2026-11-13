'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { EquipmentGrants } from '@/types/equipment';

interface GrantOptionSelectionProps {
  /** Radio group name, unique per granting item */
  name: string;
  grants: EquipmentGrants;
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}

/** The equipment an item comes with, e.g. an Outrider Quad's weapon: radios for one pick, checkboxes for several */
export function GrantOptionSelection({ name, grants, selectedIds, onChange }: GrantOptionSelectionProps) {
  const isMultiple = grants.selection_type === 'multiple_select';
  const maxSelections = grants.max_selections || grants.options.length;

  return (
    <div className="space-y-1">
      {grants.options.map(option => {
        const isSelected = selectedIds.includes(option.equipment_id);
        return (
          <label key={option.equipment_id} className="flex items-center gap-2 text-sm cursor-pointer">
            {isMultiple ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={checked => onChange(checked
                  ? [...selectedIds, option.equipment_id]
                  : selectedIds.filter(id => id !== option.equipment_id))}
                disabled={!isSelected && selectedIds.length >= maxSelections}
              />
            ) : (
              <input
                type="radio"
                name={name}
                checked={isSelected}
                onChange={() => onChange([option.equipment_id])}
                className="w-4 h-4 cursor-pointer"
              />
            )}
            <span>
              {option.equipment_name || 'Unknown'}
              {option.additional_cost > 0 && (
                <span className="text-muted-foreground"> (+{option.additional_cost} credits)</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
