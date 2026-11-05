'use client';

import { useState, useMemo } from 'react';
import type { GangFighter } from '@/types/gang';
import { Counter } from '@/components/ui/counter';
import Modal from '@/components/ui/modal';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import type { BattleSessionFighter } from '@/types/battle-session';

export default function BattleParticipationModal({
  crewFighters,
  gangFightersList,
  awardedXp,
  editionSlug,
  onConfirm,
  onClose,
}: {
  crewFighters: BattleSessionFighter[];
  gangFightersList: GangFighter[];
  /** XP already awarded by an earlier confirm, by fighter id. */
  awardedXp: Record<string, number>;
  editionSlug?: string | null;
  onConfirm: (xpByFighterId: Record<string, number>) => void;
  onClose: () => void;
}) {
  const crewLoadouts = useMemo(
    () => new Map(crewFighters.map((f) => [f.fighter_id, f.loadout_id])),
    [crewFighters]
  );

  const uniqueFighters = useMemo(() => {
    const seen = new Set<string>();
    const result: GangFighter[] = [];
    for (const gf of gangFightersList) {
      if (seen.has(gf.id)) continue;
      const crewLoadoutId = crewLoadouts.get(gf.id);
      if (crewLoadoutId !== undefined && gf.active_loadout_id === (crewLoadoutId ?? undefined)) {
        seen.add(gf.id);
        result.push(gf);
      }
    }
    for (const gf of gangFightersList) {
      if (seen.has(gf.id)) continue;
      seen.add(gf.id);
      result.push(gf);
    }
    return result;
  }, [gangFightersList, crewLoadouts]);

  const hasAwarded = Object.keys(awardedXp).length > 0;
  const [xpAmounts, setXpAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      uniqueFighters.map((gf) => [gf.id, hasAwarded ? (awardedXp[gf.id] ?? 0) : crewLoadouts.has(gf.id) ? 1 : 0])
    )
  );

  const adjust = (id: string, delta: number) =>
    setXpAmounts((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] ?? 0) + delta) }));

  const changed = uniqueFighters.some((gf) => (xpAmounts[gf.id] ?? 0) !== (awardedXp[gf.id] ?? 0));

  return (
    <Modal
      title="Participation XP"
      onClose={onClose}
      onConfirm={async () => {
        onConfirm(xpAmounts);
        return true;
      }}
      confirmText="Confirm"
      confirmDisabled={!changed}
    >
      <div className="space-y-3">
        {hasAwarded && (
          <p className="text-sm text-muted-foreground">
            This XP has been awarded. Changing a number adds or removes the difference.
          </p>
        )}
        {uniqueFighters.map((gf) => {
          const subtypeDisplay = formatFighterSubtypeDisplay(gf.fighter_subtypes, editionSlug);
          const details = [gf.fighter_type, subtypeDisplay ? `(${subtypeDisplay})` : ''].filter(Boolean).join(' ');
          return (
            <div key={gf.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{gf.fighter_name}</div>
                {details && <div className="text-xs text-muted-foreground">{details}</div>}
              </div>
              <Counter
                value={xpAmounts[gf.id] ?? 0}
                min={0}
                onDecrement={() => adjust(gf.id, -1)}
                onIncrement={() => adjust(gf.id, 1)}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
