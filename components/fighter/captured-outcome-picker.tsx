'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import DiceRoller from '@/components/dice-roller';
import { Combobox } from '@/components/ui/combobox';
import { rollNd6Outcome, type TableEntry } from '@/utils/dice';
import { editFighterStatus } from '@/app/actions/edit-fighter';

const formatRange = ([min, max]: [number, number]) => (min === max ? `${min}` : `${min}-${max}`);

/** The D6 rolled after a Captured result, for editions whose table has one. */
export function CapturedOutcomePicker({
  table,
  value,
  onChange,
  disabled,
}: {
  table: TableEntry[];
  value: string;
  onChange: (outcome: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 pt-3 border-t">
      <label className="text-sm font-medium">Captured result</label>
      <DiceRoller
        items={table}
        getRange={(entry: TableEntry) => ({ min: entry.range[0], max: entry.range[1] })}
        getName={(entry: TableEntry) => entry.name}
        inline
        rollFn={() => rollNd6Outcome(1)}
        buttonText="Roll D6"
        disabled={disabled}
        onRolled={(rolled) => {
          if (rolled.length > 0) onChange(rolled[0].item.name);
        }}
      />
      <Combobox
        value={value}
        onValueChange={onChange}
        placeholder="Select a Captured result"
        disabled={disabled}
        options={table.map((entry) => {
          const range = formatRange(entry.range);
          return {
            value: entry.name,
            label: (
              <>
                <span className="text-gray-400 inline-block w-11 text-center mr-1">{range}</span>{entry.name}
              </>
            ),
            displayValue: `${range} ${entry.name}`,
          };
        })}
      />
    </div>
  );
}

/** A Daring Escape adds no injury: the model only goes into Recovery. */
export function useDaringEscape(fighterId: string, inRecovery: boolean, onRecovery: () => void) {
  const mutation = useMutation({
    mutationFn: async () => {
      // 'recover' toggles, so it is only sent while the model is out of Recovery.
      const result = await editFighterStatus({ fighter_id: fighterId, action: 'recover' });
      if (!result.success) throw new Error(result.error || 'Failed to send to Recovery');
    },
    onSuccess: () => {
      onRecovery();
      toast.success('Daring Escape: sent to Recovery');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send to Recovery');
    },
  });

  return () => {
    if (inRecovery) toast.success('Daring Escape: already in Recovery');
    else mutation.mutate();
  };
}
