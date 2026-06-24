'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { createGangLog, type CreateGangLogParams } from '@/app/actions/logs/gang-logs';

interface GangFighterOption {
  id: string;
  fighter_name: string;
  label?: string;
  fighter_type?: string;
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

function formatFighterDetails(f: GangFighterOption): string {
  return [
    f.fighter_type,
    f.fighter_class ? `(${f.fighter_class})` : '',
  ].filter(Boolean).join(' ');
}

function getFighterRowClass(f: GangFighterOption, beast: boolean, disabled: boolean): string {
  const base = 'flex items-center px-2 py-1 rounded-md';
  if (!disabled) {
    return `${base} cursor-pointer bg-muted hover:bg-accent/40 dark:hover:bg-accent/25`;
  }
  if (beast) {
    return `${base} cursor-default border border-dashed border-border bg-muted/30 dark:bg-neutral-800/50`;
  }
  return `${base} cursor-default border border-dashed border-neutral-300/90 dark:border-neutral-600 bg-neutral-200/80 dark:bg-neutral-900/70`;
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
  const [rolling, setRolling] = useState(false);
  const queryClient = useQueryClient();
  const gangLogsQueryKey = ['logs', `/api/gangs/${gangId}/logs`] as const;
  const logCrewRollMutation = useMutation({
    mutationFn: async (params: CreateGangLogParams) => {
      const result = await createGangLog(params);
      if (!result.success) throw new Error(result.error || 'Failed to log crew roll');
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gangLogsQueryKey }),
  });

  const isAvailable = (f: GangFighterOption) =>
    countsTowardRating(f) && !f.recovery;

  const sortedFighters = sortWithBeasts(gangFighters);

  const getBeastsForOwner = (ownerId: string) =>
    gangFighters.filter((f) => isBeast(f) && f.owner_id === ownerId);

  const availableNonBeasts = useMemo(() => {
    const seen = new Set<string>();
    return gangFighters.filter((f) => {
      if (!countsTowardRating(f) || f.recovery || isBeast(f)) return false;
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [gangFighters]);

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

  const handleReset = () => {
    setRandomlySelected((prevRandom) => {
      if (prevRandom.size > 0) {
        setSelected((prev) => {
          const next = new Map(prev);
          Array.from(prevRandom).forEach((id) => {
            next.delete(id);
            for (const beast of getBeastsForOwner(id)) {
              next.delete(beast.id);
            }
          });
          return next;
        });
      }
      return new Set();
    });
  };

  const handlePickChange = (value: number) => {
    const clamped = Math.max(0, Math.min(value, availableNonBeasts.length));
    setPickCount(clamped);
    if (randomCount > availableNonBeasts.length - clamped) {
      const newRandom = Math.max(0, availableNonBeasts.length - clamped);
      setRandomCount(newRandom);
      if (newRandom < randomCount) handleReset();
    }
  };

  const handleRandomChange = (value: number) => {
    const max = availableNonBeasts.length - pickCount;
    const clamped = Math.max(0, Math.min(value, max));
    setRandomCount(clamped);
    handleReset();
  };

  const handleRoll = async () => {
    setRolling(true);
    try {
      const manualOnly = new Map<string, string | undefined>();
      selected.forEach((loadoutId, id) => {
        if (randomlySelected.has(id)) return;
        const f = gangFighters.find((gf) => gf.id === id);
        if (f && isBeast(f)) return;
        manualOnly.set(id, loadoutId);
      });

      const pool = availableNonBeasts.filter((f) => !manualOnly.has(f.id));
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rollInRange(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const picked = shuffled.slice(0, Math.min(randomCount, shuffled.length));

      const newRandomIds = new Set(picked.map((f) => f.id));
      setRandomlySelected(newRandomIds);

      const next = new Map<string, string | undefined>();
      const addWithBeasts = (id: string, loadoutId: string | undefined) => {
        next.set(id, loadoutId);
        for (const beast of getBeastsForOwner(id)) {
          if (isAvailable(beast)) {
            next.set(beast.id, beast.loadout_id);
          }
        }
      };
      manualOnly.forEach((loadoutId, id) => addWithBeasts(id, loadoutId));
      for (const f of picked) {
        addWithBeasts(f.id, f.loadout_id);
      }
      setSelected(next);

      const pickedNames = picked.map((f) => f.fighter_name).join(', ');
      await logCrewRollMutation.mutateAsync({
        gang_id: gangId,
        action_type: 'crew_roll',
        description: `Random crew selection: ${picked.length} fighter(s) rolled — ${pickedNames}`,
      }).catch(() => {});
    } finally {
      setRolling(false);
    }
  };

  const isDisabled = (f: GangFighterOption) =>
    isBeast(f) || !isAvailable(f);

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
          <div className="p-2 bg-muted rounded-md flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex flex-col gap-2 sm:w-full sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="flex items-center gap-1">
                <span className="inline-block w-14 text-sm text-muted-foreground">Choose</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handlePickChange(pickCount - 1)}>
                  <LuMinus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{pickCount}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handlePickChange(pickCount + 1)}>
                  <LuPlus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-14 text-sm text-muted-foreground">Random</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleRandomChange(randomCount - 1)}>
                  <LuMinus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{randomCount}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleRandomChange(randomCount + 1)}>
                  <LuPlus className="h-4 w-4" />
                </Button>
                <button
                  className="ml-auto sm:ml-6 px-4 py-2 bg-neutral-900 text-white rounded-sm hover:bg-gray-800 disabled:opacity-50"
                  onClick={handleRoll}
                  disabled={randomCount === 0 || rolling}
                  type="button"
                >
                  Roll
                </button>
              </div>
            </div>
          </div>
          {inQuotaMode && (
            <div className="px-2">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{manuallySelectedCount + randomlySelected.size}</span> of {totalTarget} selected
              </span>
            </div>
          )}
          <div className="space-y-1">
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
            const displayName = beast && f.owner_id ? `— ${f.fighter_name}` : f.fighter_name;
            const fighterDetails = formatFighterDetails(f);
            const disabled = isDisabled(f);
            return (
              <label
                key={`${idx}:${f.id}:${f.loadout_id ?? ''}`}
                className={getFighterRowClass(f, beast, disabled)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(f)}
                  className="mr-3"
                  disabled={disabled}
                />
                <div className="grow min-w-0">
                  <div className={`flex items-center gap-1 flex-wrap ${disabled ? (beast ? 'text-muted-foreground' : 'text-neutral-500 dark:text-neutral-400') : ''}`}>
                    {f.label && (
                      <span className={`inline-flex shrink-0 items-center rounded-sm px-1 text-xs font-bold font-mono uppercase border ${
                        disabled
                          ? 'bg-neutral-100 border-neutral-300 text-neutral-500 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-400'
                          : 'bg-card border-border text-foreground'
                      }`}>
                        {f.label}
                      </span>
                    )}
                    <span>
                      {displayName}
                      {f.loadout_name && (
                        <span className={disabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-muted-foreground'}>
                          {' '}[{f.loadout_name}]
                        </span>
                      )}
                    </span>
                    {f.killed && <IoSkull className="text-gray-300" title="Killed" aria-label="Killed" />}
                    {f.retired && <MdChair className="text-muted-foreground" title="Retired" aria-label="Retired" />}
                    {f.enslaved && <GiCrossedChains className="text-sky-200" title="Enslaved" aria-label="Enslaved" />}
                    {f.starved && <TbMeatOff className="text-red-500" title="Starved" aria-label="Starved" />}
                    {f.recovery && <FaMedkit className="text-blue-500" title="In recovery" aria-label="In recovery" />}
                    {f.captured && <GiHandcuffs className="text-red-600" title="Captured" aria-label="Captured" />}
                  </div>
                  {fighterDetails && (
                    <div className={`text-xs ${disabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-muted-foreground'}`}>
                      {fighterDetails}
                    </div>
                  )}
                </div>
                <span className={`text-right whitespace-nowrap ${disabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-muted-foreground'}`}>
                  {f.credits === 0 ? '*' : f.credits}
                </span>
              </label>
            );
          })}
          </div>
        </div>
      )}
    </Modal>
  );
}
