"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Gang } from '@/app/lib/get-user-gangs'
import type { Campaign } from '@/app/lib/get-user-campaigns'
import type { CustomFighterType } from '@/types/fighter'
import { loadCampaignsTab, loadCustomAssetsTab, type CustomAssetsData } from '@/app/actions/home-tabs'
import { CustomiseGangTypes } from '@/components/customise/custom-gang-types'
import { CustomiseTradingPosts } from '@/components/customise/custom-trading-posts'
import { CustomiseCollections } from '@/components/customise/custom-collections'
import { CustomiseEquipment } from '@/components/customise/custom-equipment'
import { CustomiseFighters } from '@/components/customise/custom-fighters'
import { CustomiseSkills } from '@/components/customise/custom-skills'
import { GangsTab } from '@/components/home/gangs-tab'
import { CampaignsTab } from '@/components/home/campaigns-tab'

type TabKey = 'gangs' | 'campaigns' | 'customassets'
const TAB_KEYS: TabKey[] = ['gangs', 'campaigns', 'customassets']

// Deferred tabs load their data on first open. 'error' means the load failed and the
// user can retry; loaded state is tracked by the data being non-null.
type LoadStatus = 'idle' | 'loading' | 'error'

interface HomeTabsProps {
  gangs: Gang[];
  userId: string;
}

function TabSpinner() {
  return (
    <div className="bg-card shadow-md rounded-lg p-4 flex justify-center py-10">
      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function TabError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-card shadow-md rounded-lg p-4 text-center space-y-3 py-10">
      <p className="text-muted-foreground">Something went wrong loading this tab.</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}

export default function HomeTabs({ gangs, userId }: HomeTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);

  // Campaigns tab (lazy)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignsStatus, setCampaignsStatus] = useState<LoadStatus>('idle');
  const campaignsStarted = useRef(false);

  // Custom Assets tab (lazy)
  const [customAssets, setCustomAssets] = useState<CustomAssetsData | null>(null);
  const [customAssetsStatus, setCustomAssetsStatus] = useState<LoadStatus>('idle');
  const customAssetsStarted = useRef(false);

  // Fighter types are held in local state so a gang-type rename can optimistically
  // update the fighters that reference it. Seeded once the Custom Assets tab loads.
  const [fighterTypes, setFighterTypes] = useState<CustomFighterType[]>([]);

  const ensureCampaigns = useCallback(() => {
    if (campaignsStarted.current) return;
    campaignsStarted.current = true;
    setCampaignsStatus('loading');
    loadCampaignsTab()
      .then(data => {
        setCampaigns(data);
        setCampaignsStatus('idle');
      })
      .catch(() => setCampaignsStatus('error'));
  }, []);

  const ensureCustomAssets = useCallback(() => {
    if (customAssetsStarted.current) return;
    customAssetsStarted.current = true;
    setCustomAssetsStatus('loading');
    loadCustomAssetsTab()
      .then(data => {
        setCustomAssets(data);
        setFighterTypes(data.customFighterTypes);
        setCustomAssetsStatus('idle');
      })
      .catch(() => setCustomAssetsStatus('error'));
  }, []);

  const retryCampaigns = useCallback(() => {
    campaignsStarted.current = false;
    ensureCampaigns();
  }, [ensureCampaigns]);

  const retryCustomAssets = useCallback(() => {
    customAssetsStarted.current = false;
    ensureCustomAssets();
  }, [ensureCustomAssets]);

  // Kick off the fetch when a deferred tab becomes active. Covers button clicks,
  // deep-links (?tab=...) and the homeTabSwitch event since all funnel through activeTab.
  useEffect(() => {
    if (activeTab === 1) ensureCampaigns();
    if (activeTab === 2) ensureCustomAssets();
  }, [activeTab, ensureCampaigns, ensureCustomAssets]);

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

        {activeTab === 1 && (
          campaigns !== null
            ? <CampaignsTab campaigns={campaigns} />
            : campaignsStatus === 'error'
              ? <TabError onRetry={retryCampaigns} />
              : <TabSpinner />
        )}

        {activeTab === 2 && (
          customAssets !== null
            ? (
              <div className="bg-card shadow-md rounded-lg p-4 space-y-6">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold mb-2">Custom Assets</h2>
                  <p className="text-muted-foreground">
                    Create your own Gang Types, Fighters, Equipment, Skills, Skill sets and Trading Posts and share them to campaigns you&apos;re an Arbitrator of. Bundle them into Asset Collections to apply a whole themed set to a campaign at once, or copy another arbitrator&apos;s asset collection into your account. Custom Territories and Scenarios are created in the campaign pages.
                  </p>
                </div>

                <CustomiseEquipment
                  initialEquipment={customAssets.customEquipment}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                />

                <CustomiseFighters
                  initialFighters={fighterTypes}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                />

                <CustomiseSkills
                  initialSkills={customAssets.customSkills}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                />

                <CustomiseGangTypes
                  initialGangTypes={customAssets.customGangTypes}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                  onGangTypeUpdated={handleGangTypeUpdated}
                  onGangTypeUpdateRollback={handleGangTypeUpdateRollback}
                />

                <CustomiseTradingPosts
                  initialTradingPosts={customAssets.customTradingPosts}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                />

                {/* Collections work like the other custom assets: always editable here; the
                    Share action gates itself to campaigns the user arbitrates. */}
                <CustomiseCollections
                  initialCollections={customAssets.customCollections}
                  userId={userId}
                  userCampaigns={customAssets.userCampaigns}
                  customEquipment={customAssets.customEquipment}
                  customFighterTypes={fighterTypes}
                  customSkills={customAssets.customSkills}
                  customGangTypes={customAssets.customGangTypes}
                  customTradingPosts={customAssets.customTradingPosts}
                />
              </div>
            )
            : customAssetsStatus === 'error'
              ? <TabError onRetry={retryCustomAssets} />
              : <TabSpinner />
        )}
      </div>
    </div>
  );
}
