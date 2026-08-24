'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HiX } from 'react-icons/hi';
import { createBattleSession, addParticipant } from '@/app/actions/battle-sessions';
import Modal from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { buildGangComboboxOption } from '@/utils/gang-combobox-option';
import { editionsConflict, hasScenarioD6Roll, sameEditionForDisplay } from '@/types/edition';
import DiceRoller from '@/components/dice-roller';
import { rollNd6Outcome } from '@/utils/dice';
import { Button } from '@/components/ui/button';
import UserSearchBar, { type UserSearchResult } from '@/components/shared/user-search-bar';
import type { Scenario } from '@/types/campaign';

export interface CampaignGang {
  id: string;
  name: string;
  gang_colour?: string;
  user_id: string | null;
  owner_username: string;
}

interface Opponent {
  userId: string;
  username: string;
  gangId: string;
  gangName: string;
}

export default function CreateBattleModal({
  gangId,
  gangName,
  userId,
  campaignId,
  campaignGangs: campaignGangsProp,
  existingSessionId,
  existingGangIds = [],
  editionSlug,
  onClose,
}: {
  gangId?: string;
  gangName?: string;
  userId?: string;
  campaignId?: string;
  campaignGangs?: CampaignGang[];
  existingSessionId?: string;
  existingGangIds?: string[];
  /**
   * Edition the battle is played under — the session's when adding to an
   * existing one, otherwise the creating gang's. Scopes the skirmish opponent
   * picker, since a battle runs on exactly one ruleset. Campaign opponents need
   * no filtering: campaign membership is already edition-gated. The server
   * enforces the rule regardless; this only keeps unusable gangs out of view.
   */
  editionSlug?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isAddMode = !!existingSessionId;

  const [selectedScenario, setSelectedScenario] = useState('');
  const [customScenario, setCustomScenario] = useState('');

  // Non-campaign: user search + gang picker
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedUserGangId, setSelectedUserGangId] = useState('');

  // Built-up opponent list
  const [opponents, setOpponents] = useState<Opponent[]>([]);

  // Campaign: multi-select opponent gangs
  const [selectedCampaignGangIds, setSelectedCampaignGangIds] = useState<string[]>([]);

  // Campaign: user's own gang selection (when user has multiple gangs or none)
  const [selectedMyGangId, setSelectedMyGangId] = useState<string>(gangId ?? '');

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

  const { data: campaignGangsFetched } = useQuery({
    queryKey: ['campaign-gangs', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/campaign-gangs?campaignId=${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign gangs');
      return res.json() as Promise<CampaignGang[]>;
    },
    enabled: !!campaignId && !campaignGangsProp,
    staleTime: 0,
  });

  const campaignGangs = campaignGangsProp ?? campaignGangsFetched;

  const myGangs = campaignId && userId
    ? (campaignGangs ?? []).filter((g) => g.user_id === userId)
    : [];

  const effectiveGangId = gangId
    ?? (myGangs.length === 1 ? myGangs[0].id : (selectedMyGangId || undefined));
  const effectiveGangName = gangId
    ? gangName
    : myGangs.find((g) => g.id === selectedMyGangId)?.name;

  const { data: selectedUserGangs, isLoading: loadingGangs } = useQuery({
    queryKey: ['user-gangs', selectedUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${selectedUser!.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.gangs || []) as {
        id: string;
        name: string;
        rating: number;
        edition_slug?: string | null;
      }[];
    },
    enabled: !!selectedUser,
    // Opponents' gang lists change outside this client; refetch on every modal open
    staleTime: 0,
  });

  // Scenario rows are all edition-backfilled, so this filters on display rather
  // than guarding an action the way the opponent picker below does.
  const scenarios = (battleData?.scenarios ?? []).filter((s) =>
    sameEditionForDisplay(s.edition_slug, editionSlug)
  );
  const sortedScenarios = [...scenarios].sort((a, b) => {
    if (a.scenario_number === null) return 1;
    if (b.scenario_number === null) return -1;
    return a.scenario_number - b.scenario_number;
  });

  const showScenarioRoll = hasScenarioD6Roll(editionSlug);

  const opponentCampaignGangs = (campaignGangs ?? []).filter(
    (g) =>
      g.id !== effectiveGangId &&
      !myGangs.some((mg) => mg.id === g.id) &&
      !selectedCampaignGangIds.includes(g.id) &&
      !existingGangIds.includes(g.id)
  );

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user);
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

  // Filter out gangs already added as opponents, already in the session, or from
  // another edition. Skirmish opponents are searched across all users, so unlike
  // campaign gangs nothing upstream has constrained them to one ruleset.
  const availableUserGangs = (selectedUserGangs ?? []).filter(
    (g) =>
      g.id !== effectiveGangId &&
      !opponents.some((o) => o.gangId === g.id) &&
      !existingGangIds.includes(g.id) &&
      !editionsConflict(editionSlug, g.edition_slug)
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

      const scenarioName = selectedScenario === 'custom'
        ? customScenario.trim()
        : sortedScenarios.find((s) => s.id === selectedScenario)?.scenario_name;
      const allGangIds = effectiveGangId ? [effectiveGangId] : [];

      if (campaignId) {
        allGangIds.push(...selectedCampaignGangIds);
      } else {
        allGangIds.push(...opponents.map((o) => o.gangId));
      }

      if (allGangIds.length === 0) {
        return { success: false, error: 'At least one gang is required' };
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
        } else if ('session_id' in result && result.session_id) {
          setNavigating(true);
          const url = campaignId
            ? `/campaigns/${campaignId}/battle-session/${result.session_id}`
            : `/gang/${effectiveGangId}/battle-session/${result.session_id}`;
          router.push(url);
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
        {/* Your Gang: static for single gang, dropdown for multiple, hidden for none */}
        {gangId ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your Gang
            </label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              {gangName}
            </div>
          </div>
        ) : myGangs.length === 1 ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your Gang
            </label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              {myGangs[0].name}
            </div>
          </div>
        ) : myGangs.length > 1 ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your Gang
            </label>
            <Combobox
              options={myGangs.map(g => buildGangComboboxOption(g))}
              value={selectedMyGangId}
              onValueChange={setSelectedMyGangId}
              placeholder="Select your gang..."
            />
          </div>
        ) : null}

        {/* Opponent selection */}
        {campaignId ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Opponent Gang
            </label>
            <Combobox
              options={opponentCampaignGangs.map(g => buildGangComboboxOption(g))}
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
                        className="ml-2 text-muted-foreground hover:text-foreground focus:outline-hidden"
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
              <UserSearchBar
                placeholder="Search by username..."
                onSelect={handleSelectUser}
                excludeIds={opponents.map((o) => o.userId)}
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
                      className="ml-2 text-muted-foreground hover:text-foreground focus:outline-hidden"
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
          <div className="space-y-4">
            {showScenarioRoll && (
              <DiceRoller<Scenario>
                items={sortedScenarios}
                // scenario_number is numeric in Postgres, so it arrives as a string.
                getRange={(s) =>
                  s.scenario_number != null
                    ? { min: Number(s.scenario_number), max: Number(s.scenario_number) }
                    : null
                }
                getName={(s) => s.scenario_name}
                inline
                rollFn={() => rollNd6Outcome(1)}
                buttonText="Roll D6"
                disabled={isLoadingBattleData || sortedScenarios.length === 0}
                onRolled={(rolled) => {
                  const result = rolled[0];
                  if (!result) return;
                  setSelectedScenario(result.item.id);
                  setCustomScenario('');
                }}
              />
            )}
            <div className={showScenarioRoll ? 'border-t pt-3' : undefined}>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Scenario
              </label>
              <Combobox
                options={[
                  { value: 'custom', label: 'Custom' },
                  ...sortedScenarios.map((s) => ({
                    value: s.id,
                    label: s.scenario_number ? `${s.scenario_number}. ${s.scenario_name}` : s.scenario_name,
                  })),
                ]}
                value={selectedScenario === 'custom' ? 'custom' : selectedScenario}
                onValueChange={(value) => {
                  if (value === 'custom') {
                    setSelectedScenario('custom');
                    setCustomScenario('');
                  } else {
                    const isCustomValue = !sortedScenarios.some((s) => s.id === value);
                    if (isCustomValue) {
                      setSelectedScenario('custom');
                      setCustomScenario(value);
                    } else {
                      setSelectedScenario(value);
                      setCustomScenario('');
                    }
                  }
                }}
                placeholder="Select or search for a Scenario..."
                disabled={isLoadingBattleData}
                dropdownPlacement="down"
                allowCustom={true}
              />
              {selectedScenario === 'custom' && (
                <div className="mt-2">
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-md border border-border bg-muted"
                    placeholder="Enter custom Scenario name"
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );

  return createPortal(modalContent, document.body);
}
