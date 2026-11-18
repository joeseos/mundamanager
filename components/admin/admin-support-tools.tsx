'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SEARCH_DEBOUNCE_MS } from '@/components/shared/user-search-bar';
import Link from 'next/link';
import Modal from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { FaRegCopy } from 'react-icons/fa';

type SearchTab = 'users' | 'gangs' | 'fighters' | 'campaigns';

interface UserDetail {
  id: string;
  username: string;
  patreon_tier_id: string | null;
  patreon_tier_title: string | null;
  patron_status: string | null;
}

interface GangResult {
  id: string;
  name: string;
  user_id: string;
  username: string;
}

interface FighterResult {
  id: string;
  fighter_name: string;
  gang_id: string;
  gang_name: string;
}

interface CampaignResult {
  id: string;
  campaign_name: string;
  campaign_type_id: string;
  campaign_type_name: string;
}

type ComboboxOption = {
  value: string;
  label: string | React.ReactNode;
  displayValue?: string;
};

interface AdminSupportToolsModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

const SEARCH_MIN_LENGTH = 2;

/** A result with its owner or type muted after a bullet */
const toOption = (id: string, name: string, detail: string): ComboboxOption => ({
  value: id,
  label: (
    <span>
      <span>{name}</span>
      <span className="text-xs text-muted-foreground"> • {detail}</span>
    </span>
  ),
  displayValue: `${name} \u2022 ${detail}`,
});

/** Search-as-you-type against one /api/admin/support search route */
function useSupportSearch<T>(route: string) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data } = useQuery({
    queryKey: ['admin-support-search', route, debouncedQuery],
    queryFn: async ({ signal }): Promise<T[]> => {
      const res = await fetch(`/api/admin/support/${route}?query=${encodeURIComponent(debouncedQuery)}`, { signal });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQuery.length >= SEARCH_MIN_LENGTH,
    // Keep showing the last results while the next ones load
    placeholderData: keepPreviousData,
    // Support looks things up to answer users, so never show an older answer
    staleTime: 0,
    meta: { errorMessage: 'Search failed' },
  });

  const onInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    setQuery((e.target as HTMLInputElement).value);
  }, []);

  return { results: (query.length >= SEARCH_MIN_LENGTH && data) || [], onInput };
}

export function AdminSupportToolsModal({ onClose }: AdminSupportToolsModalProps) {
  const [activeTab, setActiveTab] = useState<SearchTab>('users');

  const userSearch = useSupportSearch<{ id: string; username: string }>('search-users');
  const [selectedUserId, setSelectedUserId] = useState('');
  const { data: userDetail, isLoading: isLoadingUserDetail } = useQuery({
    queryKey: ['admin-support-user', selectedUserId],
    queryFn: async (): Promise<UserDetail> => {
      const res = await fetch(`/api/admin/support/users/${selectedUserId}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    enabled: !!selectedUserId,
    staleTime: 0,
    meta: { errorMessage: 'Failed to load user' },
  });

  const gangSearch = useSupportSearch<GangResult>('search-gangs');
  const [selectedGangId, setSelectedGangId] = useState('');
  const [selectedGang, setSelectedGang] = useState<GangResult | null>(null);

  const fighterSearch = useSupportSearch<FighterResult>('search-fighters');
  const [selectedFighterId, setSelectedFighterId] = useState('');
  const [selectedFighter, setSelectedFighter] = useState<FighterResult | null>(null);

  const campaignSearch = useSupportSearch<CampaignResult>('search-campaigns');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignResult | null>(null);

  const userOptions: ComboboxOption[] = userSearch.results.map(u => ({ value: u.id, label: u.username }));
  const gangOptions = gangSearch.results.map(g => toOption(g.id, g.name, g.username));
  const fighterOptions = fighterSearch.results.map(f => toOption(f.id, f.fighter_name, f.gang_name));
  const campaignOptions = campaignSearch.results.map(c => toOption(c.id, c.campaign_name, c.campaign_type_name));

  const handleGangSelect = (gangId: string) => {
    setSelectedGangId(gangId);
    setSelectedGang(gangSearch.results.find(g => g.id === gangId) ?? null);
  };

  const handleFighterSelect = (fighterId: string) => {
    setSelectedFighterId(fighterId);
    setSelectedFighter(fighterSearch.results.find(f => f.id === fighterId) ?? null);
  };

  const handleCampaignSelect = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setSelectedCampaign(campaignSearch.results.find(c => c.id === campaignId) ?? null);
  };

  const tabs: { key: SearchTab; label: string }[] = [
    { key: 'users', label: 'Users' },
    { key: 'gangs', label: 'Gangs' },
    { key: 'fighters', label: 'Fighters' },
    { key: 'campaigns', label: 'Campaigns' },
  ];

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error('Failed to copy ID:', error);
    }
  }, []);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <Modal
      title="Support Tools"
      helper="Search users, gangs, fighters, and campaigns."
      onClose={onClose}
      width="2xl"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 justify-center">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            variant={activeTab === tab.key ? 'default' : 'outline'}
            className={`px-3 py-1.5 text-sm font-medium transition-colors max-w-full ${
              activeTab === tab.key
                ? ''
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div onInput={userSearch.onInput}>
            <Combobox
              options={userOptions}
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              placeholder="Search by username..."
              clearable
            />
          </div>

          {isLoadingUserDetail && (
            <p className="text-sm text-muted-foreground">Loading user details...</p>
          )}

          {userDetail && !isLoadingUserDetail && (
            <div className="space-y-2 p-2">
              <h4 className="text-base md:text-lg font-semibold">User</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Name:</span>
                <Link href={`/user/${userDetail.id}`} prefetch={false}>
                  <Badge variant="outline">{userDetail.username}</Badge>
                </Link>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Patreon:</span>
                {userDetail.patron_status === 'active_patron' && userDetail.patreon_tier_id ? (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <PatreonSupporterIcon
                      patreonTierId={userDetail.patreon_tier_id}
                      patreonTierTitle={userDetail.patreon_tier_title || undefined}
                    />
                    {userDetail.patreon_tier_title || 'Patreon Supporter'}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{userDetail.patron_status || 'None'}</Badge>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Link:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2 max-w-full"
                  onClick={() => copyToClipboard(`${baseUrl}/user/${userDetail.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void copyToClipboard(`${baseUrl}/user/${userDetail.id}`)
                    }
                  }}
                >
                  <span className="min-w-0 whitespace-normal break-all">{`${baseUrl}/user/${userDetail.id}`}</span>
                  <FaRegCopy className="h-3.5 w-3.5 shrink-0" />
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">ID:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2"
                  onClick={() => copyToClipboard(userDetail.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void copyToClipboard(userDetail.id);
                    }
                  }}
                >
                  <span>{userDetail.id}</span>
                  <FaRegCopy className="h-3.5 w-3.5" />
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'gangs' && (
        <div className="space-y-4">
          <div onInput={gangSearch.onInput}>
            <Combobox
              options={gangOptions}
              value={selectedGangId}
              onValueChange={handleGangSelect}
              placeholder="Search by gang name..."
              clearable
            />
          </div>

          {selectedGang && (
            <div className="space-y-2 p-2">
              <h4 className="text-base md:text-lg font-semibold">Gang</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Name:</span>
                <Link href={`/gang/${selectedGang.id}`} prefetch={false}>
                  <Badge variant="outline">{selectedGang.name}</Badge>
                </Link>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Link:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2 max-w-full"
                  onClick={() => copyToClipboard(`${baseUrl}/gang/${selectedGang.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void copyToClipboard(`${baseUrl}/gang/${selectedGang.id}`)
                    }
                  }}
                >
                  <span className="min-w-0 whitespace-normal break-all">{`${baseUrl}/gang/${selectedGang.id}`}</span>
                  <FaRegCopy className="h-3.5 w-3.5 shrink-0" />
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">ID:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2"
                  onClick={() => copyToClipboard(selectedGang.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void copyToClipboard(selectedGang.id);
                    }
                  }}
                >
                  <span>{selectedGang.id}</span>
                  <FaRegCopy className="h-3.5 w-3.5" />
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'fighters' && (
        <div className="space-y-4">
          <div onInput={fighterSearch.onInput}>
            <Combobox
              options={fighterOptions}
              value={selectedFighterId}
              onValueChange={handleFighterSelect}
              placeholder="Search by fighter name..."
              clearable
            />
          </div>

          {selectedFighter && (
            <div className="space-y-2 p-2">
              <h4 className="text-base md:text-lg font-semibold">Fighter</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Name:</span>
                <Link href={`/fighter/${selectedFighter.id}`} prefetch={false}>
                  <Badge variant="outline">{selectedFighter.fighter_name}</Badge>
                </Link>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Link:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2 max-w-full"
                  onClick={() => copyToClipboard(`${baseUrl}/fighter/${selectedFighter.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void copyToClipboard(`${baseUrl}/fighter/${selectedFighter.id}`)
                    }
                  }}
                >
                  <span className="min-w-0 whitespace-normal break-all">{`${baseUrl}/fighter/${selectedFighter.id}`}</span>
                  <FaRegCopy className="h-3.5 w-3.5 shrink-0" />
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">ID:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2"
                  onClick={() => copyToClipboard(selectedFighter.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void copyToClipboard(selectedFighter.id);
                    }
                  }}
                >
                  <span>{selectedFighter.id}</span>
                  <FaRegCopy className="h-3.5 w-3.5" />
                </Badge>
              </div>

              <hr className="my-6 border-t border-border" />
              <h4 className="text-base md:text-lg font-semibold">Gang</h4>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Name:</span>
                <Link href={`/gang/${selectedFighter.gang_id}`} prefetch={false}>
                  <Badge variant="outline">{selectedFighter.gang_name}</Badge>
                </Link>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Link:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2 max-w-full"
                  onClick={() => copyToClipboard(`${baseUrl}/gang/${selectedFighter.gang_id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void copyToClipboard(`${baseUrl}/gang/${selectedFighter.gang_id}`)
                    }
                  }}
                >
                  <span className="min-w-0 whitespace-normal break-all">{`${baseUrl}/gang/${selectedFighter.gang_id}`}</span>
                  <FaRegCopy className="h-3.5 w-3.5 shrink-0" />
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">ID:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2"
                  onClick={() => copyToClipboard(selectedFighter.gang_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void copyToClipboard(selectedFighter.gang_id);
                    }
                  }}
                >
                  <span>{selectedFighter.gang_id}</span>
                  <FaRegCopy className="h-3.5 w-3.5" />
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div onInput={campaignSearch.onInput}>
            <Combobox
              options={campaignOptions}
              value={selectedCampaignId}
              onValueChange={handleCampaignSelect}
              placeholder="Search by campaign name..."
              clearable
            />
          </div>

          {selectedCampaign && (
            <div className="space-y-2 p-2">
              <h4 className="text-base md:text-lg font-semibold">Campaign</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Name:</span>
                <Link href={`/campaigns/${selectedCampaign.id}`} prefetch={false}>
                  <Badge variant="outline">{selectedCampaign.campaign_name}</Badge>
                </Link>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Type:</span>
                <Badge variant="secondary">{selectedCampaign.campaign_type_name}</Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">Link:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2 max-w-full"
                  onClick={() => copyToClipboard(`${baseUrl}/campaigns/${selectedCampaign.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void copyToClipboard(`${baseUrl}/campaigns/${selectedCampaign.id}`)
                    }
                  }}
                >
                  <span className="min-w-0 whitespace-normal break-all">{`${baseUrl}/campaigns/${selectedCampaign.id}`}</span>
                  <FaRegCopy className="h-3.5 w-3.5 shrink-0" />
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-14 shrink-0">ID:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none flex items-center gap-2"
                  onClick={() => copyToClipboard(selectedCampaign.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void copyToClipboard(selectedCampaign.id);
                    }
                  }}
                >
                  <span>{selectedCampaign.id}</span>
                  <FaRegCopy className="h-3.5 w-3.5" />
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
