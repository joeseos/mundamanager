"use client"

import React, { useMemo } from 'react';
import type { Battle, BattleParticipant } from '@/types/campaign';

interface CampaignTriumph {
  id: string;
  triumph: string;
  criteria: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
}

interface TriumphMember {
  user_id: string;
  gangs: {
    id: string;
    name: string;
    gang_colour: string;
    rating?: number;
    wealth?: number;
    reputation?: number;
    allegiance?: {
      id: string;
      name: string;
      is_custom: boolean;
    } | null;
  }[];
}

interface TriumphTerritory {
  id: string;
  territory_name: string;
  gang_id: string | null;
}

interface CampaignTriumphsProps {
  triumphs: CampaignTriumph[];
  battles?: Battle[];
  members?: TriumphMember[];
  territories?: TriumphTerritory[];
}

interface GangInfo {
  id: string;
  name: string;
  colour: string;
  allegianceName: string;
  rating: number;
  wealth: number;
  reputation: number;
}

interface RankedEntry {
  gangId: string;
  gangName: string;
  gangColour: string;
  value: number;
  rank: number;
}

function parseBattleParticipants(battle: Battle): BattleParticipant[] {
  let participants = battle.participants;
  if (participants && typeof participants === 'string') {
    try { participants = JSON.parse(participants); } catch { participants = []; }
  }
  if (participants && Array.isArray(participants)) return participants;
  const fallback: BattleParticipant[] = [];
  if (battle.attacker_id) fallback.push({ gang_id: battle.attacker_id, role: 'attacker' });
  if (battle.defender_id) fallback.push({ gang_id: battle.defender_id, role: 'defender' });
  return fallback;
}

function applyCompetitionRanking(
  sorted: Array<{ gangId: string; gangName: string; gangColour: string; value: number }>,
): RankedEntry[] {
  const ranked: RankedEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank = i === 0 || sorted[i].value !== sorted[i - 1].value ? i + 1 : ranked[i - 1].rank;
    if (rank > 3) break;
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

export default function CampaignTriumphs({ triumphs, battles = [], members = [], territories = [] }: CampaignTriumphsProps) {
  const gangMap = useMemo(() => {
    const map = new Map<string, GangInfo>();
    members.forEach(member => {
      member.gangs?.forEach(gang => {
        if (!map.has(gang.id)) {
          map.set(gang.id, {
            id: gang.id,
            name: gang.name,
            colour: gang.gang_colour || '#000000',
            allegianceName: gang.allegiance?.name || '',
            rating: gang.rating || 0,
            wealth: gang.wealth || 0,
            reputation: gang.reputation || 0,
          });
        }
      });
    });
    return map;
  }, [members]);

  const victoriesByAllegiance = useMemo(() => {
    const counts = new Map<string, number>();
    battles.forEach(battle => {
      if (battle.winner_id == null) return;
      const gang = gangMap.get(battle.winner_id);
      const allegiance = gang?.allegianceName || '';
      if (!allegiance) return;
      counts.set(allegiance, (counts.get(allegiance) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, victories]) => ({ name, victories }))
      .sort((a, b) => b.victories - a.victories);
  }, [battles, gangMap]);

  const topByTerritories = useMemo(() => {
    const counts = new Map<string, number>();
    territories.forEach(t => {
      if (!t.gang_id) return;
      counts.set(t.gang_id, (counts.get(t.gang_id) || 0) + 1);
    });
    const sorted = Array.from(counts.entries())
      .map(([gangId, value]) => {
        const info = gangMap.get(gangId);
        return { gangId, gangName: info?.name || 'Unknown', gangColour: info?.colour || '#000000', value };
      })
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [territories, gangMap]);

  const topByBattlesFought = useMemo(() => {
    const counts = new Map<string, number>();
    battles.forEach(battle => {
      const participants = parseBattleParticipants(battle);
      participants.forEach(p => {
        if (!p.gang_id) return;
        counts.set(p.gang_id, (counts.get(p.gang_id) || 0) + 1);
      });
    });
    const sorted = Array.from(counts.entries())
      .map(([gangId, value]) => {
        const info = gangMap.get(gangId);
        return { gangId, gangName: info?.name || 'Unknown', gangColour: info?.colour || '#000000', value };
      })
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [battles, gangMap]);

  const topByVictories = useMemo(() => {
    const counts = new Map<string, number>();
    battles.forEach(battle => {
      if (battle.winner_id == null) return;
      counts.set(battle.winner_id, (counts.get(battle.winner_id) || 0) + 1);
    });
    const sorted = Array.from(counts.entries())
      .map(([gangId, value]) => {
        const info = gangMap.get(gangId);
        return { gangId, gangName: info?.name || 'Unknown', gangColour: info?.colour || '#000000', value };
      })
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [battles, gangMap]);

  const topByWealth = useMemo(() => {
    const sorted = Array.from(gangMap.values())
      .filter(g => g.wealth > 0)
      .map(g => ({ gangId: g.id, gangName: g.name, gangColour: g.colour, value: g.wealth }))
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [gangMap]);

  const topByReputation = useMemo(() => {
    const sorted = Array.from(gangMap.values())
      .filter(g => g.reputation > 0)
      .map(g => ({ gangId: g.id, gangName: g.name, gangColour: g.colour, value: g.reputation }))
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [gangMap]);

  const topByRating = useMemo(() => {
    const sorted = Array.from(gangMap.values())
      .filter(g => g.rating > 0)
      .map(g => ({ gangId: g.id, gangName: g.name, gangColour: g.colour, value: g.rating }))
      .sort((a, b) => b.value - a.value);
    return applyCompetitionRanking(sorted);
  }, [gangMap]);

  const hasBattleData = battles.length > 0;
  const hasTerritoryData = territories.length > 0;
  const hasGangData = gangMap.size > 0;

  return (
    <div className="space-y-8">
      {/* Triumphs definitions table */}
      {triumphs && triumphs.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="w-2/5 px-4 py-2 text-left font-medium whitespace-nowrap">Triumph</th>
                <th className="w-3/5 px-4 py-2 text-left font-medium whitespace-nowrap">Criteria</th>
              </tr>
            </thead>
            <tbody>
              {triumphs.map((triumph) => (
                <tr key={triumph.id} className="border-b last:border-0">
                  <td className="w-2/5 px-4 py-2">
                    <span className="font-medium">{triumph.triumph}</span>
                  </td>
                  <td className="w-3/5 px-4 py-2">
                    {triumph.criteria}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-muted-foreground italic text-center p-4">
          No triumphs available for this campaign type.
        </div>
      )}

      {/* Victories by Allegiance */}
      {hasBattleData && victoriesByAllegiance.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Victories by Allegiance</h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-4 py-2 text-left font-medium">Allegiance</th>
                  <th className="px-4 py-2 text-right font-medium">Victories</th>
                </tr>
              </thead>
              <tbody>
                {victoriesByAllegiance.map((row) => (
                  <tr key={row.name} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-right text-green-600 dark:text-green-400 font-medium">{row.victories}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      
      {/* Top Gangs by Territories Controlled */}
      {hasTerritoryData && topByTerritories.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Territories Controlled</h3>
          <RankedTable entries={topByTerritories} valueLabel="Territories" />
        </div>
      )}

      {/* Top Gangs by Battles Fought */}
      {hasBattleData && topByBattlesFought.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Battles Fought</h3>
          <RankedTable entries={topByBattlesFought} valueLabel="Battles" />
        </div>
      )}

      {/* Top Gangs by Victories */}
      {hasBattleData && topByVictories.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Victories</h3>
          <RankedTable entries={topByVictories} valueLabel="Victories" />
        </div>
      )}

      {/* Top Gangs by Rating */}
      {hasGangData && topByRating.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Rating</h3>
          <RankedTable entries={topByRating} valueLabel="Rating" />
        </div>
      )}

      {/* Top Gangs by Wealth */}
      {hasGangData && topByWealth.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Wealth</h3>
          <RankedTable entries={topByWealth} valueLabel="Wealth" />
        </div>
      )}

      {/* Top Gangs by Reputation */}
      {hasGangData && topByReputation.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Top Gangs by Reputation</h3>
          <RankedTable entries={topByReputation} valueLabel="Reputation" />
        </div>
      )}
    </div>
  );
}

function RankedTable({ entries, valueLabel }: { entries: RankedEntry[]; valueLabel: string }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b">
            <th className="w-16 px-4 py-2 text-left font-medium">Rank</th>
            <th className="px-4 py-2 text-left font-medium">Gang</th>
            <th className="px-4 py-2 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.gangId} className="border-b last:border-0">
              <td className="w-16 px-4 py-2 font-medium">{formatRank(entry.rank)}</td>
              <td className="px-4 py-2">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted"
                  style={{ color: entry.gangColour }}
                >
                  {entry.gangName}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-medium">{entry.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRank(rank: number): string {
  switch (rank) {
    case 1: return '1st';
    case 2: return '2nd';
    case 3: return '3rd';
    default: return `${rank}th`;
  }
}
