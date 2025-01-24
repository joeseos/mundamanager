import React from 'react';

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
  data?: Record<string, number | string>;
  isCrew?: boolean;
}

export function StatsTable({ data, isCrew = false }: StatsTableProps) {
  if (!data || Object.keys(data).length === 0) {
    return <p>No stats available</p>;
  }

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
    }
    if (key === 'Ld') return 'border-l-[1px] border-[#a05236]';
    if (key === 'XP') return 'border-l-[1px] border-[#a05236]';
    return '';
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
            {Object.keys(data).map((key) => (
              <th
                key={key}
                className={`font-semibold text-center p-1 border-b-[1px] border-[#a05236]
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
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
            {Object.entries(data).map(([key, value]) => (
              <td
                key={key}
                className={`text-center p-1
                  ${specialBackgroundStats.includes(key) ? 'bg-[rgba(162,82,54,0.3)]' : ''}
                  ${key === 'XP' ? 'bg-[rgba(162,82,54,0.7)] text-white' : ''}
                  ${getColumnBorderClass(key)}`}
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
