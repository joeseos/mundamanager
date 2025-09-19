"use client"

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import MyGangs from '@/components/my-gangs'
import MyCampaigns from '@/components/my-campaigns'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import type { Gang } from '@/app/lib/get-user-gangs'

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface HomeTabsProps {
  gangs: Gang[];
  campaigns: Campaign[];
  campaignTypes: CampaignType[] | null;
  userId: string;
}

export default function HomeTabs({ gangs, campaigns, campaignTypes, userId }: HomeTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);

  // Check for tab parameter in URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'campaigns') {
      setActiveTab(1);
    } else if (tabParam === 'gangs') {
      setActiveTab(0);
    }
  }, [searchParams]);

  const tabTitles = ['Your Gangs', 'Your Campaigns'];

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="bg-card shadow-md rounded-lg mb-4 flex">
        {tabTitles.map((title, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index
                ? 'text-foreground font-medium border-b-0 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 0 && (
          <MyGangs gangs={gangs} />
        )}
        
        {activeTab === 1 && (
          <MyCampaigns campaigns={campaigns} />
        )}
      </div>
    </div>
  );
} 