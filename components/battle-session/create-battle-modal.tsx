'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HiX } from 'react-icons/hi';
import { createBattleSession, addParticipant } from '@/app/actions/battle-sessions';
import Modal from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import type { Scenario } from '@/types/campaign';

interface CreateBattleModalProps {
  gangId: string;
  gangName: string;
  campaignId?: string;
  existingSessionId?: string;
  onClose: () => void;
}

interface CampaignGang {
  id: string;
  name: string;
  user_id: string | null;
  owner_username: string;
}

interface Opponent {
  userId: string;
  username: string;
  gangId: string;
  gangName: string;
}

function SearchDropdown({
  inputRef,
  results,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  results: { id: string; username: string }[];
  onSelect: (profile: { id: string; username: string }) => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, [inputRef, results]);

  if (results.length === 0) return null;

  return createPortal(
    <div
      style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width }}
      className="z-[200] rounded-lg border bg-card shadow-lg"
    >
      <ul className="py-2">
        {results.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => onSelect(profile)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-muted"
            >
              {profile.username}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body
  );
}

export default function CreateBattleModal({
  gangId,
  gangName,
  campaignId,
  existingSessionId,
  onClose,
}: CreateBattleModalProps) {
  const router = useRouter();
  const isAddMode = !!existingSessionId;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedScenario, setSelectedScenario] = useState('');

  // Non-campaign: user search + gang picker
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null);
  const [selectedUserGangId, setSelectedUserGangId] = useState('');

  // Built-up opponent list
  const [opponents, setOpponents] = useState<Opponent[]>([]);

  // Campaign: multi-select opponent gangs
  const [selectedCampaignGangIds, setSelectedCampaignGangIds] = useState<string[]>([]);

  const { data: battleData, isLoading: isLoadingBattleData } = useQuery({
    queryKey: ['battle-data', campaignId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (campaignId) headers['X-Campaign-Id'] = campaignId;
      const res = await fetch('/api/campaigns/battles', { headers });
      if (!res.ok) throw new Error('Failed to fetch battle data');
      return res.json() as Promise<{ scenarios: Scenario[] }>;
    },
  });

  const { data: campaignGangs } = useQuery({
    queryKey: ['campaign-gangs', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign gangs');
      return res.json() as Promise<CampaignGang[]>;
    },
    enabled: !!campaignId,
  });

  const { data: selectedUserGangs, isLoading: loadingGangs } = useQuery({
    queryKey: ['user-gangs', selectedUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${selectedUser!.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.gangs || []) as { id: string; name: string; rating: number }[];
    },
    enabled: !!selectedUser,
  });

  const scenarios = battleData?.scenarios ?? [];
  const sortedScenarios = [...scenarios].sort((a, b) => {
    if (a.scenario_number === null) return 1;
    if (b.scenario_number === null) return -1;
    return a.scenario_number - b.scenario_number;
  });

  const opponentCampaignGangs = (campaignGangs ?? []).filter(
    (g) => g.id !== gangId && !selectedCampaignGangIds.includes(g.id)
  );

  // User search (non-campaign, debounced)
  useEffect(() => {
    if (!searchQuery.trim() || !showSuggestions || campaignId) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-users?query=${encodeURIComponent(searchQuery)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showSuggestions, campaignId]);

  const filteredSearchResults = searchResults.filter(
    (p) => !opponents.some((o) => o.userId === p.id)
  );

  const handleSelectUser = (profile: { id: string; username: string }) => {
    setSelectedUser(profile);
    setSearchQuery('');
    setShowSuggestions(false);
    setSearchResults([]);
    setSelectedUserGangId('');
  };

  const handleAddOpponent = () => {
    if (!selectedUser || !selectedUserGangId) return;
    const gang = selectedUserGangs?.find((g) => g.id === selectedUserGangId);
    if (!gang) return;

    setOpponents((prev) => [
      ...prev,
      {
        userId: selectedUser.id,
        username: selectedUser.username,
        gangId: gang.id,
        gangName: gang.name,
      },
    ]);
    setSelectedUser(null);
    setSelectedUserGangId('');
  };

  const removeOpponent = (opponentGangId: string) => {
    setOpponents((prev) => prev.filter((o) => o.gangId !== opponentGangId));
  };

  const addCampaignGang = (campaignGangId: string) => {
    setSelectedCampaignGangIds((prev) => [...prev, campaignGangId]);
  };

  const removeCampaignGang = (campaignGangId: string) => {
    setSelectedCampaignGangIds((prev) => prev.filter((id) => id !== campaignGangId));
  };

  // Filter out gangs already added as opponents
  const availableUserGangs = (selectedUserGangs ?? []).filter(
    (g) => g.id !== gangId && !opponents.some((o) => o.gangId === g.id)
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (isAddMode) {
        if (campaignId) {
          const gangsToAdd = (campaignGangs ?? []).filter((g) =>
            selectedCampaignGangIds.includes(g.id)
          );
          const results = await Promise.all(
            gangsToAdd.map((g) =>
              addParticipant({
                session_id: existingSessionId,
                gang_id: g.id,
                user_id: g.user_id ?? '',
              })
            )
          );
          const failed = results.filter((r) => !r.success);
          if (failed.length > 0) {
            return { success: false, error: `Failed to add ${failed.length} gang(s)` };
          }
          return { success: true };
        }
        // Non-campaign add mode
        const results = await Promise.all(
          opponents.map((o) =>
            addParticipant({
              session_id: existingSessionId,
              gang_id: o.gangId,
              user_id: o.userId,
            })
          )
        );
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          return { success: false, error: `Failed to add ${failed.length} gang(s)` };
        }
        return { success: true };
      }

      // Create mode
      const scenarioName = sortedScenarios.find((s) => s.id === selectedScenario)?.scenario_name;
      const allGangIds = [gangId];

      if (campaignId) {
        allGangIds.push(...selectedCampaignGangIds);
      } else {
        allGangIds.push(...opponents.map((o) => o.gangId));
      }

      return createBattleSession({
        campaign_id: campaignId,
        scenario: scenarioName,
        gang_ids: allGangIds,
      });
    },
    onSuccess: (result) => {
      if (result.success) {
        if (isAddMode) {
          toast.success('Player(s) added');
          onClose();
          router.refresh();
        } else if ('session_id' in result && result.session_id) {
          setNavigating(true);
          router.push(`/gang/${gangId}/battle-session/${result.session_id}`);
        }
      } else {
        toast.error(result.error || 'Failed');
      }
    },
    onError: () => toast.error('Something went wrong'),
  });

  const [navigating, setNavigating] = useState(false);

  const hasOpponents = campaignId
    ? selectedCampaignGangIds.length > 0
    : opponents.length > 0;

  const canConfirm = isAddMode ? hasOpponents : !!selectedScenario;

  const modalContent = (
    <Modal
      title={isAddMode ? 'Add Player' : 'New Battle'}
      onClose={onClose}
      onConfirm={async () => {
        createMutation.mutate();
        return false;
      }}
      confirmText={isAddMode ? 'Add Player' : 'Create Battle'}
      confirmDisabled={!canConfirm || createMutation.isPending || navigating}
      width="md"
    >
      <div className="space-y-4">
        {/* Your Gang */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Your Gang
          </label>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
            {gangName}
          </div>
        </div>

        {/* Opponent selection */}
        {campaignId ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Opponent Gang
            </label>
            <Combobox
              options={opponentCampaignGangs.map((g) => ({
                value: g.id,
                label: (
                  <span>
                    <span>{g.name}</span>
                    {g.owner_username && (
                      <span className="text-xs text-muted-foreground"> • {g.owner_username}</span>
                    )}
                  </span>
                ),
                displayValue: `${g.name} • ${g.owner_username}`,
              }))}
              value=""
              onValueChange={addCampaignGang}
              placeholder="Select opponent gang..."
              disabled={isLoadingBattleData}
            />
            {selectedCampaignGangIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedCampaignGangIds.map((id) => {
                  const gang = (campaignGangs ?? []).find((g) => g.id === id);
                  if (!gang) return null;
                  return (
                    <div
                      key={id}
                      className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                    >
                      <span>{gang.name} • {gang.owner_username}</span>
                      <button
                        type="button"
                        onClick={() => removeCampaignGang(id)}
                        className="ml-2 text-muted-foreground hover:text-foreground focus:outline-none"
                      >
                        <HiX size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Add Opponent
            </label>

            {/* User search */}
            {!selectedUser && (
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="Search by username..."
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                  </div>
                )}
              </div>
            )}
            {showSuggestions && filteredSearchResults.length > 0 && (
              <SearchDropdown
                inputRef={searchInputRef}
                results={filteredSearchResults}
                onSelect={handleSelectUser}
              />
            )}

            {/* Gang picker for selected user */}
            {selectedUser && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select a gang for <span className="font-medium text-foreground">{selectedUser.username}</span>
                </p>
                <div className="flex gap-2">
                  <Combobox
                    className="flex-1"
                    options={availableUserGangs.map((g) => ({
                      value: g.id,
                      label: `${g.name} (Rating: ${g.rating})`,
                    }))}
                    value={selectedUserGangId}
                    onValueChange={setSelectedUserGangId}
                    placeholder={loadingGangs ? 'Loading gangs...' : 'Select gang...'}
                    disabled={loadingGangs}
                  />
                  <Button
                    onClick={handleAddOpponent}
                    disabled={!selectedUserGangId}
                  >
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedUser(null);
                      setSelectedUserGangId('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Added opponents */}
            {opponents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {opponents.map((opponent) => (
                  <div
                    key={opponent.gangId}
                    className="bg-muted px-3 py-1 rounded-full flex items-center text-sm"
                  >
                    <span>{opponent.username} — {opponent.gangName}</span>
                    <button
                      type="button"
                      onClick={() => removeOpponent(opponent.gangId)}
                      className="ml-2 text-muted-foreground hover:text-foreground focus:outline-none"
                    >
                      <HiX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scenario picker (create mode only) */}
        {!isAddMode && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Scenario
            </label>
            <Combobox
              options={sortedScenarios.map((s) => ({
                value: s.id,
                label: s.scenario_number ? `${s.scenario_number}. ${s.scenario_name}` : s.scenario_name,
              }))}
              value={selectedScenario}
              onValueChange={setSelectedScenario}
              placeholder="Select scenario..."
              disabled={isLoadingBattleData}
              dropdownPlacement="down"
            />
          </div>
        )}
      </div>
    </Modal>
  );

  return createPortal(modalContent, document.body);
}
