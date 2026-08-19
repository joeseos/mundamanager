'use client';

import React from 'react';
import { Tooltip, type TooltipRefProps } from 'react-tooltip';
import { Equipment, WeaponProfile } from '@/types/equipment';
import { hasLethalityStatline } from '@/types/edition';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';

export interface EquipmentTooltipOptions {
  equipmentListType?: 'fighters-list' | 'fighters-tradingpost' | 'unrestricted';
  isVehicleEquipment?: boolean;
}

function hasProfileData(profile: WeaponProfile): boolean {
  return !!(
    profile.range_short || profile.range_long ||
    profile.acc_short || profile.acc_long ||
    profile.strength || profile.ap ||
    profile.damage || profile.lethality || profile.ammo ||
    profile.traits
  );
}

function getEquipmentSourceParts(
  item: Equipment,
  options?: EquipmentTooltipOptions
): string[] {
  const { equipmentListType, isVehicleEquipment = false } = options || {};
  const sourceParts: string[] = [];

  if (equipmentListType !== undefined) {
    if (item.is_custom) sourceParts.push('Custom');
    if (item.fighter_type_equipment || item.from_fighters_list) {
      sourceParts.push(isVehicleEquipment ? "Vehicle's List" : "Fighter's List");
    }
    if (item.equipment_tradingpost && (item.trading_post_names || []).length > 0) {
      sourceParts.push((item.trading_post_names || []).join(', '));
    }
    if (equipmentListType === 'unrestricted' && sourceParts.length === 0) {
      sourceParts.push('Exclusive');
    }
  }

  return sourceParts;
}

function getSortedWeaponProfiles(item: Equipment): WeaponProfile[] {
  const seenIds = new Set<string>();
  const uniqueProfiles = (item.weapon_profiles || []).filter((profile) => {
    const id = (profile as WeaponProfile & { id?: string }).id ?? profile.profile_name;
    if (seenIds.has(String(id))) return false;
    seenIds.add(String(id));
    return true;
  });

  return [...uniqueProfiles].sort((a, b) => {
    const orderA = (a as WeaponProfile & { sort_order?: number }).sort_order ?? 1;
    const orderB = (b as WeaponProfile & { sort_order?: number }).sort_order ?? 1;
    if (orderA !== orderB) return orderA - orderB;
    return (a.profile_name || '').localeCompare(b.profile_name || '');
  });
}

function hasEquipmentTooltipContent(item: Equipment, options?: EquipmentTooltipOptions): boolean {
  const isWeaponWithProfiles = item.equipment_type === 'weapon' && !!item.weapon_profiles?.length;
  return isWeaponWithProfiles || getEquipmentSourceParts(item, options).length > 0;
}

const TABLE_CELL_PADDING = 'p-0.5 md:p-1 lg:p-1.5';

function statCellClass(showBorderLeft: boolean, extra = '') {
  return [showBorderLeft ? 'border-l border-neutral-600' : '', TABLE_CELL_PADDING, extra].filter(Boolean).join(' ');
}

function EquipmentTooltipContent({ item, options, editionSlug }: { item: Equipment; options?: EquipmentTooltipOptions; editionSlug?: string | null }) {
  const sourceParts = getEquipmentSourceParts(item, options);
  const isWeaponWithProfiles = item.equipment_type === 'weapon' && !!item.weapon_profiles?.length;
  const sortedProfiles = isWeaponWithProfiles ? getSortedWeaponProfiles(item) : [];
  const hasAnyProfileData = sortedProfiles.some(profile => hasProfileData(profile));
  // Mirrors the fighter card's weapon table: N26 drops Acc, D and Am and adds
  // Lethality. Same predicate, so the two tables cannot drift apart.
  const usesLethality = hasLethalityStatline(editionSlug);

  return (
    <div className="text-xs">
      {isWeaponWithProfiles && (
        hasAnyProfileData ? (
          <table className="w-full border-collapse">
            <thead>
              {usesLethality ? (
                <tr className="border-b border-neutral-500">
                  <th className={`min-w-20 w-40 ${TABLE_CELL_PADDING} text-left text-[10px]`}>Weapon</th>
                  <th className={`min-w-6 border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>SR</th>
                  <th className={`min-w-6 border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>LR</th>
                  <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>Str</th>
                  <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>AP</th>
                  <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>L</th>
                  <th className={`max-w-[22vw] border-l border-neutral-500 ${TABLE_CELL_PADDING} text-left text-[10px]`}>Traits</th>
                </tr>
              ) : (
                <>
                  <tr>
                    <th className="min-w-20 w-40 text-left"></th>
                    <th className="text-center text-[10px]" colSpan={2}>Rng</th>
                    <th className="text-center text-[10px]" colSpan={2}>Acc</th>
                    <th className="text-center"></th>
                    <th className="text-center"></th>
                    <th className="text-center"></th>
                    <th className="text-center"></th>
                    <th className="text-left"></th>
                  </tr>
                  <tr className="border-b border-neutral-500">
                    <th className={`${TABLE_CELL_PADDING} text-left text-[10px]`}>Weapon</th>
                    <th className={`min-w-6 border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>S</th>
                    <th className={`min-w-6 ${TABLE_CELL_PADDING} text-center text-[10px]`}>L</th>
                    <th className={`min-w-6 border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>S</th>
                    <th className={`min-w-6 ${TABLE_CELL_PADDING} text-center text-[10px]`}>L</th>
                    <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>Str</th>
                    <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>AP</th>
                    <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>D</th>
                    <th className={`border-l border-neutral-500 ${TABLE_CELL_PADDING} text-center text-[10px]`}>Am</th>
                    <th className={`max-w-[22vw] border-l border-neutral-500 ${TABLE_CELL_PADDING} text-left text-[10px]`}>Traits</th>
                  </tr>
                </>
              )}
            </thead>
            <tbody>
              {sortedProfiles.map((profile) => {
                const profileHasData = hasProfileData(profile);

                return (
                  <tr key={(profile as WeaponProfile & { id?: string }).id ?? profile.profile_name} className="border-b border-neutral-600">
                    <td className={`max-w-[10vw] ${TABLE_CELL_PADDING} align-top font-medium text-ellipsis`}>
                      {profile.profile_name || '-'}
                    </td>
                    {profileHasData ? (
                      <>
                        <td className={statCellClass(true, 'text-center align-top')}>{profile.range_short ?? '-'}</td>
                        <td className={statCellClass(usesLethality, 'text-center align-top')}>{profile.range_long ?? '-'}</td>
                        {!usesLethality && (
                          <>
                            <td className={statCellClass(true, 'text-center align-top')}>{profile.acc_short ?? '-'}</td>
                            <td className={statCellClass(false, 'text-center align-top')}>{profile.acc_long ?? '-'}</td>
                          </>
                        )}
                        <td className={statCellClass(true, 'text-center align-top')}>{profile.strength ?? '-'}</td>
                        <td className={statCellClass(true, 'text-center align-top')}>{profile.ap ?? '-'}</td>
                        <td className={statCellClass(true, 'text-center align-top')}>
                          {(usesLethality ? profile.lethality : profile.damage) ?? '-'}
                        </td>
                        {!usesLethality && (
                          <td className={statCellClass(true, 'text-center align-top')}>{profile.ammo ?? '-'}</td>
                        )}
                        <td className={statCellClass(true, 'max-w-[22vw] whitespace-normal align-top')}>{profile.traits ?? '-'}</td>
                      </>
                    ) : (
                      <>
                        <td className={statCellClass(true, 'text-center')}></td>
                        <td className={statCellClass(false, 'text-center')}></td>
                        <td className={statCellClass(false, 'text-center')}></td>
                        <td className={statCellClass(false, 'text-center')}></td>
                        <td className={statCellClass(false, 'text-center')}></td>
                        {!usesLethality && (
                          <>
                            <td className={statCellClass(false, 'text-center')}></td>
                            <td className={statCellClass(false, 'text-center')}></td>
                            <td className={statCellClass(false, 'text-center')}></td>
                          </>
                        )}
                        <td className={statCellClass(false)}></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>
            {sortedProfiles.map((profile) => (
              <div key={(profile as WeaponProfile & { id?: string }).id ?? profile.profile_name}>
                {profile.profile_name}
              </div>
            ))}
          </div>
        )
      )}
      {sourceParts.length > 0 && (
        <div className={`${TABLE_CELL_PADDING} text-[11px] text-neutral-400`}>
          Source: {sourceParts.join(', ')}
        </div>
      )}
    </div>
  );
}

interface EquipmentTooltipTriggerProps {
  item: Equipment;
  children: React.ReactNode;
  className?: string;
  options?: EquipmentTooltipOptions;
  editionSlug?: string | null;
}

export function EquipmentTooltipTrigger({ item, children, className, options, editionSlug }: EquipmentTooltipTriggerProps) {
  const tooltipId = React.useId();
  const tooltipRef = React.useRef<TooltipRefProps>(null);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const isCoarsePointer = useCoarsePointer();
  const hasTooltipContent = hasEquipmentTooltipContent(item, options);

  const handleMobileTooltipTouchStart = React.useCallback((event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleMobileTooltipTouchEnd = React.useCallback((event: React.TouchEvent) => {
    if (!touchStartRef.current) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    touchStartRef.current = null;

    if (deltaX > 10 || deltaY > 10) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    tooltipRef.current?.close();
  }, []);

  if (!hasTooltipContent) {
    return <div className={className}>{children}</div>;
  }

  return (
    <>
      <div
        className={`${className ?? ''} cursor-help`.trim()}
        data-tooltip-id={tooltipId}
      >
        {children}
      </div>
      <Tooltip
        ref={tooltipRef}
        id={tooltipId}
        place="top-start"
        className="bg-neutral-900! text-white! text-xs! z-[60]!"
        clickable={isCoarsePointer}
        openOnClick={isCoarsePointer}
        delayHide={isCoarsePointer ? 100 : undefined}
        positionStrategy={isCoarsePointer ? 'fixed' : 'absolute'}
        style={{
          padding: '6px',
          maxWidth: '97vw',
          marginLeft: '-10px'
        }}
      >
        <div
          className={isCoarsePointer ? 'cursor-pointer' : undefined}
          onTouchStart={isCoarsePointer ? handleMobileTooltipTouchStart : undefined}
          onTouchEnd={isCoarsePointer ? handleMobileTooltipTouchEnd : undefined}
        >
          <EquipmentTooltipContent item={item} options={options} editionSlug={editionSlug} />
        </div>
      </Tooltip>
    </>
  );
}
