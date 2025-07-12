'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface Territory {
  id: string;
  territory_id?: string;
  territory_name: string;
  ruined?: boolean;
  created_at?: string;
}

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  territories?: Territory[];
  [key: string]: any;
}

// Props interface with campaigns data
interface GangTerritoriesProps {
  gangId: string;
  campaigns: Campaign[];
}

export default function GangTerritories({
  gangId,
  campaigns = [],
}: GangTerritoriesProps) {
  // Process and combine territories from all campaigns
  const territories = useMemo(() => {
    const allTerritories: (Territory & { campaign_name: string })[] = [];

    campaigns.forEach((campaign) => {
      if (campaign.territories && campaign.territories.length > 0) {
        // Add campaign name to each territory
        const territoriesWithCampaign = campaign.territories.map(
          (territory) => ({
            ...territory,
            campaign_name: campaign.campaign_name || 'Unknown Campaign',
          })
        );

        allTerritories.push(...territoriesWithCampaign);
      }
    });

    return allTerritories;
  }, [campaigns]);

  return (
    <div>
      <div className="divide-y">
        {campaigns.length > 0 ? (
          [...campaigns]
            .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name))
            .map((campaign) => (
              <div key={campaign.campaign_id} className="mb-6">
                {/* Campaign Header */}
                <div className="text-gray-600 mb-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-1 text-sm">
                      Campaign:{' '}
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-secondary"
                      >
                        <Link
                          href={`/campaigns/${campaign.campaign_id}`}
                          className="flex items-center"
                        >
                          {campaign.campaign_name}
                        </Link>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>Role: {campaign.role ?? 'N/A'}</span>
                      <span>Status: {campaign.status ?? 'Unknown'}</span>
                      <span>Joined: {campaign.joined_at ?? 'Unknown'}</span>
                    </div>
                  </div>
                </div>

                {/* Territories Table */}
                {campaign.territories && campaign.territories.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-2">
                      <thead className="text-sm text-gray-700 px-0 py-2">
                        <tr>
                          <th className="px-4 py-2 font-medium text-left">
                            Territory
                          </th>
                          <th className="px-4 py-2 font-medium text-right">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...campaign.territories]
                          .sort((a, b) =>
                            a.territory_name.localeCompare(b.territory_name)
                          )
                          .map((territory) => (
                            <tr key={territory.id}>
                              <td className="px-4 py-2 text-left bg-gray-50 rounded-md">
                                {territory.territory_name}
                              </td>
                              <td className="px-4 py-2 text-right bg-gray-50 rounded-md">
                                {territory.ruined !== null && (
                                  <span
                                    className={
                                      territory.ruined
                                        ? 'text-red-500'
                                        : 'text-green-600'
                                    }
                                  >
                                    {territory.ruined ? 'Ruined' : 'Intact'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-center">
                    No territories controlled.
                  </div>
                )}
              </div>
            ))
        ) : (
          <div className="text-gray-500 italic text-center p-4">
            No campaigns joined.
          </div>
        )}
      </div>
    </div>
  );
}
