import React, { useMemo } from 'react';
import { Weapon, WeaponProfile } from '@/types/weapon';

interface WeaponTableProps {
  weapons: Weapon[];
}

const WeaponTable: React.FC<WeaponTableProps> = ({ weapons }) => {
  if (!weapons || weapons.length === 0) {
    return <p>No weapons available.</p>;
  }

  // Memoize formatting functions
  const formatters = useMemo(() => ({
    formatValue: (value: string | number | null | undefined, isStrength: boolean = false) => {
      if (value === null || value === undefined) return '-';
      return value.toString();
    },
    formatAccuracy: (value: number | null): string => {
      if (value === null || value === 0) return '-';
      return value.toString();
    },
    formatAp: (value: number): string => {
      return value === 0 ? '-' : value.toString();
    },
    formatAmmo: (value: number): string => {
      return value === 0 ? '-' : value.toString();
    }
  }), []);

  const formatStrength = (strength: string) => {
    return strength.toString();
  };

  // Group profiles by weapon_group_id
  const groupedProfiles = useMemo(() => {
    const groups: { [key: string]: WeaponProfile[] } = {};
    
    weapons.forEach(weapon => {
      weapon.weapon_profiles?.forEach(profile => {
        const groupKey = profile.weapon_group_id || weapon.fighter_weapon_id;
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(profile);
      });
    });

    return groups;
  }, [weapons]);

  // Track row index for alternating colors
  let rowIndex = 0;

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full border-collapse table-weapons" style={{ fontSize: 'calc(10px + 0.2vmin)' }}>
        <colgroup>
          <col style={{ width: '30%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '6%' }}/>
          <col style={{ width: '22%' }}/></colgroup>
        <thead>
          <tr>
            <th className="text-left p-1 align-bottom" rowSpan={2}>Weapon</th>
            <th className="text-center p-1 print:hidden" colSpan={2}>Range</th>
            <th className="text-center p-1 print:hidden" colSpan={2}>Acc</th>
            <th className="text-center p-1" colSpan={5}></th>
          </tr>
          <tr>
            <th className="text-center p-1 border-l border-black">S</th>
            <th className="text-center p-1">L</th>
            <th className="text-center p-1 border-l border-black">S</th>
            <th className="text-center p-1">L</th>
            <th className="text-center p-1 border-l border-black">Str</th>
            <th className="text-center p-1 border-l border-black">D</th>
            <th className="text-center p-1 border-l border-black">AP</th>
            <th className="text-center p-1 border-l border-black">Am</th>
            <th className="text-left p-1 border-l border-black">Traits</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedProfiles).map(([groupId, profiles]) => {
            rowIndex++;
            const bgClass = rowIndex % 2 === 1 ? 'bg-black/[0.07]' : '';
            
            return profiles.map((profile, profileIndex) => (
              <tr 
                key={`${groupId}-${profileIndex}`}
                className={bgClass}
              >
                <td className="text-left p-1 whitespace-normal align-top">
                  {profile.profile_name}
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
                  {formatters.formatValue(profile.damage)}
                </td>
                <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                  {formatters.formatAp(profile.ap)}
                </td>
                <td className="text-center p-1 border-l border-black whitespace-nowrap align-top">
                  {formatters.formatAmmo(profile.ammo)}
                </td>
                <td className="text-left p-1 border-l border-black whitespace-normal align-top">
                  {profile.traits}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(WeaponTable);
