"use client"

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import type { Gang } from '@/app/lib/get-user-gangs'
import type { CustomEquipment } from '@/app/lib/customise/custom-equipment'
import type { CustomTerritory } from '@/app/lib/customise/custom-territories'
import type { CustomSkill } from '@/app/lib/customise/custom-skills'
import type { CustomFighterType } from '@/types/fighter'
import { CustomiseEquipment } from '@/components/customise/custom-equipment'
import { CustomiseTerritories } from '@/components/customise/custom-territories'
import { CustomiseFighters } from '@/components/customise/custom-fighters'
import { CustomiseSkills } from '@/components/customise/custom-skills'
import { GangsTab } from '@/components/home/gangs-tab'
import { CampaignsTab } from '@/components/home/campaigns-tab'

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
  customSkills: CustomSkill[];
  userCampaigns: UserCampaign[];
}

export default function HomeTabs({
  gangs,
  campaigns,
  userId,
  customEquipment,
  customTerritories,
  customFighterTypes,
  customSkills,
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
        {activeTab === 0 && <GangsTab gangs={gangs} />}

        {activeTab === 1 && <CampaignsTab campaigns={campaigns} />}

        {activeTab === 2 && (
          <div className="bg-card shadow-md rounded-lg p-4 space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold mb-2">Custom Assets</h2>
              <p className="text-muted-foreground">
                Create your own Equipment, Fighters, and Skills for your gangs and share them to campaigns you're an Arbitrator of.
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

            <CustomiseSkills
              initialSkills={customSkills}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseTerritories initialTerritories={customTerritories} readOnly />
          </div>
        )}
      </div>
    </div>
  );
}
