'use client';

import React from 'react';
import Link from 'next/link';
import { Tooltip } from 'react-tooltip';
import { getPlayingCardSortKey } from '@/utils/campaigns/territory-playing-card-options';
import { escapeHtml } from '@/utils/campaigns/map-markers';

interface Gang {
  id: string;
  name: string;
  gang_type: string;
  gang_colour: string;
}

interface Territory {
  id: string;
  territory_name: string;
  playing_card?: string | null;
  description?: string | null;
  gang_id: string | null;
  map_object_id?: string | null;
  map_hex_coords?: { x: number; y: number; z: number } | null;
  owning_gangs?: Gang[];
}


function buildTerritoryTooltipHtml(t: Territory): string {
  const card = t.playing_card?.trim() ? `${t.playing_card.trim()} ` : '';
  const heading = `<div class="text-sm font-semibold">${escapeHtml(card + t.territory_name)}</div>`;

  const desc = t.description?.trim()
    ? `<div class="text-[0.7rem] mt-1 opacity-80" style="white-space: pre-wrap;">${escapeHtml(t.description.trim())}</div>`
    : '';

  const ref = t.map_hex_coords
    ? `Coords: ${t.map_hex_coords.x}, ${t.map_hex_coords.y}, ${t.map_hex_coords.z}`
    : t.map_object_id
      ? `ID: ${t.map_object_id.slice(0, 8)}`
      : `ID: ${t.id.slice(0, 8)}`;
  const refLine = `<div class="text-xs mt-1 opacity-60">${escapeHtml(ref)}</div>`;

  return heading + desc + refLine;
}

interface CampaignMapGangSummaryProps {
  territories: Territory[];
  allGangs: Gang[];
}

function compareTerritories(a: Territory, b: Territory): number {
  const cardCompare = getPlayingCardSortKey(a.playing_card).localeCompare(
    getPlayingCardSortKey(b.playing_card)
  );
  if (cardCompare !== 0) return cardCompare;
  return a.territory_name.localeCompare(b.territory_name);
}

function sortTerritories(territories: Territory[]): Territory[] {
  return [...territories].sort(compareTerritories);
}

export default function CampaignMapGangSummary({ territories, allGangs }: CampaignMapGangSummaryProps) {
  const gangTerritories = React.useMemo(() => {
    const map = new Map<string, Territory[]>();

    allGangs.forEach(g => map.set(g.id, []));

    territories.forEach(t => {
      if (t.gang_id && map.has(t.gang_id)) {
        map.get(t.gang_id)!.push(t);
      }
    });

    map.forEach((list, gangId) => {
      map.set(gangId, sortTerritories(list));
    });

    return map;
  }, [territories, allGangs]);

  const unallocated = React.useMemo(
    () => sortTerritories(territories.filter(t => !t.gang_id)),
    [territories]
  );

  return (
    <>
    <div className="bg-card shadow-md rounded-lg p-4">
      <h3 className="text-lg font-bold mb-3">Gang Territories</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {allGangs.map(gang => {
          const owned = gangTerritories.get(gang.id) ?? [];
          return (
            <div key={gang.id} className="border rounded-lg p-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted" style={{ color: gang.gang_colour }}>
                <Link
                  href={`/gang/${gang.id}`}
                  className="hover:text-muted-foreground transition-colors"
                >
                  {gang.name}
                </Link>
              </span>
              <div className="p-1 space-y-2">
                <p className="text-xs text-muted-foreground">{gang.gang_type}</p>
                {owned.length > 0 ? (
                  <ul className="text-xs space-y-0.5 mt-1">
                    {owned.map(t => (
                      <li
                        key={t.id}
                        className="cursor-default"
                        data-tooltip-id="gang-summary-territory-tooltip"
                        data-tooltip-html={buildTerritoryTooltipHtml(t)}
                      >
                        {t.playing_card ? `${t.playing_card} ` : ''}{t.territory_name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic mt-1">No Territories</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Unallocated tile */}
        <div className="border rounded-lg p-3 space-y-1 border-dashed">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Unallocated Territories</span>
          </div>
          {unallocated.length > 0 ? (
            <ul className="text-xs space-y-0.5 mt-1">
              {unallocated.map(t => (
                <li
                  key={t.id}
                  className="cursor-default"
                  data-tooltip-id="gang-summary-territory-tooltip"
                  data-tooltip-html={buildTerritoryTooltipHtml(t)}
                >
                  {t.playing_card ? `${t.playing_card} ` : ''}{t.territory_name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground italic mt-1">All territories are assigned</p>
          )}
        </div>
      </div>
    </div>
    <Tooltip
      id="gang-summary-territory-tooltip"
      place="top"
      offset={16}
      className="!bg-neutral-900 !text-white !text-xs !z-[2000]"
      delayHide={100}
      style={{ padding: '8px', maxWidth: '22rem' }}
    />
    </>
  );
}
