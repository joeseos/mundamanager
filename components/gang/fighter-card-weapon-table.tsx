import React, { useMemo } from 'react';
import { Weapon, WeaponProfile } from '@/types/equipment';
import { GangViewMode } from '@/components/gang/ViewModeDropdown';
import { hasLethalityStatline } from '@/types/edition';

interface WeaponTableProps {
  weapons: Weapon[];
  entity?: 'crew' | 'vehicle';
  viewMode?: GangViewMode;
  editionSlug?: string | null;
}

const WeaponTable: React.FC<WeaponTableProps> = ({ weapons, entity, viewMode, editionSlug }) => {
  // Memoize formatting functions
  const formatters = useMemo(() => ({
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
  }), []);

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

  const formatStrength = (strength: string | number | null | undefined) => {
    if (strength === null || strength === undefined) return '-';
    return strength.toString();
  };

  type VariantKey = string; // weapon_group_id|mc|reg|profileSignature|effectSignature|hardpointKey
  interface VariantBlock {
    weaponName: string;
    isMasterCrafted: boolean;
    baseProfiles: Array<{ profile: WeaponProfile; weaponId: string }>; // Track which weapon each profile comes from
    specials: Map<string, WeaponProfile>; // deduplicated by name
    effectNames?: string[]; // Names of effects that target this weapon
    hardpointLocation?: string;
    hardpointArcs?: string[];
    hardpointOperatedBy?: 'crew' | 'passenger';
  }

  // Helper function to create a profile signature based on key stats
  const createProfileSignature = (profile: WeaponProfile): string => {
    const keyStats = [
      profile.range_short,
      profile.range_long,
      profile.acc_short,
      profile.acc_long,
      profile.strength,
      profile.ap,
      profile.damage,
      profile.lethality,
      profile.ammo,
      profile.traits
    ].join('|');
    return keyStats;
  };

  // Determine master-crafted status per weapon instance (not per group)
  const weaponMasterCraftedStatus = new Map<string, boolean>();
  
  weapons.forEach((weapon) => {
    // Check if this specific weapon instance is master-crafted
    const isMasterCrafted = weapon.weapon_profiles?.some(p => p.is_master_crafted) 
      || weapon.weapon_name.includes('Master-crafted') 
      || weapon.weapon_name.includes('(MC)')
      || (weapon as any).is_master_crafted;
    
    weaponMasterCraftedStatus.set(weapon.fighter_weapon_id, isMasterCrafted || false);
  });

  const variantMap: Record<VariantKey, VariantBlock> = {};
  weapons.forEach((weapon) => {
    // Get all base profiles for this weapon (non-special profiles)
    const baseProfilesForWeapon = weapon.weapon_profiles?.filter(p => !p.profile_name?.startsWith('-')) || [];
    
    // Create a signature for all base profiles combined (to detect if weapon has modified stats)
    // This signature will be used for grouping - weapons with identical base profiles will be grouped together
    const weaponProfileSignature = baseProfilesForWeapon
      .map(p => createProfileSignature(p))
      .sort()
      .join('||');
    
    // Create an effect signature to differentiate weapons with different effects
    // Weapons with different effects should not be grouped together, even if they have the same stats
    const effectSignature = weapon.effect_names && weapon.effect_names.length > 0
      ? weapon.effect_names.slice().sort().join(',')
      : 'noeffects';
    
    // Get master-crafted status for this specific weapon instance
    const isWeaponMasterCrafted = weaponMasterCraftedStatus.get(weapon.fighter_weapon_id) || false;
    
    const hardpointKey = weapon.hardpoint_location || 'no-hp';

    // The ids that mean "this weapon". A weapon's own profiles spell that two
    // ways: weapons saved through the admin edit form group under their own
    // catalog id, weapons saved through the create form leave it null. The
    // server attaches grouped ammo (separately owned equipment whose profiles
    // point at this weapon) onto this weapon's profile list, and those always
    // carry the catalog id -- so both spellings have to resolve to one block,
    // otherwise the ammo forms a base-less block and is discarded below.
    const ownGroupIds = new Set<string>(
      [weapon.weapon_id, ...baseProfilesForWeapon.map(p => p.weapon_group_id)]
        .filter((id): id is string => !!id)
    );
    // Keep the weapon's existing anchor: a self-grouping weapon stays keyed on
    // its catalog id (so two copies still collapse to one "(x2)" row), and a
    // weapon with no group stays keyed per instance.
    const ownAnchor = baseProfilesForWeapon.find(p => p.weapon_group_id)?.weapon_group_id
      || weapon.fighter_weapon_id;

    weapon.weapon_profiles?.forEach((profile) => {
      // Only a profile pointing at a *different* weapon groups elsewhere.
      const groupId = profile.weapon_group_id && !ownGroupIds.has(profile.weapon_group_id)
        ? profile.weapon_group_id
        : ownAnchor;
      // Use the weapon's profile signature for all profiles (base and special) so they stay together
      // Include weapon instance master-crafted status, profile signature, effect signature, and hardpoint to properly separate weapons
      const key: VariantKey = `${groupId}|${isWeaponMasterCrafted ? 'mc' : 'reg'}|${weaponProfileSignature}|${effectSignature}|${hardpointKey}`;

      if (!variantMap[key]) {
        variantMap[key] = {
          weaponName: profile.profile_name?.startsWith('-') ? '' : (profile.profile_name || ''),
          isMasterCrafted: isWeaponMasterCrafted,
          baseProfiles: [],
          specials: new Map<string, WeaponProfile>(),
          effectNames: weapon.effect_names && weapon.effect_names.length > 0 ? weapon.effect_names : undefined,
          hardpointLocation: weapon.hardpoint_location,
          hardpointArcs: weapon.hardpoint_arcs,
          hardpointOperatedBy: weapon.hardpoint_operated_by,
        };
      }

      const block = variantMap[key];

      if (profile.profile_name?.startsWith('-')) {
        if (!block.specials.has(profile.profile_name)) block.specials.set(profile.profile_name, profile);
      } else {
        block.baseProfiles.push({ profile, weaponId: weapon.fighter_weapon_id });
        if (!block.weaponName) block.weaponName = profile.profile_name || '';
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
            const { weaponName, isMasterCrafted, baseProfiles, specials, effectNames, hardpointLocation, hardpointArcs, hardpointOperatedBy } = block;

            // Group profiles by name AND weapon ID to count duplicates correctly
            // Only count profiles as duplicates if they come from the same weapon instance
            const baseGroups: Record<string, { profile: WeaponProfile; weaponIds: Set<string> }> = {};
            baseProfiles.forEach(({ profile, weaponId }) => {
              const profileKey = profile.profile_name || '';
              if (!baseGroups[profileKey]) {
                baseGroups[profileKey] = { profile, weaponIds: new Set() };
              }
              baseGroups[profileKey].weaponIds.add(weaponId);
            });
            
            // Count total instances of each profile name (across all weapons in this variant block)
            const baseDistinct = Object.keys(baseGroups).map((name) => baseGroups[name].profile);
            const multipleBaseNames = baseDistinct.length > 1;
            
            // Calculate duplicate count: sum of weapon IDs for each profile name
            const duplicateCounts = Object.keys(baseGroups).map((name) => ({
              profile: baseGroups[name].profile,
              duplicate: baseGroups[name].weaponIds.size
            }));

            const specialRows = Array.from(specials.values()).sort((a, b) => {
              const aOrder = (a as any).sort_order ?? 0;
              const bOrder = (b as any).sort_order ?? 0;
              return aOrder !== bOrder ? aOrder - bOrder : a.profile_name.localeCompare(b.profile_name, undefined, { sensitivity: 'base' });
            });

            const rows: { profile: WeaponProfile; duplicate: number }[] = [
              ...duplicateCounts,
              ...specialRows.map((p) => ({ profile: p, duplicate: 1 })),
            ];

            return rows.map(({ profile, duplicate }, rowIdx) => {
              const traitsList: string[] = [];

              if (entity === 'crew') traitsList.push('Arc (Front)');
              if (profile.traits) traitsList.push(profile.traits);
              // Only add Master-crafted trait to profiles that are actually master-crafted, not to ammo
              if (profile.is_master_crafted) traitsList.push('Master-crafted');

              // Hardpoint arc trait for vehicle weapons fitted to hardpoints
              if (hardpointArcs && hardpointArcs.length > 0) {
                const ARC_ORDER = ['Front', 'Left', 'Right', 'Rear'];
                const allPresent = ARC_ORDER.every(a => hardpointArcs.includes(a));
                if (allPresent) {
                  traitsList.push('Arc (All Round)');
                } else {
                  const ordered = ARC_ORDER.filter(a => hardpointArcs.includes(a));
                  traitsList.push(`Arc (${ordered.join(', ')})`);
                }
              }

              // Hardpoint operated-by trait
              if (hardpointOperatedBy === 'crew') {
                traitsList.push('Crew Operated');
              } else if (hardpointOperatedBy === 'passenger') {
                traitsList.push('Passenger Operated');
              }

              traitsList.sort((a, b) => a.localeCompare(b));

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
