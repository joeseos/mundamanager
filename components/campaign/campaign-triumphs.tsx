"use client"

import React from 'react';

interface CampaignTriumph {
  id: string;
  triumph: string;
  criteria: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
}

interface CampaignTriumphsProps {
  triumphs: CampaignTriumph[];
}

export default function CampaignTriumphs({ triumphs }: CampaignTriumphsProps) {
  if (!triumphs || triumphs.length === 0) {
    return (
      <div className="text-gray-500 italic text-center p-4">
        No triumphs available for this campaign type.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Triumph</th>
            <th className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap">Criteria</th>
          </tr>
        </thead>
        <tbody>
          {triumphs.map((triumph) => (
            <tr key={triumph.id} className="border-b last:border-0">
              <td className="w-2/5 px-4 py-2">
                <span className="font-medium">{triumph.triumph}</span>
              </td>
              <td className="w-3/5 px-4 py-2">
                {triumph.criteria}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 