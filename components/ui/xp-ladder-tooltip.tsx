'use client';

import { Tooltip } from 'react-tooltip';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import {
  currentXpLadderRankFor,
  xpLadderFor,
  xpLadderRangeLabel,
  type XpLadderRow,
} from '@/utils/advancementRanks';

type TitleGroup = {
  title: string;
  startIndex: number;
  rowspan: number;
};

function titleGroups(ladder: readonly XpLadderRow[]): TitleGroup[] {
  const groups: TitleGroup[] = [];
  let i = 0;
  while (i < ladder.length) {
    const title = ladder[i].title;
    let rowspan = 1;
    while (i + rowspan < ladder.length && ladder[i + rowspan].title === title) {
      rowspan++;
    }
    groups.push({ title, startIndex: i, rowspan });
    i += rowspan;
  }
  return groups;
}

interface XpLadderTooltipProps {
  id: string;
  currentXp: number;
  editionSlug?: string | null;
}

export function XpLadderTooltip({ id, currentXp, editionSlug }: XpLadderTooltipProps) {
  const isCoarsePointer = useCoarsePointer();
  const ladder = xpLadderFor(editionSlug);
  const currentRank = currentXpLadderRankFor(editionSlug, currentXp);
  const groups = titleGroups(ladder);

  if (ladder.length === 0) return null;

  return (
    <Tooltip
      id={id}
      place="top"
      className="bg-neutral-900! text-white! text-xs! z-[2000]! print:hidden!"
      delayShow={isCoarsePointer ? undefined : 200}
      delayHide={isCoarsePointer ? 100 : 300}
      offset={4}
      noArrow={true}
      clickable={true}
      openOnClick={isCoarsePointer}
      positionStrategy="fixed"
      style={{
        padding: '6px',
        maxWidth: '22rem',
      }}
    >
      <div>
        <div className="mb-1.5 text-sm font-semibold">XP Ladder</div>
        <div className="max-h-64 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#525252_#262626] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-neutral-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-600 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-500">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-700">
                <th className="px-1.5 py-0.5 font-semibold">Rank</th>
                <th className="px-1.5 py-0.5 font-semibold">XP</th>
                <th className="px-1.5 py-0.5 font-semibold">Title</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((row, index) => {
                const isCurrent = currentRank === row.rank;
                const titleGroup = groups.find((g) => g.startIndex === index);
                const titleCoversCurrent =
                  titleGroup != null &&
                  currentRank != null &&
                  currentRank >= ladder[titleGroup.startIndex].rank &&
                  currentRank <= ladder[titleGroup.startIndex + titleGroup.rowspan - 1].rank;
                const highlightCell = 'font-semibold text-white';
                const mutedCell = 'text-neutral-400';
                const isTitleGroupStart = titleGroup != null && index > 0;
                const titleGroupBorder = isTitleGroupStart ? 'border-t border-neutral-600' : '';

                return (
                  <tr key={row.rank}>
                    <td className={`px-1.5 py-0.5 tabular-nums ${titleGroupBorder} ${isCurrent ? highlightCell : mutedCell}`}>
                      {row.rank}
                    </td>
                    <td className={`px-1.5 py-0.5 tabular-nums whitespace-nowrap ${titleGroupBorder} ${isCurrent ? highlightCell : mutedCell}`}>
                      {xpLadderRangeLabel(row)}
                    </td>
                    {titleGroup && (
                      <td
                        rowSpan={titleGroup.rowspan}
                        className={`px-1.5 py-0.5 align-middle ${titleGroupBorder} ${titleCoversCurrent ? highlightCell : mutedCell}`}
                      >
                        {titleGroup.title}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Tooltip>
  );
}
