'use client';

import { useMemo } from 'react';

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

export default function GangTerritories({ gangId, campaigns = [] }: GangTerritoriesProps) {
  // Process and combine territories from all campaigns
  const territories = useMemo(() => {
    const allTerritories: (Territory & { campaign_name: string })[] = [];
    
    campaigns.forEach(campaign => {
      if (campaign.territories && campaign.territories.length > 0) {
        // Add campaign name to each territory
        const territoriesWithCampaign = campaign.territories.map(territory => ({
          ...territory,
          campaign_name: campaign.campaign_name || 'Unknown Campaign'
        }));
        
        allTerritories.push(...territoriesWithCampaign);
      }
    });
    
    return allTerritories;
  }, [campaigns]);

  return (
    <div>
      <div className="px-6 py-3 bg-gray-50">
        <div className="text-sm font-medium text-gray-500">Territory Name</div>
      </div>
      <div className="divide-y">
        {territories.length > 0 ? (
          territories.map((territory) => (
            <div key={territory.id} className="px-6 py-3">
              <div className="flex justify-between">
                <div>
                  {territory.territory_name}
                  {territory.ruined && (
                    <span className="ml-2 text-xs text-red-500">(Ruined)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {territory.campaign_name}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-gray-500 italic text-center p-4">
            No territories controlled.
          </div>
        )}
      </div>
    </div>
  );
} 