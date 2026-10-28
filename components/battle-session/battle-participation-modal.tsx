'use client';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { GangFighter } from '@/types/gang';
import { Counter } from '@/components/ui/counter';
import Modal from '@/components/ui/modal';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import type { BattleSessionFighter } from '@/types/battle-session';

export default function BattleParticipationModal({
  crewFighters,
  gangFightersList,
  editionSlug,
  onConfirm,
  onClose,
}: {
  crewFighters: BattleSessionFighter[];
  gangFightersList: GangFighter[];
  editionSlug?: string | null;
  /**
   * The amounts that changed: by session fighter id for the crew, and by
   * fighter id for fighters outside the crew raised above 0, who join the session.
   */
  onConfirm: (changes: { crew: Record<string, number>; added: Record<string, number> }) => void;
  onClose: () => void;
}) {
  // gangFightersList has one entry per loadout; fighters outside the crew are listed once.
  const otherFighters = useMemo(() => {
    const seen = new Set(crewFighters.map((f) => f.fighter_id));
    return gangFightersList.filter((gf) => {
      if (seen.has(gf.id)) return false;
      seen.add(gf.id);
      return true;
    });
  }, [crewFighters, gangFightersList]);

  const [crewXp, setCrewXp] = useState<Record<string, number>>(() =>
    Object.fromEntries(crewFighters.map((f) => [f.id, f.session_record?.participation_xp ?? 0]))
  );
  const [otherXp, setOtherXp] = useState<Record<string, number>>({});

  const adjust = (
    setXp: Dispatch<SetStateAction<Record<string, number>>>,
    id: string,
    delta: number
  ) => setXp((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] ?? 0) + delta) }));

  const renderRow = (key: string, gf: GangFighter | undefined, fallbackName: string | null | undefined, value: number, onAdjust: (delta: number) => void) => {
    const subtypeDisplay = gf ? formatFighterSubtypeDisplay(gf.fighter_subtypes, editionSlug) : '';
    const details = [gf?.fighter_type, subtypeDisplay ? `(${subtypeDisplay})` : ''].filter(Boolean).join(' ');
    return (
      <div key={key} className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{gf?.fighter_name ?? fallbackName ?? 'Unknown Fighter'}</div>
          {details && <div className="text-xs text-muted-foreground">{details}</div>}
        </div>
        <Counter
          value={value}
          min={0}
          onDecrement={() => onAdjust(-1)}
          onIncrement={() => onAdjust(1)}
        />
      </div>
    );
  };

  return (
    <Modal
      title="Participation XP"
      onClose={onClose}
      onConfirm={async () => {
        const crew = Object.fromEntries(
          crewFighters
            .filter((f) => crewXp[f.id] !== (f.session_record?.participation_xp ?? 0))
            .map((f) => [f.id, crewXp[f.id] ?? 0])
        );
        const added = Object.fromEntries(Object.entries(otherXp).filter(([, xp]) => xp > 0));
        onConfirm({ crew, added });
        return true;
      }}
      confirmText="Confirm"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Each fighter gains this XP when the battle is completed. Lower it to 0 for a fighter who did not take part.
        </p>
        {crewFighters.map((f) => {
          const gf = gangFightersList.find(
            (g) => g.id === f.fighter_id && g.active_loadout_id === (f.loadout_id ?? undefined)
          ) ?? gangFightersList.find((g) => g.id === f.fighter_id);
          return renderRow(f.id, gf, f.fighter?.fighter_name, crewXp[f.id] ?? 0, (delta) => adjust(setCrewXp, f.id, delta));
        })}
        {otherFighters.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <h4 className="text-sm font-medium text-neutral-500">Not in the crew</h4>
              <p className="text-xs text-muted-foreground">
                Raise a fighter who joined the battle, e.g. as reinforcements, to add them.
              </p>
            </div>
            {otherFighters.map((gf) =>
              renderRow(gf.id, gf, undefined, otherXp[gf.id] ?? 0, (delta) => adjust(setOtherXp, gf.id, delta))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
