'use client';

import React from 'react';
import { Tooltip } from 'react-tooltip';
import { characteristicLimitsFor } from '@/utils/characteristicLimits';
import { hasCumulativeXp } from '@/types/edition';
import {
  currentXpLadderRankFor,
  xpLadderFor,
  xpLadderRangeLabel,
  type XpLadderRow,
} from '@/utils/advancementRanks';

const formatStatValue = (key: string, value: number | string) => {
  if (key === 'BS' && value === '0+') return '-';
  return value;
};

/** Rank progress like "124/133" is too wide for equal columns on phone/tablet — stack it. */
const formatXpCell = (value: number | string) => {
  const text = String(value);
  const slashIndex = text.indexOf('/');
  if (slashIndex === -1) return text;

  const current = text.slice(0, slashIndex);
  const next = text.slice(slashIndex); // includes leading '/'

  return (
    <>
      <span className="flex flex-col items-center leading-none gap-0.5 text-[10px] md:text-[12px] lg:hidden">
        <span>{current}</span>
        <span>{next}</span>
      </span>
      <span className="hidden lg:inline">{text}</span>
    </>
  );
};

/** Numeric XP from a display cell that may be "124/133" or a bare number. */
const parseXpFromDisplay = (value: number | string | undefined): number => {
  if (value == null || value === 'N/A') return 0;
  if (typeof value === 'number') return value;
  const beforeSlash = String(value).split('/')[0];
  const parsed = parseInt(beforeSlash, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

type TitleGroup = {
  title: string;
  startIndex: number;
  rowspan: number;
};

const COARSE_MQ = '(hover: none) and (pointer: coarse)';
let _coarseMql: MediaQueryList | null = null;
const getCoarseMql = () => {
  if (typeof window === 'undefined') return null;
  return (_coarseMql ??= window.matchMedia(COARSE_MQ));
};

const subscribeCoarsePointer = (onStoreChange: () => void) => {
  const mql = getCoarseMql();
  mql?.addEventListener('change', onStoreChange);
  return () => mql?.removeEventListener('change', onStoreChange);
};
const getCoarsePointerSnapshot = () => getCoarseMql()?.matches ?? false;
const getCoarsePointerServerSnapshot = () => false;

function useCoarsePointer() {
  return React.useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
}

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

/** Shared by the XP modal header; lives here with the stats-table XP ladder. */
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

interface FighterDetailsStatsTableProps {
  data?: Record<string, number | string>;
  isCrew?: boolean;
  editionSlug?: string | null;
  /** Numeric XP for ladder highlight; display string stays in data.XP. */
  currentXp?: number;
  /** Scopes the XP ladder tooltip id when multiple surfaces share a page. */
  fighterId?: string;
}

export function FighterDetailsStatsTable({
  data,
  isCrew,
  editionSlug,
  currentXp,
  fighterId,
}: FighterDetailsStatsTableProps) {
  const generatedTooltipId = React.useId();

  if (!data || Object.keys(data).length === 0) {
    return <p>No characteristics available</p>;
  }

  const characteristicLimits = characteristicLimitsFor(editionSlug, !!isCrew);

  // Define the order of stats based on fighter type
  const statOrder = isCrew
    ? ['M', 'Front', 'Side', 'Rear', 'HP', 'Hnd', 'Sv', 'BS', 'Ld', 'Cl', 'Wil', 'Int', 'XP']
    : ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Sv', 'Ld', 'Cl', 'Wil', 'Int', 'XP'];

  const specialBackgroundStats = isCrew
    ? ['BS', 'Ld', 'Cl', 'Wil', 'Int']
    : ['Ld', 'Cl', 'Wil', 'Int'];

  const columnRenameMap: Record<string, { full: string; short: string }> = {
    Front: { full: 'Front', short: 'Fr' },
    Side: { full: 'Side', short: 'Sd' },
    Rear: { full: 'Rear', short: 'Rr' },
  };

  // Add helper function to determine if a column needs a border
  const getColumnBorderClass = (key: string) => {
    if (isCrew) {
      if (key === 'Front') return 'border-l-[1px] border-[#a05236]';
      if (key === 'Rear') return 'border-r-[1px] border-[#a05236]';
      if (key === 'BS') return 'border-l-[1px] border-[#a05236]';
    } else {
      if (key === 'Ld') return 'border-l-[1px] border-[#a05236]';
    }
    if (key === 'XP') return 'border-l-[1px] border-[#a05236]';
    return '';
  };

  // Filter and sort the stats according to the correct order
  const orderedStats = statOrder
    .filter(key => key in data)
    .reduce((acc, key) => ({
      ...acc,
      [key]: data[key],
    }), {} as Record<string, number | string>);

  const parseValue = (val: string | number): number => {
    if (typeof val === 'number') return val;
    if (val.endsWith('"')) return parseInt(val); // Movement
    if (val.endsWith('+')) return parseInt(val); // Characteristic tests
    return parseInt(val); // Assume fallback
  };

  const isStatOutOfRange = (key: string, value: number | string): boolean => {
    const limits = characteristicLimits[key];
    if (!limits) return false;

    const valNum = parseValue(value);
    const min = parseValue(limits[0]);
    const max = parseValue(limits[1]);

    return valNum < min || valNum > max;
  };

  // Set all columns to the same width
  const columnCount = Object.keys(orderedStats).length;
  const columnWidth = `${100 / columnCount}%`;

  const showXpLadder =
    hasCumulativeXp(editionSlug) &&
    orderedStats.XP !== undefined &&
    orderedStats.XP !== 'N/A';
  const resolvedCurrentXp = currentXp ?? parseXpFromDisplay(orderedStats.XP);
  const xpLadderTooltipId = `xp-ladder-details-${fighterId ?? generatedTooltipId}`;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <table className="w-full table-fixed text-xs sm:text-sm border-collapse">
        <thead>
          {/* Conditionally Render Toughness Header Row */}
          {isCrew && (
            <tr>
              <th colSpan={1}></th>{/* Empty column before Toughness */}
              <th colSpan={3} className="text-[10px] sm:text-xs font-semibold text-center">
                Toughness
              </th>
            </tr>
          )}
          {/* Main Header Row */}
          <tr>
            {Object.keys(orderedStats).map((key) => (
              <th
                key={key}
                className={`font-semibold text-center p-0.5 sm:p-1 border-b-[1px] border-[#a05236]
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' || key === 'Side' || key === 'Rear' ? 'bg-secondary/70' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${key === 'XP' && showXpLadder ? 'cursor-help' : ''}
                  ${getColumnBorderClass(key)}`}
                style={{ width: columnWidth }}
                {...(key === 'XP' && showXpLadder
                  ? { 'data-tooltip-id': xpLadderTooltipId }
                  : {})}
              >
                {/* Responsive Header Text */}
                {columnRenameMap[key]
                  ? (
                    <>
                      <span className="hidden sm:inline">{columnRenameMap[key].full}</span>
                      <span className="sm:hidden">{columnRenameMap[key].short}</span>
                    </>
                  )
                  : key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {Object.entries(orderedStats).map(([key, value]) => (
              <td
                key={key}
                className={`text-center p-0.5 sm:p-1
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' || key === 'Side' || key === 'Rear' ? 'bg-secondary/70' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${key === 'XP' && showXpLadder ? 'cursor-help' : ''}
                  ${getColumnBorderClass(key)}
                  ${isStatOutOfRange(key, value) ? 'text-red-500 font-semibold' : ''}`}
                style={{ width: columnWidth }}
                {...(key === 'XP' && showXpLadder
                  ? { 'data-tooltip-id': xpLadderTooltipId }
                  : {})}
              >
                {key === 'XP' ? formatXpCell(formatStatValue(key, value)) : formatStatValue(key, value)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {showXpLadder && (
        <XpLadderTooltip
          id={xpLadderTooltipId}
          currentXp={resolvedCurrentXp}
          editionSlug={editionSlug}
        />
      )}
    </div>
  );
}
