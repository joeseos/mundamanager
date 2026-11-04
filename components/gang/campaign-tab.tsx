'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Tooltip } from 'react-tooltip';
import { renderDescriptionTooltip } from '@/components/ui/tooltip-renderers';
import { formatLocalDate } from '@/utils/local-date';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import type { GangBattleLog } from '@/app/lib/campaigns/[id]/get-campaign-data';
import type { BattleParticipant } from '@/types/campaign';
import { getWinnerIds } from '@/utils/battle-winners';
import Modal from "@/components/ui/modal";
import { BiSolidNotepad } from "react-icons/bi";
import { GiAncientRuins } from "react-icons/gi";
import { HiUser } from "react-icons/hi2";
import { IoHome } from "react-icons/io5";
import { MdLocalPolice, MdOutlineLocalPolice } from "react-icons/md";
import { GiHandcuffs } from "react-icons/gi";
import type { CampaignRole } from "@/types/campaign";

function getSubtypeRank(subtypes: string[] | null | undefined, editionSlug?: string | null) {
  const rank = getFighterSubtypeSortRank(subtypes, editionSlug);
  return rank === Infinity ? 99 : rank;
}

function breakdownRowKey(
  fighter: { fighter_name: string; fighter_type: string; fighter_subtypes?: string[] },
  index: number,
) {
  const subtypeKey = fighter.fighter_subtypes?.join(',') || '';
  return `${fighter.fighter_name}-${fighter.fighter_type}-${subtypeKey}-${index}`;
}

interface Territory {
  id: string;
  territory_id?: string;
  territory_name: string;
  playing_card?: string | null;
  description?: string | null;
  ruined?: boolean;
  default_gang_territory?: boolean;
  /** Credits the territory gives; null when unset */
  credits?: number | null;
  created_at?: string;
}

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  territories?: Territory[];
  [key: string]: any;
}

// Props interface with campaigns data
interface GangTerritoriesProps {
  gangId: string;
  campaigns: Campaign[];
  editionSlug?: string | null;
}


const formatRoleIcon = (role: CampaignRole | string | undefined) => {
  switch (role) {
    case 'OWNER':
      return <MdOutlineLocalPolice className="h-4 w-4" title="Owner" />;
    case 'ARBITRATOR':
      return <MdLocalPolice className="h-4 w-4" title="Arbitrator" />;
    case 'MEMBER':
      return <HiUser className="h-4 w-4" title="Member" />;
    default:
      return <HiUser className="h-4 w-4" title="Member" />;
  }
};

const getRoleTitle = (role: CampaignRole | string | undefined): string => {
  switch (role) {
    case 'OWNER':
      return 'Owner';
    case 'ARBITRATOR':
      return 'Arbitrator';
    case 'MEMBER':
      return 'Member';
    default:
      return 'Member';
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return formatLocalDate(date);
};

export default function GangTerritories({ gangId, campaigns = [], editionSlug = null }: GangTerritoriesProps) {
  const [selectedBattleReport, setSelectedBattleReport] = useState<GangBattleLog | null>(null);

  // Process and combine territories from all campaigns
  const territories = useMemo(() => {
    const allTerritories: (Territory & { campaign_name: string })[] = [];
    
    campaigns.forEach(campaign => {
      if (campaign.territories && campaign.territories.length > 0) {
        // Add campaign name to each territory
        const territoriesWithCampaign = campaign.territories.map(territory => ({
          ...territory,
          campaign_name: campaign.campaign_name || 'Unknown Campaign'
        }));
        
        allTerritories.push(...territoriesWithCampaign);
      }
    });
    
    return allTerritories;
  }, [campaigns]);

  // Played battles of this gang in all its campaigns, newest first
  const { data: battleLogs = [], isLoading: isLoadingBattles } = useQuery({
    queryKey: ['gang-battle-logs', gangId],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${gangId}/battle-logs`);
      if (!response.ok) throw new Error('Failed to fetch battle logs');
      return response.json() as Promise<GangBattleLog[]>;
    },
    // Refetch on each tab open, like before, so a battle logged on the campaign page shows straight away
    staleTime: 0,
  });

  // Fetch captives held by this gang
  const { data: captivesData } = useQuery({
    queryKey: ['gang-captives', gangId],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${gangId}/captives`);
      if (!response.ok) throw new Error('Failed to fetch captives');
      return response.json() as Promise<{
        captives: Array<{
          fighterId: string;
          fighterName: string;
          fighterType?: string;
          originalGangName: string;
        }>;
      }>;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const captives = captivesData?.captives ?? [];

  // Fetch fighter stats (OOA caused, deaths suffered)
  const { data: fighterStats } = useQuery({
    queryKey: ['gang-fighter-stats', gangId],
    queryFn: async () => {
      const response = await fetch(`/api/gangs/${gangId}/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch fighter stats');
      }
      return response.json() as Promise<{
        ooa_caused: number;
        deaths_suffered: number;
        ooa_breakdown?: Array<{ fighter_name: string; fighter_type: string; fighter_subtypes?: string[]; kills: number }>;
        deaths_breakdown?: Array<{ fighter_name: string; fighter_type: string; fighter_subtypes?: string[] }>;
      }>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const ooaCaused = fighterStats?.ooa_caused ?? 0;
  const deathsSuffered = fighterStats?.deaths_suffered ?? 0;

  const ooaBreakdown = useMemo(() => {
    const breakdown = fighterStats?.ooa_breakdown ?? [];
    return [...breakdown].sort(
      (a, b) => getSubtypeRank(a.fighter_subtypes, editionSlug) - getSubtypeRank(b.fighter_subtypes, editionSlug)
    );
  }, [fighterStats?.ooa_breakdown, editionSlug]);

  const deathsBreakdown = useMemo(() => {
    const breakdown = fighterStats?.deaths_breakdown ?? [];
    return [...breakdown].sort(
      (a, b) => getSubtypeRank(a.fighter_subtypes, editionSlug) - getSubtypeRank(b.fighter_subtypes, editionSlug)
    );
  }, [fighterStats?.deaths_breakdown, editionSlug]);

  return (
    <div>
      <div className="divide-y">
        {campaigns.length > 0 ? (
          [...campaigns]
            .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name))
            .map((campaign) => {
              const campaignBattles = battleLogs.filter(b => b.campaign_id === campaign.campaign_id);
              const campaignTotalBattles = campaignBattles.length;

              return (
              <div key={campaign.campaign_id} className="mb-6">
                {/* Campaign Header */}
                <div className="text-muted-foreground mb-4">
                  <div className="flex flex-wrap gap-4 mb-1">
                    <div className="flex items-center gap-1 text-sm">
                      Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        <Link href={`/campaigns/${campaign.campaign_id}`} prefetch={false} className="flex items-center">
                          {campaign.campaign_name}
                        </Link>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        Player&apos;s Role: 
                        <Badge variant="secondary" className="gap-1">
                          {formatRoleIcon(campaign.role)}
                          {getRoleTitle(campaign.role)}
                        </Badge>
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="grid grid-cols-2 md:gap-x-20 gap-x-10 text-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Territories:</span>
                          <span className="font-semibold">{campaign.territories?.length ?? 0}</span>
                        </div>
                        <div
                          className="flex justify-between cursor-help"
                          data-tooltip-id="ooa-caused-tooltip"
                        >
                          <span className="text-muted-foreground">OOA caused:</span>
                          <span className="font-semibold">{ooaCaused}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Battles fought:</span>
                          <span className="font-semibold">{campaignTotalBattles}</span>
                        </div>
                        <div
                          className="flex justify-between cursor-help"
                          data-tooltip-id="deaths-suffered-tooltip"
                        >
                          <span className="text-muted-foreground">Deaths suffered:</span>
                          <span className="font-semibold">{deathsSuffered}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Territories Table */}
                {campaign.territories && campaign.territories.length > 0 ? (
                  <div className="mt-8">
                    <h3 className="text-xl md:text-2xl font-bold mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        Territories
                      </div>
                      {campaign.territories.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {campaign.territories.length} controlled
                        </span>
                      )}
                    </h3>
                    <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted border-b">
                          <th className="px-2 py-2 font-medium text-center w-11 min-w-[2.75rem]">Ref.</th>
                          <th className="w-1/3 px-4 py-2 font-medium text-left">Territory</th>
                          <th className="w-1/4 px-4 py-2 font-medium text-left">
                            <span className="hidden sm:inline">Description</span>
                            <span className="sm:hidden">Desc.</span>
                          </th>
                          <th className="px-4 py-2 font-medium text-right">Credits</th>
                          <th className="px-4 py-2 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...campaign.territories]
                          .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                          .map((territory) => (
                            <tr key={territory.id} className="border-b last:border-0">
                              <td className="px-1 py-2 text-center align-middle">
                                <span className="text-gray-400 inline-block w-10 text-center">
                                  {territory.playing_card?.trim() ? territory.playing_card.trim() : '\u00A0'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-left">{territory.territory_name}</td>
                              <td className="px-4 py-2 text-left">
                                {territory.description?.trim() && (
                                  <span
                                    className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
                                    data-tooltip-id="gang-territory-description-tooltip"
                                    data-tooltip-title={territory.territory_name}
                                    data-tooltip-description={territory.description}
                                  >
                                    <BiSolidNotepad className="h-4 w-4 inline" aria-label="View territory description" />
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">{territory.credits ?? ''}</td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {territory.ruined && (
                                    <Badge 
                                      variant="destructive"
                                      className="font-medium items-center gap-1"
                                    >
                                      <GiAncientRuins className="h-3 w-3" />
                                      Ruined
                                    </Badge>
                                  )}
                                  {territory.default_gang_territory && (
                                    <Badge 
                                      variant="outline"
                                      className="font-medium items-center gap-1"
                                      title="Default gang territory"
                                    >
                                      <IoHome className="h-3 w-3" />
                                      Default
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground italic text-center py-4">No Territories controlled.</div>
                )}
              </div>
              );
            })
        ) : (
          <div className="text-muted-foreground italic text-center p-4">
            No campaigns joined.
          </div>
        )}
      </div>

      {/* Battle Logs Section */}
      {campaigns.length > 0 && (() => {
        // Calculate overall stats across all campaigns using the multi-winner
        // helper so this gang counts as a victor whenever it is flagged among
        // the winners (even on shared victories).
        const wins = battleLogs.filter(b => getWinnerIds(b).includes(gangId)).length;
        const losses = battleLogs.filter(b => {
          const winners = getWinnerIds(b);
          return winners.length > 0 && !winners.includes(gangId);
        }).length;
        const draws = battleLogs.filter(b => getWinnerIds(b).length === 0).length;
        const totalBattles = battleLogs.length;
        
        return (
          <div className="mt-8">
            <h3 className="text-xl md:text-2xl font-bold mb-4 flex items-center justify-between flex-wrap">
              <div className="flex items-center gap-2">
                Battle Logs
              </div>
              {totalBattles > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {wins > 0 && (
                    <span className="text-green-600">
                      {wins} {wins === 1 ? 'victory' : 'victories'}
                    </span>
                  )}
                  {losses > 0 && (
                    <>
                      {wins > 0 && <span>, </span>}
                      <span className="text-red-600">
                        {losses} {losses === 1 ? 'defeat' : 'defeats'}
                      </span>
                    </>
                  )}
                  {draws > 0 && (
                    <>
                      {(wins > 0 || losses > 0) && <span>, </span>}
                      <span className="text-muted-foreground">
                        {draws} {draws === 1 ? 'draw' : 'draws'}
                      </span>
                    </>
                  )}
                </span>
              )}
            </h3>
          {isLoadingBattles ? (
            <div className="text-muted-foreground italic text-center p-4">
              Loading battle logs...
            </div>
          ) : battleLogs.length === 0 ? (
            <div className="text-muted-foreground italic text-center p-4">
              No battle logs found for this gang.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Scenario</th>
                    <th className="px-4 py-2 text-left font-medium">Territory</th>
                    <th className="px-4 py-2 text-left font-medium">Opponent</th>
                    <th className="px-4 py-2 text-left font-medium">Result</th>
                    <th className="px-4 py-2 text-left font-medium">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {battleLogs.map((battle) => {
                    // Determine result via the multi-winner helper.
                    const battleWinnerIds = getWinnerIds(battle);
                    const isWinner = battleWinnerIds.includes(gangId);

                    let result: string;
                    if (battleWinnerIds.length === 0) {
                      result = 'Draw';
                    } else if (isWinner) {
                      result = 'Victory';
                    } else {
                      result = 'Defeat';
                    }

                    // Opponents, each gang once: attacker first, then defender, then by name
                    const roleOrder = (r: BattleParticipant['role']) => r === 'attacker' ? 0 : r === 'defender' ? 1 : 99;
                    const opponentGangs = battle.participants
                      .filter((p, index, all) => p.gang_id && p.gang_id !== gangId && all.findIndex((q) => q.gang_id === p.gang_id) === index)
                      .map((p) => ({ id: p.gang_id, name: p.gang_name, gang_colour: p.gang_colour, role: p.role }))
                      .sort((a, b) => {
                        const roleA = roleOrder(a.role);
                        const roleB = roleOrder(b.role);
                        if (roleA !== roleB) return roleA - roleB;
                        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                      });

                    return (
                      <tr key={battle.id} className="border-b">
                        <td className="px-4 py-2">{formatDate(battle.created_at)}</td>
                        <td className="px-4 py-2">{battle.scenario || battle.scenario_name || 'N/A'}</td>
                        <td className="px-4 py-2">{battle.territory_name || '-'}</td>
                        <td className="px-4 py-2">
                          <div className="space-y-1">
                            {opponentGangs.length > 0 ? (
                              opponentGangs.map((gang) => {
                                const roleColor = gang.role === 'attacker' ? 'bg-red-500' : gang.role === 'defender' ? 'bg-blue-500' : 'bg-muted';
                                const roleLetter = gang.role === 'attacker' ? 'A' : gang.role === 'defender' ? 'D' : null;
                                return (
                                  <div key={gang.id}>
                                    <div className="flex items-center space-x-1">
                                      {roleLetter && (
                                        <span className={`inline-flex shrink-0 items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full ${roleColor} text-white text-[10px] font-bold`} title={gang.role === 'attacker' ? 'Attacker' : 'Defender'}>
                                          {roleLetter}
                                        </span>
                                      )}
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted" style={{ color: gang.gang_colour }}>
                                        <Link
                                          href={`/gang/${gang.id}`}
                                          prefetch={false}
                                          className="hover:text-muted-foreground transition-colors"
                                        >
                                          {gang.name}
                                        </Link>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={
                            result === 'Victory' ? 'text-green-600 font-semibold' :
                            result === 'Defeat' ? 'text-red-600 font-semibold' :
                            'text-muted-foreground'
                          }>
                            {result}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {battle.note ? (
                            <button
                              onClick={() => setSelectedBattleReport(battle)}
                              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title="Click to view report"
                            >
                              <BiSolidNotepad className="h-4 w-4 inline" />
                            </button>
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        );
      })()}

      {/* Captured Fighters */}
      {campaigns.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl md:text-2xl font-bold mb-4">
            Captured Fighters
          </h3>
          {captives.length === 0 ? (
            <p className="text-muted-foreground italic text-sm">
              No fighters are currently held captive by this gang.
            </p>
          ) : (
            <div className="border rounded-lg p-3 bg-muted/30">
              <ul className="flex flex-wrap items-center gap-1.5">
                <GiHandcuffs className="h-4 w-4 shrink-0 text-red-500" />
                {captives.map((c) => (
                  <li key={c.fighterId}>
                    <Link
                      href={`/fighter/${c.fighterId}`}
                      prefetch={false}
                      className="inline-flex"
                    >
                      <Badge variant="outline" className="hover:bg-muted font-normal">
                        {c.fighterName}
                        {c.fighterType && (
                          <span className="ml-1 text-muted-foreground">— {c.fighterType}</span>
                        )}
                        <span className="ml-1 text-muted-foreground">({c.originalGangName})</span>
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Battle Report Modal */}
      {selectedBattleReport && (
        <Modal
          title="Battle Report"
          content={
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="whitespace-pre-wrap">{selectedBattleReport.note}</p>
              </div>
            </div>
          }
          onClose={() => setSelectedBattleReport(null)}
          hideCancel={true}
          width="lg"
        />
      )}

      <Tooltip
        id="ooa-caused-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '24rem'
        }}
      >
        <div>
          <div className="mb-1.5 text-sm font-semibold">OOA caused</div>
          {ooaBreakdown.length === 0 ? (
            <div>No OOA recorded</div>
          ) : (
            <>
              {ooaBreakdown.map((fighter, index) => (
                <div key={breakdownRowKey(fighter, index)} className="flex justify-between gap-3">
                  <span className="flex-1 truncate text-left">
                    {fighter.fighter_name} - {fighter.fighter_type} ({formatFighterSubtypeDisplay(fighter.fighter_subtypes, editionSlug)})
                  </span>
                  <span className="shrink-0 text-right">{fighter.kills}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-3 border-t border-neutral-700 pt-1">
                <span>Total:</span>
                <span>{ooaCaused}</span>
              </div>
            </>
          )}
        </div>
      </Tooltip>
      <Tooltip
        id="deaths-suffered-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '24rem'
        }}
      >
        <div>
          <div className="mb-1.5 text-sm font-semibold">Deaths suffered</div>
          {deathsBreakdown.length === 0 ? (
            <div>No deaths recorded</div>
          ) : (
            <>
              {deathsBreakdown.map((fighter, index) => (
                <div key={breakdownRowKey(fighter, index)} className="flex justify-between gap-3">
                  <span className="flex-1 truncate text-left">
                    {fighter.fighter_name} - {fighter.fighter_type} ({formatFighterSubtypeDisplay(fighter.fighter_subtypes, editionSlug)})
                  </span>
                  <span className="shrink-0 text-right">1</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-3 border-t border-neutral-700 pt-1">
                <span>Total:</span>
                <span>{deathsSuffered}</span>
              </div>
            </>
          )}
        </div>
      </Tooltip>
      <Tooltip
        id="gang-territory-description-tooltip"
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={100}
        clickable={true}
        render={renderDescriptionTooltip}
        style={{
          padding: '6px',
          width: '24rem',
          maxWidth: '90vw',
          maxHeight: '60vh'
        }}
      />
    </div>
  );
} 