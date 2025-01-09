import React from 'react';

const formatStatValue = (key: string, value: number | string) => {
  if (key === 'BS' && value === '0+') return '-';
  
  return value;
};

export function FighterStatsTable({ data }: { data?: Record<string, number | string> }) {
  if (!data || Object.keys(data).length === 0) {
    return <p>No stats available</p>;
  }

  return (
    <div className="w-full">
      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr>
            {Object.keys(data).map((key) => (
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
            {Object.entries(data).map(([key, value]) => (
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