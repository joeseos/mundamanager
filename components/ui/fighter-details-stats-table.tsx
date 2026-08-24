'use client';

import React from 'react';
import { characteristicLimitsFor } from '@/utils/characteristicLimits';
import { hasCumulativeXp } from '@/types/edition';
import { XpLadderTooltip } from '@/components/ui/xp-ladder-tooltip';

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
    <div className="w-full min-w-0 overflow-x-auto">
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
