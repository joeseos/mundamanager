'use client';

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
