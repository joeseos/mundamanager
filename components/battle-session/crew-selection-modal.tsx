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
  fighter_class?: string;
  owner_id?: string;
  owner_name?: string;
}

function isBeast(f: GangFighterOption) {
  const cls = f.fighter_class?.toLowerCase();
  return cls === 'exotic beast' || cls === 'exotic beast specialist';
}

interface SortedEntry {
  fighter: GangFighterOption;
  parentOwnerId?: string;
  parentLoadoutId?: string;
}

function sortWithBeasts(fighters: GangFighterOption[]): SortedEntry[] {
  const nonBeasts: GangFighterOption[] = [];
  const beastsByOwner = new Map<string, GangFighterOption[]>();

  for (const f of fighters) {
    if (isBeast(f) && f.owner_id) {
      const list = beastsByOwner.get(f.owner_id) || [];
      list.push(f);
      beastsByOwner.set(f.owner_id, list);
    } else {
      nonBeasts.push(f);
    }
  }

  const result: SortedEntry[] = [];
  for (const fighter of nonBeasts) {
    result.push({ fighter });
    const beasts = beastsByOwner.get(fighter.id);
    if (beasts) {
      for (const beast of beasts) {
        result.push({ fighter: beast, parentOwnerId: fighter.id, parentLoadoutId: fighter.loadout_id });
      }
    }
  }

  const placedOwnerIds = new Set(nonBeasts.map((f) => f.id));
  Array.from(beastsByOwner.entries()).forEach(([ownerId, beasts]) => {
    if (!placedOwnerIds.has(ownerId)) {
      for (const beast of beasts) {
        result.push({ fighter: beast });
      }
    }
  });

  return result;
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

  const isAvailable = (f: GangFighterOption) =>
    countsTowardRating(f) && !f.recovery;

  const sortedFighters = sortWithBeasts(gangFighters);

  const getBeastsForOwner = (ownerId: string) =>
    gangFighters.filter((f) => isBeast(f) && f.owner_id === ownerId);

  const toggle = (fighter: GangFighterOption) => {
    if (isBeast(fighter)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      const currentLoadout = next.get(fighter.id);
      const wasSelected = next.has(fighter.id) && currentLoadout === fighter.loadout_id;

      if (wasSelected) {
        next.delete(fighter.id);
        for (const beast of getBeastsForOwner(fighter.id)) {
          next.delete(beast.id);
        }
      } else {
        next.set(fighter.id, fighter.loadout_id);
        for (const beast of getBeastsForOwner(fighter.id)) {
          if (isAvailable(beast)) {
            next.set(beast.id, beast.loadout_id);
          }
        }
      }
      return next;
    });
  };

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
          {sortedFighters.map((entry, idx) => {
            const f = entry.fighter;
            const beast = isBeast(f);
            const isSelected = beast
              ? selected.has(f.id) && entry.parentOwnerId != null && selected.get(entry.parentOwnerId) === entry.parentLoadoutId
              : selected.has(f.id) && selected.get(f.id) === f.loadout_id;
            return (
              <label
                key={`${idx}:${f.id}:${f.loadout_id ?? ''}`}
                className={`flex items-center p-2 bg-muted rounded-md ${beast ? 'ml-6 cursor-default opacity-70' : 'cursor-pointer'}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(f)}
                  className="mr-3"
                  disabled={beast}
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
