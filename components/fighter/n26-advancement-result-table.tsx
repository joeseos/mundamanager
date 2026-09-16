'use client';

import { cn } from '@/app/lib/utils';

export type N26AdvancementResultRow = {
  id: string;
  range: readonly [number, number];
  name: string;
  credits: number;
};

type N26AdvancementResultTableProps = {
  rows: readonly N26AdvancementResultRow[];
  selectedRowId: string;
  rollTotal: number | null;
  onSelectRow: (rowId: string) => void;
  disabled?: boolean;
};

function formatRange(entry: { range: readonly [number, number] }): string {
  const [a, b] = entry.range;
  return a === b ? `${a}` : `${a}-${b}`;
}

/**
 * Visible N26 Advancement table. Every row is always clickable; an optional
 * in-app roll only greys results the total was not high enough for.
 */
export function N26AdvancementResultTable({
  rows,
  selectedRowId,
  rollTotal,
  onSelectRow,
  disabled = false
}: N26AdvancementResultTableProps) {
  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="w-4 pl-3 py-2" aria-hidden="true" />
            <th className="text-center px-1 md:px-2 py-2">2D6</th>
            <th className="text-left px-1 md:px-2 py-2">Result</th>
            <th className="text-right px-1 md:px-2 py-2">Credits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ineligible = rollTotal !== null && row.range[0] > rollTotal;
            const selected = selectedRowId === row.id;
            const rangeLabel = formatRange(row);
            return (
              <tr
                key={row.id}
                onClick={() => {
                  if (!disabled) onSelectRow(row.id);
                }}
                className={cn(
                  'border-t',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  selected ? 'bg-muted' : !disabled && 'hover:bg-muted/50',
                  ineligible && 'italic text-neutral-400'
                )}
              >
                <td className="w-4 pl-2 py-2">
                  <input
                    type="radio"
                    name="n26-advancement-row"
                    checked={selected}
                    onChange={() => onSelectRow(row.id)}
                    disabled={disabled}
                    aria-label={`${rangeLabel}: ${row.name}`}
                  />
                </td>
                <td
                  className={cn(
                    'px-2 py-2 text-center whitespace-nowrap',
                    !ineligible && 'text-muted-foreground'
                  )}
                >
                  {rangeLabel}
                </td>
                <td className="px-1 md:px-2 py-2">{row.name}</td>
                <td className="px-1 md:px-2 py-2 text-right">+{row.credits}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
