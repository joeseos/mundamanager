import React from 'react';

// Add these types at the top of the file
type CrewStats = {
  'M': string | number;
  'Front': string | number;
  'Side': string | number;
  'Rear': string | number;
  'HP': string | number;
  'Hnd': string;
  'Sv': string;
  'BS': string;
  'Ld': string;
  'Cl': string;
  'Wil': string;
  'Int': string;
  'XP': number;
}

type FighterStats = {
  'M': string;
  'WS': string;
  'BS': string;
  'S': number;
  'T': number;
  'W': number;
  'I': string;
  'A': number;
  'Ld': string;
  'Cl': string;
  'Wil': string;
  'Int': string;
  'XP': number;
}

export type StatsType = CrewStats | FighterStats;

export const Table: React.FC<React.HTMLAttributes<HTMLTableElement>> = ({ children, ...props }) => (
  <table {...props}>{children}</table>
);

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...props }) => (
  <thead {...props}>{children}</thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...props }) => (
  <tbody {...props}>{children}</tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ children, ...props }) => (
  <tr {...props}>{children}</tr>
);

export const TableHeader: React.FC<React.ThHTMLAttributes<HTMLTableHeaderCellElement>> = ({ children, ...props }) => (
  <th {...props}>{children}</th>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableDataCellElement>> = ({ children, ...props }) => (
  <td {...props}>{children}</td>
);

interface StatsTableProps {
  data?: StatsType;
  isCrew?: boolean;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
}

// Add a type for valid stat keys
type StatKey = keyof CrewStats | keyof FighterStats;

export function StatsTable({ data, isCrew, viewMode }: StatsTableProps) {
  if (!data || Object.keys(data).length === 0) {
    return <p>No characteristics available</p>;
  }

  // viewMode
  const pClass = viewMode === 'normal' ? 'p-1' : 'p-px';

  // Define the order of stats based on fighter type
  const statOrder = isCrew
    ? ['M', 'Front', 'Side', 'Rear', 'HP', 'Hnd', 'Sv', 'BS', 'Ld', 'Cl', 'Wil', 'Int', 'XP'] as const
    : ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Cl', 'Wil', 'Int', 'XP'] as const;

  // Type guard to check if data is CrewStats
  const isCrewStats = (data: StatsType): data is CrewStats => {
    return 'Front' in data;
  };

  // Type guard to check if data is FighterStats
  const isFighterStats = (data: StatsType): data is FighterStats => {
    return 'WS' in data;
  };

  // Filter and sort the stats according to the correct order
  const orderedStats = statOrder
    .filter(key => {
      if (isCrew && isCrewStats(data)) {
        return key in data;
      }
      if (!isCrew && isFighterStats(data)) {
        return key in data;
      }
      return false;
    })
    .reduce<Record<string, number | string>>((acc, key) => {
      if (isCrew && isCrewStats(data)) {
        acc[key] = data[key as keyof CrewStats];
      } else if (!isCrew && isFighterStats(data)) {
        acc[key] = data[key as keyof FighterStats];
      }
      return acc;
    }, {});

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

  // Set all columns to the same width
  const columnCount = Object.keys(orderedStats).length;
  const columnWidth = `${100 / columnCount}%`;

  return (
    <div className="w-full">
      <table className={`w-full text-[11px] border-collapse ${viewMode === 'normal' ? 'sm:text-sm' : ''} ${isCrew && viewMode === 'normal' ? '-mt-3' : ''}`}>
        <thead>
          {/* Conditionally Render Toughness Header Row */}
          {isCrew && viewMode === 'normal' && (
            <tr>
              <th colSpan={1}></th>{/* Empty column before Toughness */}
              <th colSpan={3} className="text-[11px] sm:text-xs font-semibold text-center print:hidden">
                Toughness
              </th>
            </tr>
          )}
          {/* Main Header Row */}
          <tr>
            {Object.keys(orderedStats).map((key) => (
              <th
                key={key}
                className={`${pClass} font-semibold text-center border-b-[1px] border-[#a05236]
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'Side' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'Rear' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${getColumnBorderClass(key)}`}
                style={{ width: columnWidth }}
              >
                {/* Responsive Header Text */}
                {columnRenameMap[key] ? (
                  <>
                    {/* Full label: only if normal view and not small screen */}
                    {viewMode === 'normal' && (
                      <span className="hidden sm:inline">{columnRenameMap[key].full}</span>
                    )}
                    {/* Short label: if not normal view, or on small screen */}
                    {(viewMode !== 'normal') && (
                      <span>{columnRenameMap[key].short}</span>
                    )}
                    {viewMode === 'normal' && (
                      <span className="sm:hidden">{columnRenameMap[key].short}</span>
                    )}
                  </>
                ) : key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {Object.entries(orderedStats).map(([key, value]) => (
              <td
                key={key}
                className={`${pClass} text-center
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'Front' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'Side' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'Rear' ? 'bg-[rgba(255,255,255,0.7)]' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${getColumnBorderClass(key)}`}
                style={{ width: columnWidth }}
              >
                {value}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
