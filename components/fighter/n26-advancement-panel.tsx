'use client';

import DiceRoller from '@/components/dice-roller';
import {
  N26_ADVANCEMENT_TABLE,
  resolveN26AdvancementFromUtil,
  rollNd6Outcome,
} from '@/utils/dice';
import { verifyAndLogRolledGangerAdvancementRoll } from '@/app/actions/fighter-advancement';
import { useRollLogger } from '@/hooks/use-roll-logger';

const N26_ADVANCEMENT_TABLE_LABEL = 'Advancement';

interface N26AdvancementPanelProps {
  fighterId: string;
  canEdit: boolean;
}

/**
 * The 2D6 Advancement roll for editions that earn Advancements by rank.
 *
 * Self-contained: it rolls, logs the result to the gang log, and shows the table
 * for reference. It does not pick the Advancement — the player takes any result
 * they rolled at or above, and the choice is made with the characteristic
 * selector below it, the same way the N23 Ganger table already works.
 *
 * The credits shown are the rulebook's reference values. What actually gets
 * charged comes from get_fighter_available_advancements, so the two can be
 * reconciled by correcting the catalog rather than this table.
 */
export function N26AdvancementPanel({ fighterId, canEdit }: N26AdvancementPanelProps) {
  const rollLogger = useRollLogger<{ outcome_label: string; dice_data: Record<string, unknown> }>({
    log: (variables) => verifyAndLogRolledGangerAdvancementRoll({
      fighter_id: fighterId,
      advancement_table: N26_ADVANCEMENT_TABLE_LABEL,
      ...variables,
    }),
    successMessage: 'Advancement roll logged',
    errorMessage: 'Failed to log advancement roll',
  });

  const logResolvedRoll = (total: number, dice: number[]) => {
    const row = resolveN26AdvancementFromUtil(total);
    if (row) {
      rollLogger.logRoll({ outcome_label: row.name, dice_data: { result: total, dice } });
    }
  };

  return (
    <div className="mb-4 space-y-4">
      <div className="space-y-2">
        <DiceRoller
          items={N26_ADVANCEMENT_TABLE}
          getRange={(r) => ({ min: r.range[0], max: r.range[1] })}
          getName={(r) => r.name}
          inline
          rollFn={() => rollNd6Outcome(2)}
          resolveNameForRoll={(t) => resolveN26AdvancementFromUtil(t)?.name}
          // Only onRolled is wired: onRoll fires when no row matched, and this
          // table covers every 2D6 result.
          onRolled={(rolled) => {
            if (rolled.length > 0) logResolvedRoll(rolled[0].roll, rolled[0].dice);
          }}
          buttonText="Roll 2D6"
          disabled={!canEdit || rollLogger.disabled}
        />
      </div>

      <div className="space-y-1 pt-2 border-t">
        <p className="text-sm font-medium">Advancement table</p>
        <p className="text-xs text-muted-foreground">
          The roll is recorded in your gang log. Choose the result below — you may take any result you
          rolled high enough for.
        </p>
        <ul className="text-xs text-muted-foreground pt-1 space-y-0.5">
          {N26_ADVANCEMENT_TABLE.map((row) => (
            <li key={`${row.range[0]}-${row.range[1]}`} className="flex gap-2">
              <span className="font-mono w-10 shrink-0">
                {row.range[0] === row.range[1] ? row.range[0] : `${row.range[0]}-${row.range[1]}`}
              </span>
              <span className="grow">{row.name}</span>
              <span className="shrink-0">+{row.credits}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
