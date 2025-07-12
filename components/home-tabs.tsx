'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import MyGangs from '@/components/my-gangs';
import MyCampaigns from '@/components/my-campaigns';
import type { Campaign } from '@/app/lib/get-user-campaigns';

interface CampaignType {
  id: string;
  campaign_type_name: string;
}

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  credits: number;
  reputation: number;
  meat: number | null;
  exploration_points: number | null;
  rating: number | null;
  created_at: string;
  last_updated: string;
}

interface HomeTabsProps {
  gangs: Gang[];
  campaigns: Campaign[];
  campaignTypes: CampaignType[] | null;
  userId: string;
}

export default function HomeTabs({
  gangs,
  campaigns,
  campaignTypes,
  userId,
}: HomeTabsProps) {
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
      <div className="bg-white shadow-md rounded-lg mb-4 flex">
        {tabTitles.map((title, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index
                ? 'text-black font-medium border-b-0 border-blue-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 0 && <MyGangs gangs={gangs} />}

        {activeTab === 1 && <MyCampaigns campaigns={campaigns} />}
      </div>
    </div>
  );
}
