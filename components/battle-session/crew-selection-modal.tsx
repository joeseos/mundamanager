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

interface CrewSelectionModalProps {
  gangFighters: GangFighterOption[];
  selectedFighterIds: Set<string>;
  loading: boolean;
  onConfirm: (toAdd: string[], toRemove: string[]) => void;
  onClose: () => void;
}

export default function CrewSelectionModal({
  gangFighters,
  selectedFighterIds,
  loading,
  onConfirm,
  onClose,
}: CrewSelectionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set(selectedFighterIds);
    for (const f of gangFighters) {
      if (f.killed || f.retired || f.enslaved || f.captured || f.recovery) {
        initial.delete(f.id);
      }
    }
    return initial;
  });

  const toggle = (fighterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fighterId)) {
        next.delete(fighterId);
      } else {
        next.add(fighterId);
      }
      return next;
    });
  };

  const isAvailable = (f: GangFighterOption) =>
    countsTowardRating(f) && !f.recovery;
  const activeFighters = gangFighters.filter(isAvailable);
  const allSelected = activeFighters.length > 0 && activeFighters.every((f) => selected.has(f.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeFighters.map((f) => f.id)));
    }
  };

  const handleConfirm = async () => {
    const toAdd = Array.from(selected).filter((id) => !selectedFighterIds.has(id));
    const toRemove = Array.from(selectedFighterIds).filter((id) => !selected.has(id));
    onConfirm(toAdd, toRemove);
  };

  const totalValue = gangFighters
    .filter((f) => selected.has(f.id))
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
            const isSelected = selected.has(f.id);
            return (
              <label
                key={f.loadout_id ? `${f.id}:${f.loadout_id}` : f.id}
                className="flex items-center p-2 bg-muted rounded-md cursor-pointer hover:bg-muted"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(f.id)}
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
