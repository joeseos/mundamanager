'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Tooltip } from 'react-tooltip';
import { fighterClassRank } from '@/utils/fighterClassRank';
import { createClient } from "@/utils/supabase/client";
import { Battle } from '@/types/campaign';
import Modal from "@/components/ui/modal";
import { BiSolidNotepad } from "react-icons/bi";
import { GiAncientRuins } from "react-icons/gi";
import { HiUser } from "react-icons/hi2";
import { IoHome } from "react-icons/io5";
import { LuSwords } from "react-icons/lu";
import { MdFactory, MdLocalPolice, MdOutlineLocalPolice } from "react-icons/md";
import { GiHandcuffs } from "react-icons/gi";

interface Territory {
  id: string;
  territory_id?: string;
  territory_name: string;
  playing_card?: string | null;
  description?: string | null;
  ruined?: boolean;
  default_gang_territory?: boolean;
  created_at?: string;
}

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  territories?: Territory[];
  [key: string]: any;
}

interface BattleLog extends Battle {
  campaign_id?: string;
  campaign_name?: string;
}

// Props interface with campaigns data
interface GangTerritoriesProps {
  gangId: string;
  campaigns: Campaign[];
}

type MemberRole = 'OWNER' | 'ARBITRATOR' | 'MEMBER';

const formatRoleIcon = (role: MemberRole | string | undefined) => {
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

const getRoleTitle = (role: MemberRole | string | undefined): string => {
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function GangTerritories({ gangId, campaigns = [] }: GangTerritoriesProps) {
  const [battleLogs, setBattleLogs] = useState<BattleLog[]>([]);
  const [isLoadingBattles, setIsLoadingBattles] = useState(false);
  const [selectedBattleReport, setSelectedBattleReport] = useState<BattleLog | null>(null);

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

  // Fetch battle logs for the gang from all campaigns
  useEffect(() => {
    const fetchBattleLogs = async () => {
      if (campaigns.length === 0) {
        setBattleLogs([]);
        return;
      }

      setIsLoadingBattles(true);
      try {
        const supabase = createClient();
        const campaignIds = campaigns.map(c => c.campaign_id);
        
        // Fetch all battles from campaigns the gang is in
        const { data: battles, error } = await supabase
          .from('campaign_battles')
          .select(`
            id,
            created_at,
            updated_at,
            scenario,
            attacker_id,
            defender_id,
            winner_id,
            note,
            participants,
            campaign_territory_id,
            campaign_id
          `)
          .in('campaign_id', campaignIds)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        // Filter battles where the gang is involved
        const gangBattles = (battles || []).filter(battle => {
          // Check if gang is attacker, defender, winner, or in participants
          if (battle.attacker_id === gangId || 
              battle.defender_id === gangId || 
              battle.winner_id === gangId) {
            return true;
          }
          
          // Check participants array
          if (battle.participants) {
            try {
              const participants = typeof battle.participants === 'string' 
                ? JSON.parse(battle.participants) 
                : battle.participants;
              
              if (Array.isArray(participants)) {
                return participants.some((p: any) => p.gang_id === gangId);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
          
          return false;
        });

        // Extract all gang IDs including from participants
        const allGangIds = new Set<string>();
        gangBattles.forEach(battle => {
          if (battle.attacker_id) allGangIds.add(battle.attacker_id);
          if (battle.defender_id) allGangIds.add(battle.defender_id);
          if (battle.winner_id) allGangIds.add(battle.winner_id);
          
          // Extract from participants
          if (battle.participants) {
            try {
              const participants = typeof battle.participants === 'string' 
                ? JSON.parse(battle.participants) 
                : battle.participants;
              
              if (Array.isArray(participants)) {
                participants.forEach((p: any) => {
                  if (p.gang_id) allGangIds.add(p.gang_id);
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        });
        
        const gangIds = Array.from(allGangIds);

        let gangsData: { id: string; name: string; gang_type: string; gang_colour: string }[] = [];
        if (gangIds.length > 0) {
          const { data: gangs } = await supabase
            .from('gangs')
            .select('id, name, gang_type, gang_colour')
            .in('id', gangIds);

          gangsData = gangs || [];
        }

        const gangMap = new Map(gangsData.map(gang => [gang.id, gang]));
        const gangColourMap = new Map(gangsData.map(gang => [gang.id, gang.gang_colour || '#000000']));

        // Fetch territory names by campaign_territory_id
        const campaignTerritoryIds = gangBattles
          .map(b => b.campaign_territory_id)
          .filter(Boolean);

        const territoriesMap = new Map<string, string>(); // campaign_territory_id → name
        if (campaignTerritoryIds.length > 0) {
          const { data: territories } = await supabase
            .from('campaign_territories')
            .select('id, territory_name')
            .in('id', campaignTerritoryIds);

          territories?.forEach(t => territoriesMap.set(t.id, t.territory_name));
        }

        // Transform battles with additional data
        const enrichedBattles: BattleLog[] = gangBattles.map(battle => {
          const campaign = campaigns.find(c => c.campaign_id === battle.campaign_id);
          
          // Process participants to include names
          let participantsWithNames = battle.participants;
          if (battle.participants) {
            try {
              const participants = typeof battle.participants === 'string' 
                ? JSON.parse(battle.participants) 
                : battle.participants;
              
              if (Array.isArray(participants)) {
                participantsWithNames = participants.map((p: any) => ({
                  ...p,
                  gang_name: p.gang_id ? (gangMap.get(p.gang_id)?.name || 'Unknown') : undefined,
                  gang_colour: p.gang_id ? (gangColourMap.get(p.gang_id) || '#000000') : undefined
                }));
              }
            } catch (e) {
              // Keep original if parse fails
            }
          }
          
          return {
            ...battle,
            campaign_id: battle.campaign_id,
            campaign_name: campaign?.campaign_name || 'Unknown Campaign',
            territory_name: battle.campaign_territory_id ? territoriesMap.get(battle.campaign_territory_id) : undefined,
            participants: participantsWithNames,
            attacker: battle.attacker_id ? {
              id: battle.attacker_id,
              name: gangMap.get(battle.attacker_id)?.name || 'Unknown',
              gang_colour: gangColourMap.get(battle.attacker_id) || '#000000'
            } : undefined,
            defender: battle.defender_id ? {
              id: battle.defender_id,
              name: gangMap.get(battle.defender_id)?.name || 'Unknown',
              gang_colour: gangColourMap.get(battle.defender_id) || '#000000'
            } : undefined,
            winner: battle.winner_id ? {
              id: battle.winner_id,
              name: gangMap.get(battle.winner_id)?.name || 'Unknown',
              gang_colour: gangColourMap.get(battle.winner_id) || '#000000'
            } : undefined
          };
        });

        setBattleLogs(enrichedBattles);
      } catch (error) {
        console.error('Error fetching battle logs:', error);
        setBattleLogs([]);
      } finally {
        setIsLoadingBattles(false);
      }
    };

    fetchBattleLogs();
  }, [gangId, campaigns]);

  // Fetch fighter stats (OOA caused, deaths suffered) via API with TanStack Query
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
        ooa_breakdown?: Array<{ fighter_name: string; fighter_type: string; fighter_class: string; kills: number }>;
        deaths_breakdown?: Array<{ fighter_name: string; fighter_type: string; fighter_class: string }>;
      }>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const ooaCaused = fighterStats?.ooa_caused ?? 0;
  const deathsSuffered = fighterStats?.deaths_suffered ?? 0;

  const escapeHtml = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const ooaTooltipHtml = useMemo(() => {
    const title = '<div style="font-weight:600;margin-bottom:6px;font-size:14px;">OOA caused</div>';
    const breakdown = fighterStats?.ooa_breakdown ?? [];
    if (breakdown.length === 0) {
      return `${title}<div>No OOA recorded</div>`;
    }
    const getClassRank = (c: string) =>
      fighterClassRank[c.toLowerCase().trim()] ?? 99;
    const sorted = [...breakdown].sort(
      (a, b) => getClassRank(a.fighter_class) - getClassRank(b.fighter_class)
    );
    const rows = sorted
      .map(
        (f) =>
          `<div style="display:flex;justify-content:space-between;gap:12px;">` +
          `<span style="text-align:left;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.fighter_name)} - ${escapeHtml(f.fighter_type)} (${escapeHtml(f.fighter_class)})</span>` +
          `<span style="text-align:right;flex-shrink:0;">${f.kills}</span>` +
          `</div>`
      )
      .join('');
    const footer =
      `<div style="border-top:1px solid #333;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;gap:12px;">` +
      `<span style="text-align:left;">Total:</span>` +
      `<span style="text-align:right;">${ooaCaused}</span>` +
      `</div>`;
    return `${title}${rows}${footer}`;
  }, [fighterStats?.ooa_breakdown, ooaCaused]);

  const deathsTooltipHtml = useMemo(() => {
    const title = '<div style="font-weight:600;margin-bottom:6px;font-size:14px;">Deaths suffered</div>';
    const breakdown = fighterStats?.deaths_breakdown ?? [];
    if (breakdown.length === 0) {
      return `${title}<div>No deaths recorded</div>`;
    }
    const getClassRank = (c: string) =>
      fighterClassRank[c.toLowerCase().trim()] ?? 99;
    const sorted = [...breakdown].sort(
      (a, b) => getClassRank(a.fighter_class) - getClassRank(b.fighter_class)
    );
    const rows = sorted
      .map(
        (f) =>
          `<div style="display:flex;justify-content:space-between;gap:12px;">` +
          `<span style="text-align:left;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.fighter_name)} - ${escapeHtml(f.fighter_type)} (${escapeHtml(f.fighter_class)})</span>` +
          `<span style="text-align:right;flex-shrink:0;">1</span>` +
          `</div>`
      )
      .join('');
    const footer =
      `<div style="border-top:1px solid #333;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;gap:12px;">` +
      `<span style="text-align:left;">Total:</span>` +
      `<span style="text-align:right;">${deathsSuffered}</span>` +
      `</div>`;
    return `${title}${rows}${footer}`;
  }, [fighterStats?.deaths_breakdown, deathsSuffered]);

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
                        <Link href={`/campaigns/${campaign.campaign_id}`} className="flex items-center">
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
                          data-tooltip-html={ooaTooltipHtml}
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
                          data-tooltip-html={deathsTooltipHtml}
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
                    <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MdFactory className="h-5 w-5" />
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
                          <th className="px-4 py-2 font-medium text-left">Territory</th>
                          <th className="px-4 py-2 font-medium text-left">
                            <span className="hidden sm:inline">Description</span>
                            <span className="sm:hidden">Desc.</span>
                          </th>
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
                                    data-tooltip-html={`<div style="font-weight:600;margin-bottom:6px;font-size:14px;">${escapeHtml(territory.territory_name)}</div><div style="white-space:pre-wrap;">${escapeHtml(territory.description)}</div>`}
                                  >
                                    <BiSolidNotepad className="h-4 w-4 inline" aria-label="View territory description" />
                                  </span>
                                )}
                              </td>
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
        // Calculate overall stats across all campaigns
        const wins = battleLogs.filter(b => b.winner_id === gangId).length;
        const losses = battleLogs.filter(b => b.winner_id && b.winner_id !== gangId).length;
        const draws = battleLogs.filter(b => !b.winner_id).length;
        const totalBattles = battleLogs.length;
        
        return (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center justify-between flex-wrap">
              <div className="flex items-center gap-2">
                <LuSwords className="h-5 w-5" />
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
                    // Determine result
                    const isWinner = battle.winner_id === gangId;
                    
                    let result: string = '-';
                    if (battle.winner_id) {
                      if (isWinner) {
                        result = 'Victory';
                      } else {
                        // If there's a winner and it's not the user's gang, it's a defeat
                        result = 'Defeat';
                      }
                    } else {
                      // No winner means it's a draw
                      result = 'Draw';
                    }

                    // Get all participating gangs with roles - mirror campaign-battle-logs-list logic:
                    // When participants array exists with gang data, use ONLY participants for roles.
                    // Only fall back to attacker/defender when participants don't provide the data.
                    type GangWithRole = { id: string; name: string; gang_colour: string; role?: 'attacker' | 'defender' };
                    let participatingGangs: GangWithRole[] = [];

                    let participants: any[] = [];
                    if (battle.participants) {
                      try {
                        participants = typeof battle.participants === 'string'
                          ? JSON.parse(battle.participants)
                          : Array.isArray(battle.participants) ? battle.participants : [];
                      } catch (e) {
                        participants = [];
                      }
                    }

                    const hasParticipantGangs = participants.some((p: any) => p && p.gang_id);

                    if (hasParticipantGangs) {
                      // Use participants as source of truth - role only from participant.role
                      participatingGangs = participants
                        .filter((p: any) => p.gang_id)
                        .map((p: any) => ({
                          id: p.gang_id,
                          name: p.gang_name || 'Unknown',
                          gang_colour: p.gang_colour || '#000000',
                          role: p.role === 'attacker' || p.role === 'defender' ? p.role : undefined
                        }));
                      // Deduplicate by gang_id, keeping first occurrence
                      const seen = new Set<string>();
                      participatingGangs = participatingGangs.filter(g => {
                        if (seen.has(g.id)) return false;
                        seen.add(g.id);
                        return true;
                      });
                      // Fill in names/colours from attacker/defender when participant lacks them
                      if (battle.attacker?.id && battle.attacker?.name) {
                        const g = participatingGangs.find(x => x.id === battle.attacker!.id);
                        if (g && g.name === 'Unknown') g.name = battle.attacker.name;
                        if (g && !g.gang_colour) g.gang_colour = battle.attacker.gang_colour || '#000000';
                      }
                      if (battle.defender?.id && battle.defender?.name) {
                        const g = participatingGangs.find(x => x.id === battle.defender!.id);
                        if (g && g.name === 'Unknown') g.name = battle.defender.name;
                        if (g && !g.gang_colour) g.gang_colour = battle.defender.gang_colour || '#000000';
                      }
                    } else {
                      // Fallback: no participants with gang data - use attacker/defender structure
                      if (battle.attacker && battle.attacker.id) {
                        participatingGangs.push({
                          id: battle.attacker.id,
                          name: battle.attacker.name,
                          gang_colour: battle.attacker.gang_colour || '#000000',
                          role: 'attacker'
                        });
                      }
                      if (battle.defender && battle.defender.id) {
                        participatingGangs.push({
                          id: battle.defender.id,
                          name: battle.defender.name,
                          gang_colour: battle.defender.gang_colour || '#000000',
                          role: 'defender'
                        });
                      }
                    }

                    // Filter out the user's own gang and sort: attacker first, then defender
                    const roleOrder = (r: 'attacker' | 'defender' | undefined) => r === 'attacker' ? 0 : r === 'defender' ? 1 : 99;
                    const opponentGangs = participatingGangs
                      .filter(gang => gang.id !== gangId)
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
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <GiHandcuffs className="h-5 w-5 text-red-500" />
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
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '24rem'
        }}
      />
      <Tooltip
        id="deaths-suffered-tooltip"
        place="top"
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
        style={{
          padding: '6px',
          maxWidth: '24rem'
        }}
      />
      <Tooltip
        id="gang-territory-description-tooltip"
        place="top"
        className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
        delayHide={100}
        clickable={true}
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