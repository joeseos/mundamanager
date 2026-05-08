'use client';

import { useState } from 'react';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { TbMeatOff } from 'react-icons/tb';
import { FaMedkit } from 'react-icons/fa';
import { countsTowardRating } from '@/utils/fighter-status';

interface GangFighterOption {
  id: string;
  fighter_name: string;
  credits: number;
  loadout_id?: string;
  loadout_name?: string;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  captured?: boolean;
}

export interface FighterEntry {
  fighter_id: string;
  loadout_id?: string;
}

interface CrewSelectionModalProps {
  gangFighters: GangFighterOption[];
  selectedFighters: Map<string, string | undefined>;
  loading: boolean;
  onConfirm: (toAdd: FighterEntry[], toRemove: string[], toUpdate: FighterEntry[]) => void;
  onClose: () => void;
}

export default function CrewSelectionModal({
  gangFighters,
  selectedFighters,
  loading,
  onConfirm,
  onClose,
}: CrewSelectionModalProps) {
  const [selected, setSelected] = useState<Map<string, string | undefined>>(
    () => {
      const initial = new Map(selectedFighters);
      // Resolve undefined loadouts to the fighter's first available loadout
      initial.forEach((loadoutId, fighterId) => {
        if (loadoutId === undefined) {
          const match = gangFighters.find((f) => f.id === fighterId && f.loadout_id);
          if (match?.loadout_id) {
            initial.set(fighterId, match.loadout_id);
          }
        }
      });
      return initial;
    }
  );

  const toggle = (fighterId: string, loadoutId?: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const currentLoadout = next.get(fighterId);
      if (next.has(fighterId) && currentLoadout === loadoutId) {
        next.delete(fighterId);
      } else {
        next.set(fighterId, loadoutId);
      }
      return next;
    });
  };

  const isAvailable = (f: GangFighterOption) =>
    countsTowardRating(f) && !f.recovery;
  const activeFighters = gangFighters.filter(isAvailable);
  const uniqueActiveFighterIds = new Set(activeFighters.map((f) => f.id));
  const allSelected = uniqueActiveFighterIds.size > 0 && Array.from(uniqueActiveFighterIds).every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Map());
    } else {
      const next = new Map<string, string | undefined>();
      for (const f of activeFighters) {
        if (!next.has(f.id)) {
          next.set(f.id, f.loadout_id);
        }
      }
      setSelected(next);
    }
  };

  const handleConfirm = async () => {
    const toAdd: FighterEntry[] = [];
    const toRemove: string[] = [];
    const toUpdate: FighterEntry[] = [];

    Array.from(selected.entries()).forEach(([fighterId, loadoutId]) => {
      if (!selectedFighters.has(fighterId)) {
        toAdd.push({ fighter_id: fighterId, loadout_id: loadoutId });
      } else if (selectedFighters.get(fighterId) !== loadoutId) {
        toUpdate.push({ fighter_id: fighterId, loadout_id: loadoutId });
      }
    });

    Array.from(selectedFighters.keys()).forEach((id) => {
      if (!selected.has(id)) {
        toRemove.push(id);
      }
    });

    onConfirm(toAdd, toRemove, toUpdate);
  };

  const totalValue = gangFighters
    .filter((f) => selected.has(f.id) && selected.get(f.id) === f.loadout_id)
    .reduce((sum, f) => sum + f.credits, 0);

  return (
    <Modal
      title="Select Crew"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmText="Confirm"
      width="lg"
      headerContent={
        !loading && gangFighters.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Crew Rating</span>
            <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
              {totalValue}
            </span>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : gangFighters.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No fighters in this gang.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center text-sm font-medium text-muted-foreground px-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              className="mr-3"
            />
            <div className="flex-grow">Name</div>
            <div className="text-right">Value</div>
          </div>
          {gangFighters.map((f) => {
            const isSelected = selected.has(f.id) && selected.get(f.id) === f.loadout_id;
            return (
              <label
                key={f.loadout_id ? `${f.id}:${f.loadout_id}` : f.id}
                className="flex items-center p-2 bg-muted rounded-md cursor-pointer hover:bg-muted"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(f.id, f.loadout_id)}
                  className="mr-3"
                />
                <span className="flex-grow overflow-hidden text-ellipsis flex items-center gap-1">
                  {f.fighter_name}
                  {f.loadout_name && (
                    <span className="text-muted-foreground"> ({f.loadout_name})</span>
                  )}
                  {f.killed && <IoSkull className="text-gray-300" />}
                  {f.retired && <MdChair className="text-muted-foreground" />}
                  {f.enslaved && <GiCrossedChains className="text-sky-200" />}
                  {f.starved && <TbMeatOff className="text-red-500" />}
                  {f.recovery && <FaMedkit className="text-blue-500" />}
                  {f.captured && <GiHandcuffs className="text-red-600" />}
                </span>
                <span className="text-right text-muted-foreground whitespace-nowrap">{f.credits}</span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
