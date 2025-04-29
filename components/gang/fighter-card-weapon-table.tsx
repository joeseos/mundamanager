import React, { useMemo } from 'react';
import { Weapon, WeaponProfile } from '@/types/weapon';
import { TbHexagonLetterM } from "react-icons/tb";

interface WeaponTableProps {
  weapons: Weapon[];
  entity?: 'crew' | 'vehicle';
}

const WeaponTable: React.FC<WeaponTableProps> = ({ weapons, entity }) => {
  if (!weapons || weapons.length === 0) {
    return <p>No weapons available.</p>;
  }

  // Memoize formatting functions
  const formatters = useMemo(() => ({
    formatValue: (value: string | number | null | undefined, isStrength: boolean = false) => {
      if (value === null || value === undefined) return '-';
      return value.toString();
    },
    formatAccuracy: (value: number | null | undefined): string => {
      if (value === null || value === undefined) return '-';
      return value.toString();
    },
    formatAp: (value: number | null | undefined): string => {
      if (value === null || value === undefined || value === 0) return '-';
      return value.toString();
    },
    formatAmmo: (value: number | null | undefined): string => {
      if (value === null || value === undefined || value === 0) return '-';
      return value.toString();
    }
  }), []);

  const formatStrength = (strength: string | null | undefined) => {
    if (strength === null || strength === undefined) return '-';
    return strength.toString();
  };

  type VariantKey = string; // weapon_group_id|mc|reg
  interface VariantBlock {
    weaponName: string;
    isMasterCrafted: boolean;
    baseProfiles: WeaponProfile[];
    specials: Map<string, WeaponProfile>; // deduplicated by name
  }

  const variantMap: Record<VariantKey, VariantBlock> = {};
  weapons.forEach((weapon) => {
    weapon.weapon_profiles?.forEach((profile) => {
      const groupId = profile.weapon_group_id || weapon.fighter_weapon_id;
      const key: VariantKey = `${groupId}|${profile.is_master_crafted ? 'mc' : 'reg'}`;

      if (!variantMap[key]) {
        variantMap[key] = {
          weaponName: profile.profile_name.startsWith('-') ? '' : profile.profile_name,
          isMasterCrafted: !!profile.is_master_crafted,
          baseProfiles: [],
          specials: new Map<string, WeaponProfile>(),
        };
      }

      const block = variantMap[key];

      if (profile.profile_name.startsWith('-')) {
        if (!block.specials.has(profile.profile_name)) block.specials.set(profile.profile_name, profile);
      } else {
        block.baseProfiles.push(profile);
        if (!block.weaponName) block.weaponName = profile.profile_name;
      }
    });
  });

  // Convert to array, discard orphan specials, sort
  const variantBlocks = Object.values(variantMap)
    .filter((b) => b.baseProfiles.length)
    .sort((a, b) => {
      const cmp = a.weaponName.localeCompare(b.weaponName, undefined, { sensitivity: 'base' });
      return cmp !== 0 ? cmp : Number(a.isMasterCrafted) - Number(b.isMasterCrafted);
    });

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full border-collapse table-weapons" style={{ fontSize: 'calc(10px + 0.2vmin)' }}>
        <colgroup>
          <col style={{ width: '30%' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '35%' }}/>
        </colgroup>
        <thead>
          <tr>
            <th className="text-left p-1 align-bottom" rowSpan={2}>
              {entity === 'vehicle' ? 'Vehicle Weapon' : entity === 'crew' ? 'Crew Weapon' : 'Weapon'}
            </th>
            <th className="text-center p-1 print:hidden" colSpan={2}>Rng</th>
            <th className="text-center p-1 print:hidden" colSpan={2}>Acc</th>
            <th className="text-center p-1" colSpan={5}></th>
          </tr>
          <tr>
            <th className="text-center p-1 border-l border-black">S</th>
            <th className="text-center p-1">L</th>
            <th className="text-center p-1 border-l border-black">S</th>
            <th className="text-center p-1">L</th>
            <th className="text-center p-1 border-l border-black">Str</th>
            <th className="text-center p-1 border-l border-black">AP</th>
            <th className="text-center p-1 border-l border-black">D</th>
            <th className="text-center p-1 border-l border-black">Am</th>
            <th className="text-left p-1 border-l border-black">Traits</th>
          </tr>
        </thead>
        <tbody>
          {variantBlocks.map((block, blockIdx) => {
            const { weaponName, isMasterCrafted, baseProfiles, specials } = block;

            // group identical base names (Boltgun vs Flamer on combi)
            const baseGroups: Record<string, WeaponProfile[]> = {};
            baseProfiles.forEach((bp) => {
              (baseGroups[bp.profile_name] = baseGroups[bp.profile_name] || []).push(bp);
            });
            const baseDistinct = Object.keys(baseGroups).map((name) => baseGroups[name][0]);
            const maxDuplicate = Math.max(...Object.values(baseGroups).map((arr) => arr.length));
            const multipleBaseNames = baseDistinct.length > 1;

            // special rows ordered by sort_order then name
            const specialRows = Array.from(specials.values()).sort((a, b) => {
              const aOrder = (a as any).sort_order ?? 0;
              const bOrder = (b as any).sort_order ?? 0;
              return aOrder !== bOrder ? aOrder - bOrder : a.profile_name.localeCompare(b.profile_name, undefined, { sensitivity: 'base' });
            });

            const rows: { profile: WeaponProfile; duplicate: number }[] = [
              ...baseDistinct.map((p) => ({ profile: p, duplicate: baseGroups[p.profile_name].length })),
              ...specialRows.map((p) => ({ profile: p, duplicate: 1 })),
            ];

            return rows.map(({ profile, duplicate }, rowIdx) => {
              const traitsList: string[] = [];

              if (entity === 'crew') traitsList.push('Arc (Front)');
              if (profile.traits) traitsList.push(profile.traits);
              if (isMasterCrafted) traitsList.push('Master-crafted');

              traitsList.sort((a, b) => a.localeCompare(b));

              const bg = blockIdx % 2 ? 'bg-black/[0.07]' : '';

              return (
                <tr key={`${weaponName}-${isMasterCrafted ? 'mc' : 'reg'}-${rowIdx}`} className={bg}>
                  <td className="text-left p-1 align-top">
                    <div className="table-weapons-truncate">
                      {rowIdx === 0 && !profile.profile_name.startsWith('-') ? (
                        <>
                          {weaponName}
                          {isMasterCrafted && ` (MC)`}
                          {!multipleBaseNames && duplicate > 1 && ` (x${duplicate})`}
                        </>
                      ) : (
                        profile.profile_name
                      )}
                    </div>
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatters.formatValue(profile.range_short)}
                  </td>
                  <td className="text-center p-1 whitespace-nowrap align-top">
                    {formatters.formatValue(profile.range_long)}
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatters.formatAccuracy(profile.acc_short)}
                  </td>
                  <td className="text-center p-1 whitespace-nowrap align-top">
                    {formatters.formatAccuracy(profile.acc_long)}
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatStrength(profile.strength)}
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatters.formatAp(profile.ap)}
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatters.formatValue(profile.damage)}
                  </td>
                  <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                    {formatters.formatAmmo(profile.ammo)}
                  </td>
                  <td className="text-left p-1 border-l border-black whitespace-normal align-top">
                    {traitsList.join(', ')}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(WeaponTable);
