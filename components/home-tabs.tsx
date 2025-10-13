"use client"

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
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
          <div className="bg-card shadow-md rounded-lg p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Your Gangs</h2>
            {gangs.length === 0 ? (
              <p className="text-center text-muted-foreground">No gangs created yet.</p>
            ) : (
              <ul className="space-y-3">
                {[...gangs].sort((a, b) => {
                  const dateA = new Date(b.last_updated || b.created_at).getTime();
                  const dateB = new Date(a.last_updated || a.created_at).getTime();
                  return dateA - dateB;
                }).map((gang) => (
                  <li key={gang.id}>
                    <a href={`/gang/${gang.id}`} className="flex items-center p-2 md:p-4 bg-muted rounded-md hover:bg-muted transition-colors duration-200">
                      <div className="relative w-[80px] md:w-20 h-[80px] md:h-20 mr-3 md:mr-4 flex-shrink-0 flex items-center justify-center">
                        {gang.image_url || gang.gang_type_image_url ? (
                          <Image
                            src={gang.image_url || gang.gang_type_image_url}
                            alt={gang.name}
                            width={60}
                            height={60}
                            className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90"
                            priority={false}
                            onError={(e) => {
                              console.error('Failed to load image:', e.currentTarget.src);
                              e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1732965431/default-gang_image.jpg";
                            }}
                          />
                        ) : (
                          <div className="absolute w-[60px] h-[60px] rounded-full bg-secondary z-10 flex items-center justify-center">
                            {gang.name.charAt(0)}
                          </div>
                        )}
                        <Image
                          src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1747056786/cogwheel-gang-portrait_vbu4c5.webp"
                          alt=""
                          width={80}
                          height={80}
                          className="absolute z-20 scale-110"
                          priority
                          sizes="80px, 80px"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <h3 className="text-lg md:text-xl font-medium text-foreground truncate">{gang.name}</h3>
                        <div className="text-sm md:text-base text-muted-foreground">
                          <span className="truncate block">
                            {gang.gang_type}
                            {gang.gang_variants && gang.gang_variants.length > 0
                              ? ` (${gang.gang_variants.map(v => v.variant).join(', ')})`
                              : ''}
                          </span>
                          <span>Rating: {gang.rating ?? 0}</span>
                          {gang.campaigns && gang.campaigns.length > 0 && (
                            <span className="block">Campaign: {gang.campaigns[0].campaign_name}</span>
                          )}
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 1 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Your Campaigns</h2>
            {campaigns.length === 0 ? (
              <p className="text-center text-muted-foreground">No campaigns created yet.</p>
            ) : (
              <ul className="space-y-3">
                {[...campaigns].sort((a, b) => {
                  const dateA = new Date(a.updated_at || a.created_at).getTime();
                  const dateB = new Date(b.updated_at || b.created_at).getTime();
                  return dateB - dateA;
                }).map((campaign) => (
                  <li key={campaign.campaign_member_id}>
                    <a href={`/campaigns/${campaign.id}`} className="flex items-center p-2 md:p-4 bg-muted rounded-md hover:bg-muted transition-colors duration-200">
                      <div className="relative w-[80px] md:w-20 h-[80px] md:h-20 mr-3 md:mr-4 flex-shrink-0 flex items-center justify-center">
                        {campaign.image_url || campaign.campaign_type_image_url ? (
                          <Image
                            src={campaign.image_url || campaign.campaign_type_image_url}
                            alt={campaign.campaign_name}
                            width={60}
                            height={60}
                            className="absolute rounded-full object-cover z-10 w-auto h-auto scale-90"
                            priority={false}
                            onError={(e) => {
                              console.error('Failed to load image:', e.currentTarget.src);
                              e.currentTarget.src = "https://res.cloudinary.com/dle0tkpbl/image/upload/v1735682275/IMG_6113_odsp7l.jpg";
                            }}
                          />
                        ) : (
                          <div className="absolute w-[60px] h-[60px] rounded-full bg-secondary z-10 flex items-center justify-center">
                            {campaign.campaign_name.charAt(0)}
                          </div>
                        )}
                        <Image
                          src="https://res.cloudinary.com/dle0tkpbl/image/upload/v1747056786/cogwheel-gang-portrait_vbu4c5.webp"
                          alt=""
                          width={80}
                          height={80}
                          className="absolute z-20 scale-110"
                          priority
                          sizes="80px, 80px"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <h3 className="text-lg md:text-xl font-medium text-foreground truncate">{campaign.campaign_name}</h3>
                        <div className="text-sm md:text-base text-muted-foreground">
                          <span className="truncate block">{campaign.campaign_type}</span>
                          {campaign.user_gangs && campaign.user_gangs.length > 0 && (
                            <span>
                              {campaign.user_gangs.length === 1
                                ? 'Your Gang: '
                                : 'Your Gangs: '}
                              {campaign.user_gangs
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(gang => gang.name)
                                .join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 