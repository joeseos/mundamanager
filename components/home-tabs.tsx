"use client"

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import type { Gang } from '@/app/lib/get-user-gangs'
import type { CustomEquipment } from '@/app/lib/customise/custom-equipment'
import type { CustomTerritory } from '@/app/lib/customise/custom-territories'
import type { CustomFighterType } from '@/types/fighter'
import { CustomiseEquipment } from '@/components/customise/custom-equipment'
import { CustomiseTerritories } from '@/components/customise/custom-territories'
import { CustomiseFighters } from '@/components/customise/custom-fighters'

interface UserCampaign {
  id: string;
  campaign_name: string;
  status: string | null;
}

type TabKey = 'gangs' | 'campaigns' | 'customassets'
const TAB_KEYS: TabKey[] = ['gangs', 'campaigns', 'customassets']

interface HomeTabsProps {
  gangs: Gang[];
  campaigns: Campaign[];
  userId: string;
  customEquipment: CustomEquipment[];
  customTerritories: CustomTerritory[];
  customFighterTypes: CustomFighterType[];
  userCampaigns: UserCampaign[];
}

export default function HomeTabs({
  gangs,
  campaigns,
  userId,
  customEquipment,
  customTerritories,
  customFighterTypes,
  userCampaigns
}: HomeTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);

  const updateUrlParam = useCallback((tab: TabKey) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === tab) return;
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleTabChange = useCallback((tabIndex: number, syncUrl = true) => {
    setActiveTab(tabIndex);
    if (syncUrl) {
      updateUrlParam(TAB_KEYS[tabIndex]);
    }
  }, [updateUrlParam]);

  useEffect(() => {
    const handleTabSwitch = (event: Event) => {
      const customEvent = event as CustomEvent<TabKey>;
      const tab = customEvent.detail;
      if (!tab) return;

      const tabIndex = TAB_KEYS.indexOf(tab);
      if (tabIndex === -1) return;
      handleTabChange(tabIndex);
    };

    window.addEventListener('homeTabSwitch', handleTabSwitch as EventListener);

    return () => {
      window.removeEventListener('homeTabSwitch', handleTabSwitch as EventListener);
    };
  }, [handleTabChange]);

  // Check for tab parameter in URL
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabKey | null;
    const tabIndex = tabParam ? TAB_KEYS.indexOf(tabParam) : -1;

    if (tabIndex >= 0) {
      handleTabChange(tabIndex, false);
    } else {
      handleTabChange(0, false);
      updateUrlParam('gangs');
    }
  }, [searchParams, handleTabChange, updateUrlParam]);

  const tabTitles = ['Gangs', 'Campaigns', 'Custom Assets'];

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="bg-card shadow-md rounded-lg mb-4 flex justify-center">
        {tabTitles.map((title, index) => (
          <button
            key={index}
            onClick={() => handleTabChange(index)}
            className={`md:[word-spacing:0vw] [word-spacing:100vw] flex-1 md:p-4 p-2 leading-none text-center transition-colors ${
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
            <h2 className="text-xl md:text-2xl font-bold mb-4">Gangs</h2>
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
                          src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp"
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
            <h2 className="text-xl md:text-2xl font-bold mb-4">Campaigns</h2>
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
                              e.currentTarget.src = "https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/underhive-gang-badzone-enforcers_ntnpzu.jpg";
                            }}
                          />
                        ) : (
                          <div className="absolute w-[60px] h-[60px] rounded-full bg-secondary z-10 flex items-center justify-center">
                            {campaign.campaign_name.charAt(0)}
                          </div>
                        )}
                        <Image
                          src="https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/cogwheel-gang-portrait_vbu4c5.webp"
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

        {activeTab === 2 && (
          <div className="bg-card shadow-md rounded-lg p-4 space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold mb-2">Custom Assets</h2>
              <p className="text-muted-foreground">
                Create your own Equipment, Fighters, and Territories for your gangs and campaigns.
              </p>
            </div>

            <CustomiseEquipment
              initialEquipment={customEquipment}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseFighters
              initialFighters={customFighterTypes}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseTerritories initialTerritories={customTerritories} />
          </div>
        )}
      </div>
    </div>
  );
} 