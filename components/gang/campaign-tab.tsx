'use client';

import { useMemo, useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Battle } from '@/types/campaign';
import Modal from "@/components/ui/modal";
import { BiSolidNotepad } from "react-icons/bi";
import { GiAncientRuins } from "react-icons/gi";
import { HiUser } from "react-icons/hi2";
import { IoHome } from "react-icons/io5";
import { LuSwords } from "react-icons/lu";
import { MdFactory, MdLocalPolice, MdOutlineLocalPolice } from "react-icons/md";

interface Territory {
  id: string;
  territory_id?: string;
  territory_name: string;
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
            territory_id,
            custom_territory_id,
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

        let gangsData: { id: string; name: string; gang_colour: string }[] = [];
        if (gangIds.length > 0) {
          const { data: gangs } = await supabase
            .from('gangs')
            .select('id, name, gang_colour')
            .in('id', gangIds);
          
          gangsData = gangs || [];
        }

        const gangMap = new Map(gangsData.map(gang => [gang.id, gang]));
        const gangColourMap = new Map(gangsData.map(gang => [gang.id, gang.gang_colour || '#000000']));

        // Fetch territory names
        const territoryIds = gangBattles
          .map(b => b.territory_id || b.custom_territory_id)
          .filter(Boolean);
        
        let territoriesMap = new Map<string, string>();
        if (territoryIds.length > 0) {
          for (const campaignId of campaignIds) {
            const { data: territories } = await supabase
              .from('campaign_territories')
              .select('territory_id, custom_territory_id, territory_name')
              .eq('campaign_id', campaignId)
              .or(`territory_id.in.(${territoryIds.join(',')}),custom_territory_id.in.(${territoryIds.join(',')})`);
            
            if (territories) {
              territories.forEach(t => {
                const key = t.territory_id || t.custom_territory_id;
                if (key) {
                  territoriesMap.set(key, t.territory_name);
                }
              });
            }
          }
        }

        // Transform battles with additional data
        const enrichedBattles: BattleLog[] = gangBattles.map(battle => {
          const campaign = campaigns.find(c => c.campaign_id === battle.campaign_id);
          const territoryKey = battle.territory_id || battle.custom_territory_id;
          
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
            territory_name: territoryKey ? territoriesMap.get(territoryKey) : undefined,
            participants: participantsWithNames,
            attacker: battle.attacker_id ? {
              id: battle.attacker_id,
              name: gangMap.get(battle.attacker_id)?.name || 'Unknown',
              colour: gangColourMap.get(battle.attacker_id) || '#000000'
            } : undefined,
            defender: battle.defender_id ? {
              id: battle.defender_id,
              name: gangMap.get(battle.defender_id)?.name || 'Unknown',
              colour: gangColourMap.get(battle.defender_id) || '#000000'
            } : undefined,
            winner: battle.winner_id ? {
              id: battle.winner_id,
              name: gangMap.get(battle.winner_id)?.name || 'Unknown',
              colour: gangColourMap.get(battle.winner_id) || '#000000'
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

  return (
    <div>
      <div className="divide-y">
        {campaigns.length > 0 ? (
          [...campaigns]
            .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name))
            .map((campaign) => (
              <div key={campaign.campaign_id} className="mb-6">
                {/* Campaign Header */}
                <div className="text-muted-foreground mb-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-1 text-sm">
                      Campaign: <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        <Link href={`/campaigns/${campaign.campaign_id}`} className="flex items-center">
                          {campaign.campaign_name}
                        </Link>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        Player's Role: 
                        <Badge variant="secondary" className="gap-1">
                          {formatRoleIcon(campaign.role)}
                          {getRoleTitle(campaign.role)}
                        </Badge>
                      </span>
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
                          <th className="px-4 py-2 font-medium text-left">Territory</th>
                          <th className="px-4 py-2 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...campaign.territories]
                          .sort((a, b) => a.territory_name.localeCompare(b.territory_name))
                          .map((territory) => (
                            <tr key={territory.id} className="border-b last:border-0">
                              <td className="px-4 py-2 text-left">{territory.territory_name}</td>
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
                  <div className="text-muted-foreground italic text-center py-4">No territories controlled.</div>
                )}
              </div>
            ))
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

                    // Get all participating gangs (deduplicated by gang_id)
                    const participatingGangsMap = new Map<string, { id: string; name: string; colour: string }>();

                    // Add from attacker/defender structure
                    if (battle.attacker && battle.attacker.id) {
                      participatingGangsMap.set(battle.attacker.id, {
                        id: battle.attacker.id,
                        name: battle.attacker.name,
                        colour: battle.attacker.colour || '#000000'
                      });
                    }
                    if (battle.defender && battle.defender.id) {
                      participatingGangsMap.set(battle.defender.id, {
                        id: battle.defender.id,
                        name: battle.defender.name,
                        colour: battle.defender.colour || '#000000'
                      });
                    }

                    // Add from participants array
                    if (battle.participants) {
                      try {
                        const participants = typeof battle.participants === 'string'
                          ? JSON.parse(battle.participants)
                          : battle.participants;

                        if (Array.isArray(participants)) {
                          participants.forEach((p: any) => {
                            if (p.gang_id && p.gang_name && !participatingGangsMap.has(p.gang_id)) {
                              participatingGangsMap.set(p.gang_id, {
                                id: p.gang_id,
                                name: p.gang_name,
                                colour: p.gang_colour || '#000000'
                              });
                            }
                          });
                        }
                      } catch (e) {
                        // Ignore parse errors
                      }
                    }

                    const participatingGangs = Array.from(participatingGangsMap.values());

                    // Filter out the user's own gang
                    const opponentGangs = participatingGangs.filter(gang => gang.id !== gangId);

                    return (
                      <tr key={battle.id} className="border-b">
                        <td className="px-4 py-2">{formatDate(battle.created_at)}</td>
                        <td className="px-4 py-2">{battle.scenario || battle.scenario_name || 'N/A'}</td>
                        <td className="px-4 py-2">{battle.territory_name || '-'}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {opponentGangs.length > 0 ? (
                              opponentGangs.map((gang) => (
                                <Badge
                                  key={gang.id}
                                  variant="outline"
                                  className="cursor-pointer hover:bg-secondary"
                                  style={{ color: gang.colour }}
                                >
                                  <Link
                                    href={`/gang/${gang.id}`}
                                    className="flex items-center"
                                  >
                                    {gang.name}
                                  </Link>
                                </Badge>
                              ))
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
    </div>
  );
} 