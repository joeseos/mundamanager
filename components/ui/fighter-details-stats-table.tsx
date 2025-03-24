import React from 'react';
import { fighterCharacteristicLimits, crewCharacteristicLimits } from '@/utils/characteristicLimits';

const formatStatValue = (key: string, value: number | string) => {
  if (key === 'BS' && value === '0+') return '-';
  return value;
};

interface FighterDetailsStatsTableProps {
  data?: Record<string, number | string>;
  isCrew?: boolean;
}

export function FighterDetailsStatsTable({ data, isCrew }: FighterDetailsStatsTableProps) {
  if (!data || Object.keys(data).length === 0) {
    return <p>No characteristics available</p>;
  }

  // Define the order of stats based on fighter type
  const statOrder = isCrew
    ? ['M', 'Front', 'Side', 'Rear', 'HP', 'Hnd', 'Sv', 'BS', 'Ld', 'Cl', 'Wil', 'Int', 'XP']
    : ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Cl', 'Wil', 'Int', 'XP'];

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
    const limits = (isCrew ? crewCharacteristicLimits : fighterCharacteristicLimits)[key];
    if (!limits) return false;

    const valNum = parseValue(value);
    const min = parseValue(limits[0]);
    const max = parseValue(limits[1]);

    return valNum < min || valNum > max;
  };

  return (
    <div className="w-full">
      <table className="w-full text-xs sm:text-sm border-collapse">
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
                className={`font-semibold text-center p-1 border-b-[1px] border-[#a05236]
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' || key === 'Side' || key === 'Rear' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${getColumnBorderClass(key)}`}
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
                className={`text-center p-1
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' || key === 'Side' || key === 'Rear' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${getColumnBorderClass(key)}
                  ${isStatOutOfRange(key, value) ? 'text-red-500 font-semibold' : ''}`}
              >
                {formatStatValue(key, value)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
