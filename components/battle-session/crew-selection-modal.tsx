'use client';

import { useState, useMemo } from 'react';
import Modal from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { TbMeatOff } from 'react-icons/tb';
import { FaMedkit } from 'react-icons/fa';
import { LuMinus, LuPlus } from 'react-icons/lu';
import { countsTowardRating } from '@/utils/fighter-status';
import { rollInRange } from '@/utils/dice';
import { createGangLog } from '@/app/actions/logs/gang-logs';

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
  gangId: string;
  gangFighters: GangFighterOption[];
  selectedFighters: Map<string, string | undefined>;
  loading: boolean;
  onConfirm: (toAdd: FighterEntry[], toRemove: string[], toUpdate: FighterEntry[]) => Promise<boolean> | void;
  onClose: () => void;
}

export default function CrewSelectionModal({
  gangId,
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

  const [pickCount, setPickCount] = useState(0);
  const [randomCount, setRandomCount] = useState(0);
  const [randomlySelected, setRandomlySelected] = useState<Set<string>>(new Set());

  const isAvailable = (f: GangFighterOption) =>
    countsTowardRating(f) && !f.recovery;

  const sortedFighters = sortWithBeasts(gangFighters);

  const getBeastsForOwner = (ownerId: string) =>
    gangFighters.filter((f) => isBeast(f) && f.owner_id === ownerId);

  const availableNonBeasts = useMemo(
    () => gangFighters.filter((f) => isAvailable(f) && !isBeast(f)),
    [gangFighters]
  );

  const totalTarget = pickCount + randomCount;
  const inQuotaMode = totalTarget > 0;

  const manuallySelectedCount = useMemo(() => {
    let count = 0;
    selected.forEach((_, fighterId) => {
      if (randomlySelected.has(fighterId)) return;
      const f = gangFighters.find((gf) => gf.id === fighterId);
      if (f && !isBeast(f)) count++;
    });
    return count;
  }, [selected, randomlySelected, gangFighters]);

  const pickQuotaMet = inQuotaMode && manuallySelectedCount >= pickCount;

  const handleReset = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      Array.from(randomlySelected).forEach((id) => {
        next.delete(id);
        for (const beast of getBeastsForOwner(id)) {
          next.delete(beast.id);
        }
      });
      return next;
    });
    setRandomlySelected(new Set());
  };

  const handlePickChange = (value: number) => {
    const clamped = Math.max(0, Math.min(value, availableNonBeasts.length));
    setPickCount(clamped);
    if (randomCount > availableNonBeasts.length - clamped) {
      setRandomCount(Math.max(0, availableNonBeasts.length - clamped));
    }
    handleReset();
  };

  const handleRandomChange = (value: number) => {
    const max = availableNonBeasts.length - pickCount;
    const clamped = Math.max(0, Math.min(value, max));
    setRandomCount(clamped);
    handleReset();
  };

  const handleRoll = async () => {
    handleReset();

    const pool = availableNonBeasts.filter((f) => !selected.has(f.id));
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rollInRange(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked = shuffled.slice(0, Math.min(randomCount, shuffled.length));

    const newRandomIds = new Set(picked.map((f) => f.id));
    setRandomlySelected(newRandomIds);

    setSelected((prev) => {
      const next = new Map(prev);
      for (const f of picked) {
        next.set(f.id, f.loadout_id);
        for (const beast of getBeastsForOwner(f.id)) {
          if (isAvailable(beast)) {
            next.set(beast.id, beast.loadout_id);
          }
        }
      }
      return next;
    });

    const pickedNames = picked.map((f) => f.fighter_name).join(', ');
    createGangLog({
      gang_id: gangId,
      action_type: 'crew_roll',
      description: `Random crew selection: ${picked.length} fighter(s) rolled — ${pickedNames}`,
    });
  };

  const isCheckboxDisabled = (fighter: GangFighterOption, beast: boolean) => {
    if (beast) return true;
    if (!isAvailable(fighter)) return true;
    if (!inQuotaMode) return false;
    if (randomlySelected.has(fighter.id)) return true;
    const isCurrentlySelected = selected.has(fighter.id) && selected.get(fighter.id) === fighter.loadout_id;
    if (pickQuotaMet && !isCurrentlySelected && (randomlySelected.size > 0 || randomCount === 0)) return true;
    return false;
  };

  const toggle = (fighter: GangFighterOption) => {
    if (isBeast(fighter)) return;
    if (inQuotaMode && randomlySelected.has(fighter.id)) return;
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
        if (inQuotaMode && pickQuotaMet && (randomlySelected.size > 0 || randomCount === 0)) return prev;
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

    const result = await onConfirm(toAdd, toRemove, toUpdate);
    return result;
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
          <div className="flex items-center gap-4 p-2 bg-muted rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Pick</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handlePickChange(pickCount - 1)}>
                <LuMinus className="h-4 w-4" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">{pickCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handlePickChange(pickCount + 1)}>
                <LuPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Random</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleRandomChange(randomCount - 1)}>
                <LuMinus className="h-4 w-4" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">{randomCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleRandomChange(randomCount + 1)}>
                <LuPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="grow" />
            <button
              className="px-4 py-2 bg-neutral-900 text-white rounded-sm hover:bg-gray-800 disabled:opacity-50"
              onClick={handleRoll}
              disabled={randomCount === 0}
              type="button"
            >
              Roll
            </button>
          </div>
          {inQuotaMode && (
            <div className="px-2">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{manuallySelectedCount + randomlySelected.size}</span> of {totalTarget} selected
              </span>
            </div>
          )}
          <div className="flex items-center text-sm font-medium text-muted-foreground px-2">
            {!inQuotaMode && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                className="mr-3"
              />
            )}
            {inQuotaMode && <div className="mr-3 w-4" />}
            <div className="grow">Name</div>
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
                className={`flex items-center p-2 bg-muted rounded-md ${beast ? 'ml-6 cursor-default opacity-70' : isCheckboxDisabled(f, beast) ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(f)}
                  className="mr-3"
                  disabled={isCheckboxDisabled(f, beast)}
                />
                <span className="grow overflow-hidden text-ellipsis flex items-center gap-1">
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
                <span className="text-right text-muted-foreground whitespace-nowrap">{f.credits === 0 ? '*' : f.credits}</span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
