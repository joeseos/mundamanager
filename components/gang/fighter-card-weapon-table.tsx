import React, { useMemo } from 'react';
import { Weapon } from '@/types/equipment';
import { GangViewMode } from '@/components/gang/ViewModeDropdown';
import { hasLethalityStatline } from '@/types/edition';
import { buildWeaponVariantRows } from '@/utils/weapon-variants';

interface WeaponTableProps {
  weapons: Weapon[];
  entity?: 'crew' | 'vehicle';
  viewMode?: GangViewMode;
  editionSlug?: string | null;
}

// Module scope: they close over nothing, and a card list re-allocated the whole
// object per fighter per render.
const formatters = {
  formatValue: (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return value.toString();
  },
  formatRange: (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    const strValue = value.toString();
    if (strValue === '') return strValue;
    if (strValue.endsWith('"')) return strValue;
    if (strValue.toLowerCase().startsWith('sx')) return strValue;
    // Append " when the value ends with a digit (i.e., a numeric range)
    return /\d$/.test(strValue) ? `${strValue}"` : strValue;
  },
  formatAccuracy: (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === 0 || value === '0') return '-';
    const strValue = value.toString();
    // If strValue is empty, return as is without prefix
    if (strValue === '') return strValue;
    // If it's already formatted with a + or -, return as is
    if (strValue.startsWith('+') || strValue.startsWith('-')) return strValue;
    // Otherwise add a + prefix
    return `+${strValue}`;
  },
  formatAp: (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === 0 || value === '0') return '-';
    return value.toString();
  },
  formatAmmo: (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === 0 || value === '0') return '-';
    return value.toString();
  }
};

const formatStrength = (strength: string | number | null | undefined) => {
  if (strength === null || strength === undefined) return '-';
  return strength.toString();
};

const WeaponTable: React.FC<WeaponTableProps> = ({ weapons, entity, viewMode, editionSlug }) => {
  // Depends only on these two props. Must stay above the early return to keep
  // hook order stable.
  const variantBlocks = useMemo(
    () => buildWeaponVariantRows(weapons, entity),
    [weapons, entity]
  );

  // Not `variantBlocks.length === 0`: a set of only orphan special profiles yields
  // no blocks but still renders an empty table.
  if (!weapons || weapons.length === 0) {
    return <p>No weapons available.</p>;
  }

  const isNormalView = viewMode === 'normal';
  const pClass = isNormalView ? 'p-1' : 'p-px';

  // N26 drops Acc, Damage and Ammo as columns (ammo and damage are written into
  // Traits) and adds Lethality, so the two editions render different tables.
  const usesLethality = hasLethalityStatline(editionSlug);

  const rngAccHeaderSizeClass =
    viewMode === 'print'
      ? 'text-[8px]'
      : viewMode === '4-card'
        ? 'text-[9px] print:text-[8px]'
        : 'print:text-[8px]';

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full border-collapse table-weapons text-[12px] print:text-[13px]">
        <colgroup>
          <col style={{ width: '30%' }}/>
          {/* The five stat columns both editions share -- the last is Lethality
              on N26 and D on N23. N23 then adds Acc S, Acc L and Am. */}
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          <col style={{ width: '2rem' }}/>
          {!usesLethality && (
            <>
              <col style={{ width: '2rem' }}/>
              <col style={{ width: '2rem' }}/>
              <col style={{ width: '2rem' }}/>
            </>
          )}
          <col style={{ width: '35%' }}/>
        </colgroup>
        <thead>
          {usesLethality ? (
            <>
              {/* Empty stand-in for N23's Rng/Acc group row, so both editions leave
                  the same gap under the characteristics table. */}
              <tr aria-hidden="true">
                <th className={`${pClass} ${rngAccHeaderSizeClass}`} colSpan={7}>&nbsp;</th>
              </tr>
              <tr>
                <th className={`${pClass} text-left`}>
                  {entity === 'vehicle' ? 'Vehicle Weapon' : entity === 'crew' ? 'Crew Weapon' : 'Weapon'}
                </th>
                <th className={`${pClass} text-center border-l border-black`}>SR</th>
                <th className={`${pClass} text-center border-l border-black`}>LR</th>
                <th className={`${pClass} text-center border-l border-black`}>Str</th>
                <th className={`${pClass} text-center border-l border-black`}>AP</th>
                <th className={`${pClass} text-center border-l border-black`}>L</th>
                <th className={`${pClass} text-left border-l border-black`}>Traits</th>
              </tr>
            </>
          ) : (
            <>
              <tr>
                <th className={`${pClass} text-left align-bottom`} rowSpan={2}>
                  {entity === 'vehicle' ? 'Vehicle Weapon' : entity === 'crew' ? 'Crew Weapon' : 'Weapon'}
                </th>
                <th className={`${pClass} text-center ${rngAccHeaderSizeClass}`} colSpan={2}>Rng</th>
                <th className={`${pClass} text-center ${rngAccHeaderSizeClass}`} colSpan={2}>Acc</th>
                <th className={`${pClass} text-center`} colSpan={5}></th>
              </tr>
              <tr>
                <th className={`${pClass} text-center border-l border-black`}>S</th>
                <th className={`${pClass} text-center`}>L</th>
                <th className={`${pClass} text-center border-l border-black`}>S</th>
                <th className={`${pClass} text-center`}>L</th>
                <th className={`${pClass} text-center border-l border-black`}>Str</th>
                <th className={`${pClass} text-center border-l border-black`}>AP</th>
                <th className={`${pClass} text-center border-l border-black`}>D</th>
                <th className={`${pClass} text-center border-l border-black`}>Am</th>
                <th className={`${pClass} text-left border-l border-black`}>Traits</th>
              </tr>
            </>
          )}
        </thead>
        <tbody>
          {variantBlocks.map((block, blockIdx) => {
            const { weaponName, isMasterCrafted, effectNames, hardpointLocation, multipleBaseNames } = block;

            return block.rows.map(({ profile, duplicate, traitsText }, rowIdx) => {
              const bg = blockIdx % 2 === 0 ? 'bg-primary/[0.07]' : '';

              return (
                <tr key={`${weaponName}-${isMasterCrafted ? 'mc' : 'reg'}-${rowIdx}`} className={bg}>
                  <td className={`${pClass} text-left align-top`}>
                    <div className="table-weapons-truncate">
                      {rowIdx === 0 && !profile.profile_name?.startsWith('-') ? (
                        <>
                          {weaponName}
                          {hardpointLocation && ` (${hardpointLocation})`}
                          {isMasterCrafted && ` (MC)`}
                          {effectNames && effectNames.length > 0 && ` (${effectNames.join(', ')})`}
                          {!multipleBaseNames && duplicate > 1 && ` (x${duplicate})`}
                        </>
                      ) : (
                        profile.profile_name
                      )}
                    </div>
                  </td>
                  <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                    {formatters.formatRange(profile.range_short)}
                  </td>
                  <td className={`${pClass} text-center ${usesLethality ? 'border-l border-black' : ''} whitespace-nowrap align-top`}>
                    {formatters.formatRange(profile.range_long)}
                  </td>
                  {!usesLethality && (
                    <>
                      <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                        {formatters.formatAccuracy(profile.acc_short)}
                      </td>
                      <td className={`${pClass} text-center whitespace-nowrap align-top`}>
                        {formatters.formatAccuracy(profile.acc_long)}
                      </td>
                    </>
                  )}
                  <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                    {formatStrength(profile.strength)}
                  </td>
                  <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                    {formatters.formatAp(profile.ap)}
                  </td>
                  <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                    {formatters.formatValue(usesLethality ? profile.lethality : profile.damage)}
                  </td>
                  {!usesLethality && (
                    <td className={`${pClass} text-center border-l border-black whitespace-nowrap align-top`}>
                      {formatters.formatAmmo(profile.ammo)}
                    </td>
                  )}
                  <td className={`${pClass} text-left border-l border-black whitespace-normal align-top`}>
                    {traitsText}
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
