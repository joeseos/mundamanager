'use client';

import React from 'react';
import Link from 'next/link';

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
  gang_id: string | null;
  owning_gangs?: Gang[];
}

interface CampaignMapGangSummaryProps {
  territories: Territory[];
  allGangs: Gang[];
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

    return map;
  }, [territories, allGangs]);

  const unallocated = React.useMemo(
    () => territories.filter(t => !t.gang_id),
    [territories]
  );

  return (
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
                      <li key={t.id}>
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
                <li key={t.id}>
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
  );
}
