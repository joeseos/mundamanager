'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HiX } from "react-icons/hi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal from '@/components/ui/modal';
import { CountLimit } from "@/types/fighter-type";
import { gangOriginRank } from "@/utils/gangOriginRank";
import { getGangSubtypeRank } from "@/utils/gangSubtypeRank";

export interface GangOriginOption {
  id: string;
  origin_name: string;
}

/** The gang axes a rule is scoped by. All null applies to every gang. */
export interface GangScope {
  gang_type_id: string | null;
  gang_origin_id: string | null;
  gang_subtype_id: string | null;
}

interface GangScopeLists {
  gangTypes: Array<{ gang_type_id: string; gang_type: string }>;
  origins: GangOriginOption[];
  subtypes: Array<{ id: string; subtype: string }>;
}

export const gangScopeKey = (scope: GangScope) =>
  [scope.gang_type_id, scope.gang_origin_id, scope.gang_subtype_id]
    .map(part => part ?? '')
    .join('|');

/** "Gang type: X, Origin: Y, Gang subtype: Z", or '' for a rule that applies to every gang. */
export function formatGangScope(scope: GangScope, { gangTypes, origins, subtypes }: GangScopeLists): string {
  return [
    scope.gang_type_id
      ? `Gang type: ${gangTypes.find(g => g.gang_type_id === scope.gang_type_id)?.gang_type ?? '…'}`
      : null,
    scope.gang_origin_id
      ? `Origin: ${origins.find(o => o.id === scope.gang_origin_id)?.origin_name ?? '…'}`
      : null,
    scope.gang_subtype_id
      ? `Gang subtype: ${subtypes.find(s => s.id === scope.gang_subtype_id)?.subtype ?? '…'}`
      : null
  ].filter(Boolean).join(', ');
}

/** The Gang Type, Gang Origin and Gang Subtype selects of a gang-scoped rule dialog. '' is Any. */
export function GangScopeSelects({
  gangTypes, origins, subtypes, editionSlug,
  gangTypeId, onGangTypeChange,
  gangOriginId, onGangOriginChange,
  gangSubtypeId, onGangSubtypeChange,
}: GangScopeLists & {
  editionSlug?: string | null;
  gangTypeId: string;
  onGangTypeChange: (id: string) => void;
  gangOriginId: string;
  onGangOriginChange: (id: string) => void;
  gangSubtypeId: string;
  onGangSubtypeChange: (id: string) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1">Gang Type</label>
        <select
          value={gangTypeId}
          onChange={(e) => onGangTypeChange(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Any Gang Type</option>
          {gangTypes.map((gangType) => (
            <option key={gangType.gang_type_id} value={gangType.gang_type_id}>
              {gangType.gang_type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Gang Origin</label>
        <select
          value={gangOriginId}
          onChange={(e) => onGangOriginChange(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Any Gang Origin</option>
          <GangOriginOptions origins={origins} />
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Gang Subtype</label>
        <select
          value={gangSubtypeId}
          onChange={(e) => onGangSubtypeChange(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Any Gang Subtype</option>
          <GangSubtypeOptions subtypes={subtypes} editionSlug={editionSlug} />
        </select>
      </div>
    </>
  );
}

/** Gang-origin <option>s grouped by the category gangOriginRank implies. */
export function GangOriginOptions({ origins }: { origins: GangOriginOption[] }) {
  const groups = [...origins]
    .sort((a, b) =>
      (gangOriginRank[a.origin_name.toLowerCase()] ?? Infinity)
      - (gangOriginRank[b.origin_name.toLowerCase()] ?? Infinity)
    )
    .reduce((acc, origin) => {
      const rank = gangOriginRank[origin.origin_name.toLowerCase()] ?? Infinity;
      const label = rank <= 19 ? 'Prefecture'
        : rank <= 39 ? 'Ancestry'
        : rank <= 59 ? 'Tribe'
        : 'Misc.';
      (acc[label] ||= []).push(origin);
      return acc;
    }, {} as Record<string, GangOriginOption[]>);

  return (
    <>
      {Object.entries(groups).map(([label, group]) => (
        <optgroup key={label} label={label}>
          {group.map((origin) => (
            <option key={origin.id} value={origin.id}>
              {origin.origin_name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/**
 * Gang-subtype <option>s in the edition's own order. With no edition selected the list spans
 * editions and ranks empty, leaving them unordered rather than in one edition's order.
 */
export function GangSubtypeOptions(
  { subtypes, editionSlug }: {
    subtypes: Array<{ id: string; subtype: string }>;
    editionSlug?: string | null;
  }
) {
  const gangSubtypeRank = getGangSubtypeRank(editionSlug);
  return (
    <>
      {[...subtypes]
        .sort((a, b) =>
          (gangSubtypeRank[a.subtype.toLowerCase()] ?? Infinity)
          - (gangSubtypeRank[b.subtype.toLowerCase()] ?? Infinity)
        )
        .map((subtype) => (
          <option key={subtype.id} value={subtype.id}>
            {subtype.subtype}
          </option>
        ))}
    </>
  );
}

/**
 * The Count Limits section of an admin editor: its limits as chips and an Add Limit dialog. limits
 * is null until loaded, which disables adding, so an unloaded list is never saved over the stored
 * one. fighterTypeOptions adds a Fighter Type scope (equipment limits only).
 */
export function CountLimitsEditor({
  limits, onChange, disabled, disabledHint, helper, labelLists, selectLists, fighterTypeOptions,
}: {
  limits: CountLimit[] | null;
  onChange: (limits: CountLimit[]) => void;
  disabled: boolean;
  disabledHint?: string;
  helper: string;
  // Every edition's names label a saved limit; the dialog offers only the edition's own.
  labelLists: GangScopeLists;
  selectLists: GangScopeLists & { editionSlug?: string | null };
  fighterTypeOptions?: Array<{ id: string; label: string }>;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [gangTypeId, setGangTypeId] = useState('');
  const [gangOriginId, setGangOriginId] = useState('');
  const [gangSubtypeId, setGangSubtypeId] = useState('');
  const [fighterTypeId, setFighterTypeId] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  // One limit per scope, so the most specific match is decided by scope alone.
  const keyOf = (limit: CountLimit) => `${gangScopeKey(limit)}|${limit.for_fighter_type_id ?? ''}`;

  const closeDialog = () => {
    setShowDialog(false);
    setGangTypeId('');
    setGangOriginId('');
    setGangSubtypeId('');
    setFighterTypeId('');
    setMin('');
    setMax('');
  };

  // Modal closes the dialog itself unless this returns false.
  const addLimit = () => {
    const limit: CountLimit = {
      gang_type_id: gangTypeId || null,
      gang_origin_id: gangOriginId || null,
      gang_subtype_id: gangSubtypeId || null,
      for_fighter_type_id: fighterTypeId || null,
      min_count: min ? parseInt(min) : null,
      max_count: max ? parseInt(max) : null,
    };

    if ((limits ?? []).some(l => keyOf(l) === keyOf(limit))) {
      toast.error('That scope already has a limit');
      return false;
    }

    onChange([...(limits ?? []), limit]);
  };

  return (
    <div className="col-span-3">
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        Count Limits
      </label>
      <Button
        onClick={() => setShowDialog(true)}
        variant="outline"
        size="sm"
        className="mb-2"
        disabled={disabled || limits === null}
      >
        Add Limit
      </Button>
      {disabled && disabledHint && (
        <p className="text-sm text-muted-foreground mb-2">{disabledHint}</p>
      )}

      {(limits ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(limits ?? []).map((limit) => {
            const scope = [
              formatGangScope(limit, labelLists),
              limit.for_fighter_type_id
                ? `Fighter type: ${fighterTypeOptions?.find(o => o.id === limit.for_fighter_type_id)?.label ?? '…'}`
                : null
            ].filter(Boolean).join(', ') || 'Every gang';
            const counts = [
              limit.min_count != null ? `Min ${limit.min_count}` : null,
              limit.max_count != null ? `Max ${limit.max_count}` : null
            ].filter(Boolean).join(', ');

            return (
              <div
                key={keyOf(limit)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-muted"
              >
                <span>{counts} — {scope}</span>
                <button
                  type="button"
                  onClick={() => onChange((limits ?? []).filter(l => keyOf(l) !== keyOf(limit)))}
                  className="hover:text-red-500 focus:outline-hidden"
                >
                  <HiX className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showDialog && (
        <Modal
          title="Count Limit"
          helper={helper}
          onClose={closeDialog}
          onConfirm={addLimit}
          confirmText="Save Limit"
          confirmDisabled={!min && !max}
          width="sm"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Min</label>
                <Input
                  type="number"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder="e.g. 2 for 2+"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max</label>
                <Input
                  type="number"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder="e.g. 1 for 0-1"
                />
              </div>
            </div>

            <GangScopeSelects
              {...selectLists}
              gangTypeId={gangTypeId}
              onGangTypeChange={setGangTypeId}
              gangOriginId={gangOriginId}
              onGangOriginChange={setGangOriginId}
              gangSubtypeId={gangSubtypeId}
              onGangSubtypeChange={setGangSubtypeId}
            />

            {fighterTypeOptions && (
              <div>
                <label className="block text-sm font-medium mb-1">Fighter Type</label>
                <select
                  value={fighterTypeId}
                  onChange={(e) => setFighterTypeId(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Any Fighter Type</option>
                  {fighterTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
