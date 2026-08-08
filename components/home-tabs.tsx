"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import type { Gang } from '@/app/lib/get-user-gangs'
import type { CustomEquipment } from '@/app/lib/customise/custom-equipment'
import type { CustomSkill } from '@/app/lib/customise/custom-skills'
import type { CustomFighterType } from '@/types/fighter'
import type { CustomGangType } from '@/app/actions/customise/custom-gang-types'
import type { CustomTradingPost } from '@/app/actions/customise/custom-trading-posts'
import type { CustomCollectionWithItems } from '@/app/lib/customise/custom-collections'
import type { UserCampaign } from '@/types/campaign'
import { CustomiseGangTypes } from '@/components/customise/custom-gang-types'
import { CustomiseTradingPosts } from '@/components/customise/custom-trading-posts'
import { CustomiseCollections } from '@/components/customise/custom-collections'
import { CustomiseEquipment } from '@/components/customise/custom-equipment'
import { CustomiseFighters } from '@/components/customise/custom-fighters'
import { CustomiseSkills } from '@/components/customise/custom-skills'
import { GangsTab } from '@/components/home/gangs-tab'
import { CampaignsTab } from '@/components/home/campaigns-tab'
import { EDITION_N23, sameEditionForDisplay } from '@/types/edition'

type TabKey = 'gangs' | 'campaigns' | 'customassets'
const TAB_KEYS: TabKey[] = ['gangs', 'campaigns', 'customassets']

interface HomeTabsProps {
  gangs: Gang[];
  campaigns: Campaign[];
  userId: string;
  customEquipment: CustomEquipment[];
  customFighterTypes: CustomFighterType[];
  customSkills: CustomSkill[];
  customGangTypes: CustomGangType[];
  customTradingPosts: CustomTradingPost[];
  customCollections: CustomCollectionWithItems[];
  userCampaigns: UserCampaign[];
}

export default function HomeTabs({
  gangs,
  campaigns,
  userId,
  customEquipment,
  customFighterTypes,
  customSkills,
  customGangTypes,
  customTradingPosts,
  customCollections,
  userCampaigns
}: HomeTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);
  const [fighterTypes, setFighterTypes] = useState<CustomFighterType[]>(customFighterTypes);
  // Custom Assets stays N23-only and must not touch the shared home edition store
  // (Gangs / Campaigns / Create modals). Revisit when skill-type and fighter
  // authoring pickers are edition-filtered (CustomiseSkills fetchSkillTypes;
  // CustomiseFighters gang/skill/equipment lists).
  const matchesCustomEdition = (itemEditionSlug: string | null | undefined) =>
    sameEditionForDisplay(itemEditionSlug, EDITION_N23);

  const filteredEquipment = useMemo(
    () => customEquipment.filter(item => matchesCustomEdition(item.edition_slug)),
    [customEquipment]
  );
  const filteredFighterTypes = useMemo(
    () => fighterTypes.filter(item => matchesCustomEdition(item.edition_slug)),
    [fighterTypes]
  );
  const filteredSkills = useMemo(
    () => customSkills.filter(item => matchesCustomEdition(item.edition_slug)),
    [customSkills]
  );
  const filteredGangTypes = useMemo(
    () => customGangTypes.filter(item => matchesCustomEdition(item.edition_slug)),
    [customGangTypes]
  );
  const filteredTradingPosts = useMemo(
    () => customTradingPosts.filter(item => matchesCustomEdition(item.edition_slug)),
    [customTradingPosts]
  );
  const filteredCollections = useMemo(
    () => customCollections.filter(item => matchesCustomEdition(item.edition_slug)),
    [customCollections]
  );

  const handleGangTypeUpdated = useCallback((gangTypeId: string, newName: string): CustomFighterType[] => {
    const previous = fighterTypes;
    setFighterTypes(prev =>
      prev.map(f =>
        f.custom_gang_type_id === gangTypeId ? { ...f, gang_type: newName } : f
      )
    );
    return previous;
  }, [fighterTypes]);

  const handleGangTypeUpdateRollback = useCallback((previousFighters: CustomFighterType[]) => {
    setFighterTypes(previousFighters);
  }, []);

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

  const tabParam = searchParams.get('tab') as TabKey | null;
  const [prevTabParam, setPrevTabParam] = useState(tabParam);
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam);
    const tabIndex = tabParam ? TAB_KEYS.indexOf(tabParam) : -1;
    if (tabIndex >= 0) {
      setActiveTab(tabIndex);
    } else {
      setActiveTab(0);
      updateUrlParam('gangs');
    }
  }

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
                Create your own Gang Types, Fighters, Equipment, Skills, Skill sets and Trading Posts and share them to campaigns you&apos;re an Arbitrator of. Bundle them into Asset Collections to apply a whole themed set to a campaign at once, or copy another arbitrator&apos;s asset collection into your account. Custom Territories and Scenarios are created in the campaign pages.
              </p>
            </div>

            <CustomiseEquipment
              initialEquipment={filteredEquipment}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseFighters
              initialFighters={filteredFighterTypes}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseSkills
              initialSkills={filteredSkills}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            <CustomiseGangTypes
              initialGangTypes={filteredGangTypes}
              userId={userId}
              userCampaigns={userCampaigns}
              onGangTypeUpdated={handleGangTypeUpdated}
              onGangTypeUpdateRollback={handleGangTypeUpdateRollback}
            />

            <CustomiseTradingPosts
              initialTradingPosts={filteredTradingPosts}
              userId={userId}
              userCampaigns={userCampaigns}
            />

            {/* Collections work like the other custom assets: always editable here; the
                Share action gates itself to campaigns the user arbitrates. */}
            <CustomiseCollections
              initialCollections={filteredCollections}
              userId={userId}
              userCampaigns={userCampaigns}
              customEquipment={filteredEquipment}
              customFighterTypes={filteredFighterTypes}
              customSkills={filteredSkills}
              customGangTypes={filteredGangTypes}
              customTradingPosts={filteredTradingPosts}
            />
          </div>
        )}
      </div>
    </div>
  );
}
