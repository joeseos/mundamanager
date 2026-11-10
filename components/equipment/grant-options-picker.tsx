'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { EquipmentGrants } from '@/types/equipment';

interface GrantOptionsPickerProps {
  grants: EquipmentGrants;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Radio group name; must be unique when several pickers render together */
  name: string;
}

/**
 * The options a choice grant offers (equipment that comes with one of several items,
 * e.g. an Outrider Quad's weapon): radios for single_select, checkboxes for multiple_select.
 */
export function GrantOptionsPicker({ grants, selectedIds, onChange, name }: GrantOptionsPickerProps) {
  const isMultiple = grants.selection_type === 'multiple_select';
  const maxSelections = grants.max_selections || grants.options.length;

  return (
    <div className="space-y-2">
      {grants.options.map((option) => {
        const isSelected = selectedIds.includes(option.equipment_id);
        return (
          <label
            key={option.equipment_id}
            className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
              isSelected ? 'border-primary bg-primary/5' : ''
            }`}
          >
            {isMultiple ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  if (checked) {
                    if (selectedIds.length < maxSelections) {
                      onChange([...selectedIds, option.equipment_id]);
                    }
                  } else {
                    onChange(selectedIds.filter(id => id !== option.equipment_id));
                  }
                }}
                disabled={!isSelected && selectedIds.length >= maxSelections}
                className="mr-3"
              />
            ) : (
              <input
                type="radio"
                name={name}
                checked={isSelected}
                onChange={() => onChange([option.equipment_id])}
                className="mr-3"
              />
            )}
            <div className="flex-1">
              <span className="font-medium">{option.equipment_name || 'Unknown'}</span>
              {option.additional_cost > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  (+{option.additional_cost} credits)
                </span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
