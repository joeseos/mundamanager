'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MdOutlinePersonalInjury } from 'react-icons/md';
import {
  updateFighterOutcome,
  addPendingInjury,
  removePendingInjury,
} from '@/app/actions/battle-sessions';
import type { BattleSessionFighter } from '@/types/battle-session';

interface FighterOutcomeRowProps {
  fighter: BattleSessionFighter;
  editable?: boolean;
  onRemove?: () => void;
}

export default function FighterOutcomeRow({
  fighter,
  editable = false,
  onRemove,
}: FighterOutcomeRowProps) {
  const [xp, setXp] = useState(fighter.xp_earned);
  const [showInjuryPicker, setShowInjuryPicker] = useState(false);
  const [injuryTypes, setInjuryTypes] = useState<
    { id: string; effect_name: string; type_specific_data: any }[]
  >([]);
  const [loadingInjuries, setLoadingInjuries] = useState(false);

  // Sync xp from props when realtime updates arrive
  useEffect(() => {
    setXp(fighter.xp_earned);
  }, [fighter.xp_earned]);

  const xpMutation = useMutation({
    mutationFn: (newXp: number) =>
      updateFighterOutcome({
        session_fighter_id: fighter.id,
        xp_earned: newXp,
      }),
    onError: () => toast.error('Failed to update XP'),
  });

  const addInjuryMutation = useMutation({
    mutationFn: (injury: {
      fighter_effect_type_id: string;
      effect_name: string;
      send_to_recovery: boolean;
      set_captured: boolean;
    }) =>
      addPendingInjury({
        session_fighter_id: fighter.id,
        ...injury,
      }),
    onSuccess: (result) => {
      if (result.success) {
        setShowInjuryPicker(false);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error('Failed to add injury'),
  });

  const removeInjuryMutation = useMutation({
    mutationFn: (index: number) =>
      removePendingInjury({
        session_fighter_id: fighter.id,
        injury_index: index,
      }),
    onError: () => toast.error('Failed to remove injury'),
  });

  // Load injury types when picker is opened
  const loadInjuryTypes = async () => {
    if (injuryTypes.length > 0) {
      setShowInjuryPicker(true);
      return;
    }
    setLoadingInjuries(true);
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data } = await supabase
        .from('fighter_effect_types')
        .select('id, effect_name, type_specific_data, fighter_effect_categories!inner(category_name)')
        .in('fighter_effect_categories.category_name', ['injuries'])
        .order('effect_name');
      setInjuryTypes(data || []);
      setShowInjuryPicker(true);
    } catch {
      toast.error('Failed to load injury types');
    } finally {
      setLoadingInjuries(false);
    }
  };

  return (
    <div className="rounded border border-neutral-100 p-2 dark:border-neutral-700">
      <div className="flex items-center gap-3">
        {/* Fighter Name */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {fighter.fighter?.fighter_name || 'Unknown Fighter'}
        </span>

        {/* XP */}
        {editable ? (
          <div className="flex items-center gap-1">
            <label className="text-xs text-neutral-500">XP</label>
            <input
              type="number"
              min={0}
              value={xp}
              onChange={(e) => setXp(Number(e.target.value))}
              onBlur={() => {
                if (xp !== fighter.xp_earned) xpMutation.mutate(xp);
              }}
              className="w-14 rounded border border-neutral-300 px-1.5 py-0.5 text-center text-sm dark:border-neutral-600 dark:bg-neutral-800"
            />
          </div>
        ) : (
          fighter.xp_earned > 0 && (
            <span className="text-sm text-neutral-500">
              +{fighter.xp_earned} XP
            </span>
          )
        )}


        {/* Add Injury */}
        {editable && (
          <button
            onClick={loadInjuryTypes}
            disabled={loadingInjuries}
            title="Add Injury"
            className="rounded-lg bg-neutral-900 p-1.5 text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <MdOutlinePersonalInjury className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Remove */}
        {editable && onRemove && (
          <button
            onClick={onRemove}
            className="text-sm text-neutral-400 hover:text-red-500"
            title="Remove fighter"
          >
            ✕
          </button>
        )}
      </div>

      {/* Pending Injuries */}
      {fighter.pending_injuries && fighter.pending_injuries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {fighter.pending_injuries.map((injury, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
            >
              {injury.effect_name}
              {editable && (
                <button
                  onClick={() => removeInjuryMutation.mutate(idx)}
                  className="ml-0.5 hover:text-red-900"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Injury Picker Dropdown */}
      {showInjuryPicker && (
        <div className="mt-2 rounded border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">
              Select Injury
            </span>
            <button
              onClick={() => setShowInjuryPicker(false)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Close
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {injuryTypes.map((injury) => {
              const tsd = injury.type_specific_data || {};
              return (
                <button
                  key={injury.id}
                  onClick={() =>
                    addInjuryMutation.mutate({
                      fighter_effect_type_id: injury.id,
                      effect_name: injury.effect_name,
                      send_to_recovery: !!tsd.recovery,
                      set_captured: !!tsd.captured,
                    })
                  }
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  {injury.effect_name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
