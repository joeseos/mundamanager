'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
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

export function AdminSupportToolsModal({ onClose }: AdminSupportToolsModalProps) {
  const [activeTab, setActiveTab] = useState<SearchTab>('users');

  const [userOptions, setUserOptions] = useState<ComboboxOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);

  const [gangOptions, setGangOptions] = useState<ComboboxOption[]>([]);
  const [selectedGangId, setSelectedGangId] = useState('');
  const [selectedGang, setSelectedGang] = useState<GangResult | null>(null);
  const gangResultsRef = useRef<GangResult[]>([]);

  const [fighterOptions, setFighterOptions] = useState<ComboboxOption[]>([]);
  const [selectedFighterId, setSelectedFighterId] = useState('');
  const [selectedFighter, setSelectedFighter] = useState<FighterResult | null>(null);
  const fighterResultsRef = useRef<FighterResult[]>([]);

  const [campaignOptions, setCampaignOptions] = useState<ComboboxOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignResult | null>(null);
  const campaignResultsRef = useRef<CampaignResult[]>([]);

  const userSearchTimeout = useRef<NodeJS.Timeout>(undefined);
  const gangSearchTimeout = useRef<NodeJS.Timeout>(undefined);
  const fighterSearchTimeout = useRef<NodeJS.Timeout>(undefined);
  const campaignSearchTimeout = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    return () => {
      if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
      if (gangSearchTimeout.current) clearTimeout(gangSearchTimeout.current);
      if (fighterSearchTimeout.current) clearTimeout(fighterSearchTimeout.current);
      if (campaignSearchTimeout.current) clearTimeout(campaignSearchTimeout.current);
    };
  }, []);

  const handleUserInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const query = (e.target as HTMLInputElement).value;
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    if (!query || query.length < 2) {
      setUserOptions([]);
      return;
    }
    userSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/support/search-users?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: Array<{ id: string; username: string }> = await res.json();
          setUserOptions(data.map(u => ({ value: u.id, label: u.username })));
        }
      } catch (err) {
        console.error('User search error:', err);
      }
    }, 300);
  }, []);

  const handleGangInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const query = (e.target as HTMLInputElement).value;
    if (gangSearchTimeout.current) clearTimeout(gangSearchTimeout.current);
    if (!query || query.length < 2) {
      setGangOptions([]);
      return;
    }
    gangSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/support/search-gangs?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: GangResult[] = await res.json();
          gangResultsRef.current = data;
          setGangOptions(data.map(g => ({
            value: g.id,
            label: (
              <span>
                <span>{g.name}</span>
                <span className="text-xs text-muted-foreground"> • {g.username}</span>
              </span>
            ),
            displayValue: `${g.name} \u2022 ${g.username}`,
          })));
        }
      } catch (err) {
        console.error('Gang search error:', err);
      }
    }, 300);
  }, []);

  const handleFighterInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const query = (e.target as HTMLInputElement).value;
    if (fighterSearchTimeout.current) clearTimeout(fighterSearchTimeout.current);
    if (!query || query.length < 2) {
      setFighterOptions([]);
      return;
    }
    fighterSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/support/search-fighters?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: FighterResult[] = await res.json();
          fighterResultsRef.current = data;
          setFighterOptions(data.map(f => ({
            value: f.id,
            label: (
              <span>
                <span>{f.fighter_name}</span>
                <span className="text-xs text-muted-foreground"> • {f.gang_name}</span>
              </span>
            ),
            displayValue: `${f.fighter_name} \u2022 ${f.gang_name}`,
          })));
        }
      } catch (err) {
        console.error('Fighter search error:', err);
      }
    }, 300);
  }, []);

  const handleCampaignInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const query = (e.target as HTMLInputElement).value;
    if (campaignSearchTimeout.current) clearTimeout(campaignSearchTimeout.current);
    if (!query || query.length < 2) {
      setCampaignOptions([]);
      return;
    }
    campaignSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/support/search-campaigns?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: CampaignResult[] = await res.json();
          campaignResultsRef.current = data;
          setCampaignOptions(data.map(c => ({
            value: c.id,
            label: (
              <span>
                <span>{c.campaign_name}</span>
                <span className="text-xs text-muted-foreground"> • {c.campaign_type_name}</span>
              </span>
            ),
            displayValue: `${c.campaign_name} \u2022 ${c.campaign_type_name}`,
          })));
        }
      } catch (err) {
        console.error('Campaign search error:', err);
      }
    }, 300);
  }, []);

  const handleUserSelect = useCallback(async (userId: string) => {
    setSelectedUserId(userId);
    if (!userId) {
      setUserDetail(null);
      return;
    }
    setIsLoadingUserDetail(true);
    try {
      const res = await fetch(`/api/admin/support/users/${userId}`);
      if (res.ok) {
        setUserDetail(await res.json());
      }
    } catch (err) {
      console.error('User detail error:', err);
    } finally {
      setIsLoadingUserDetail(false);
    }
  }, []);

  const handleGangSelect = useCallback((gangId: string) => {
    setSelectedGangId(gangId);
    if (!gangId) {
      setSelectedGang(null);
      return;
    }
    setSelectedGang(gangResultsRef.current.find(g => g.id === gangId) || null);
  }, []);

  const handleFighterSelect = useCallback((fighterId: string) => {
    setSelectedFighterId(fighterId);
    if (!fighterId) {
      setSelectedFighter(null);
      return;
    }
    setSelectedFighter(fighterResultsRef.current.find(f => f.id === fighterId) || null);
  }, []);

  const handleCampaignSelect = useCallback((campaignId: string) => {
    setSelectedCampaignId(campaignId);
    if (!campaignId) {
      setSelectedCampaign(null);
      return;
    }
    setSelectedCampaign(campaignResultsRef.current.find(c => c.id === campaignId) || null);
  }, []);

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
          <div onInput={handleUserInput}>
            <Combobox
              options={userOptions}
              value={selectedUserId}
              onValueChange={handleUserSelect}
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
          <div onInput={handleGangInput}>
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
          <div onInput={handleFighterInput}>
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
          <div onInput={handleCampaignInput}>
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
