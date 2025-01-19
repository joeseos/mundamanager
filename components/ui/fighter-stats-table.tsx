import React from 'react';

const formatStatValue = (key: string, value: number | string) => {
  if (key === 'BS' && value === '0+') return '-';
  
  return value;
};

interface FighterStatsTableProps {
  data?: Record<string, number | string>;
  isCrew?: boolean;
}

export function FighterStatsTable({ data, isCrew }: FighterStatsTableProps) {
  if (!data || Object.keys(data).length === 0) {
    return <p>No stats available</p>;
  }

  // Define the order of stats based on fighter type
  const statOrder = isCrew 
    ? ['M', 'Front', 'Side', 'Rear', 'HP', 'Hnd', 'Sv', 'BS', 'Ld', 'Cl', 'Wil', 'Int', 'XP']
    : ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Cl', 'Wil', 'Int', 'XP'];

  // Filter and sort the stats according to the correct order
  const orderedStats = statOrder
    .filter(key => key in data)
    .reduce((acc, key) => ({
      ...acc,
      [key]: data[key]
    }), {} as Record<string, number | string>);

  return (
    <div className="w-full">
      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr>
            {Object.keys(orderedStats).map((key) => (
              <th 
                key={key} 
                className="font-semibold text-center p-1 border-b-2 border-[#a05236]"
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {Object.entries(orderedStats).map(([key, value]) => (
              <td 
                key={key} 
                className="text-center p-1"
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