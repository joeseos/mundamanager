'use client';

import { gangOriginRank } from "@/utils/gangOriginRank";
import { getGangSubtypeRank } from "@/utils/gangSubtypeRank";

export interface GangOriginOption {
  id: string;
  origin_name: string;
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
