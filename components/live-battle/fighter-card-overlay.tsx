'use client';

import { createPortal } from 'react-dom';
import type { GangFighter } from '@/types/gang';
import FighterCard from '@/components/gang/fighter-card';

interface FighterCardOverlayProps {
  fighter: GangFighter;
  onClose: () => void;
}

export default function FighterCardOverlay({ fighter, onClose }: FighterCardOverlayProps) {
  return createPortal(
    <div
      className="fixed inset-0 flex justify-center items-center z-[110] px-[10px] bg-black/50 dark:bg-neutral-700/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-w-2xl w-full">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 bg-neutral-700 hover:bg-neutral-500 text-white rounded-full size-8 flex items-center justify-center text-lg transition-colors shadow-md"
        >
          ×
        </button>
        <div className="max-h-svh overflow-y-auto">
          <FighterCard
            {...fighter}
            owner_status={null}
            name={fighter.fighter_name}
            type={fighter.fighter_type}
            skills={fighter.skills}
            effects={fighter.effects as any}
            vehicle={fighter.vehicles?.[0]}
            // Prevent hover scale from creating modal scrollbars; gang-page cards do not pass this prop.
            disableHoverEffects
            advancements={{ characteristics: {}, skills: {} }}
            base_stats={{
              movement: fighter.movement,
              weapon_skill: fighter.weapon_skill,
              ballistic_skill: fighter.ballistic_skill,
              strength: fighter.strength,
              toughness: fighter.toughness,
              wounds: fighter.wounds,
              initiative: fighter.initiative,
              attacks: fighter.attacks,
              leadership: fighter.leadership,
              cool: fighter.cool,
              willpower: fighter.willpower,
              intelligence: fighter.intelligence,
            }}
            current_stats={{
              movement: fighter.movement,
              weapon_skill: fighter.weapon_skill,
              ballistic_skill: fighter.ballistic_skill,
              strength: fighter.strength,
              toughness: fighter.toughness,
              wounds: fighter.wounds,
              initiative: fighter.initiative,
              attacks: fighter.attacks,
              leadership: fighter.leadership,
              cool: fighter.cool,
              willpower: fighter.willpower,
              intelligence: fighter.intelligence,
            }}
            disableLink
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
