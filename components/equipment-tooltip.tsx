'use client';

import React from 'react';
import { Tooltip } from 'react-tooltip';
import { Equipment, WeaponProfile } from '@/types/equipment';

export const EQUIPMENT_TOOLTIP_ID = 'equipment-tooltip';

export interface EquipmentTooltipOptions {
  equipmentListType?: 'fighters-list' | 'fighters-tradingpost' | 'unrestricted';
  isVehicleEquipment?: boolean;
}

function hasProfileData(profile: WeaponProfile): boolean {
  return !!(
    profile.range_short || profile.range_long ||
    profile.acc_short || profile.acc_long ||
    profile.strength || profile.ap ||
    profile.damage || profile.ammo ||
    profile.traits
  );
}

/**
 * Builds the tooltip HTML for an equipment item.
 * Shows weapon profiles (table or names) and optionally source info.
 */
export function getEquipmentTooltipHtml(
  item: Equipment,
  options?: EquipmentTooltipOptions
): string {
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
    if (equipmentListType === 'fighters-tradingpost' && item.equipment_tradingpost && (item.trading_post_names || []).length === 0 && !(item.fighter_type_equipment || item.from_fighters_list)) {
      sourceParts.push(isVehicleEquipment ? "Vehicle's List" : "Fighter's List");
    }
    if (equipmentListType === 'unrestricted' && sourceParts.length === 0) {
      sourceParts.push('Exclusive');
    }
  }

  const sourceDiv = sourceParts.length > 0
    ? '<div style="padding:2px;font-size:11px;color:#aaa;">Source: ' + sourceParts.join(', ') + '</div>'
    : '';

  const isWeaponWithProfiles = item.equipment_type === 'weapon' && item.weapon_profiles && item.weapon_profiles.length > 0;

  if (!isWeaponWithProfiles && sourceParts.length === 0) {
    return '';
  }

  let html = '';
  if (isWeaponWithProfiles) {
    // Deduplicate profiles by id (can occur when profiles match both weapon_id and weapon_group_id)
    const seenIds = new Set<string>();
    const uniqueProfiles = (item.weapon_profiles || []).filter((p) => {
      const id = (p as WeaponProfile & { id?: string }).id ?? p.profile_name;
      if (seenIds.has(String(id))) return false;
      seenIds.add(String(id));
      return true;
    });
    const sortedProfiles = [...uniqueProfiles].sort((a, b) => {
      const orderA = (a as WeaponProfile & { sort_order?: number }).sort_order ?? 1;
      const orderB = (b as WeaponProfile & { sort_order?: number }).sort_order ?? 1;
      if (orderA !== orderB) return orderA - orderB;
      return (a.profile_name || '').localeCompare(b.profile_name || '');
    });
    const hasAnyProfileData = sortedProfiles.some(profile => hasProfileData(profile));
    if (!hasAnyProfileData) {
      html = sortedProfiles.map(profile => profile.profile_name).join('<br/>') + sourceDiv;
    } else {
      html = '<div style="font-size: 12px;">';
      html += '<table style="width: 100%; border-collapse: collapse;">';
      html += '<thead>';
      html += '<tr>';
      html += '<th style="text-align: left; min-width: 80px;"></th>';
      html += '<th style="text-align: center; solid #666;" colspan="2">Rng</th>';
      html += '<th style="text-align: center; solid #666;" colspan="2">Acc</th>';
      html += '<th style="text-align: center; solid #666;"></th>';
      html += '<th style="text-align: center; solid #666;"></th>';
      html += '<th style="text-align: center; solid #666;"></th>';
      html += '<th style="text-align: center; solid #666;"></th>';
      html += '<th style="text-align: left; solid #666;"></th>';
      html += '</tr>';
      html += '<tr style="border-bottom: 1px solid #666;">';
      html += '<th style="text-align: left; padding: 2px; font-size: 10px;">Weapon</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px; min-width: 25px;">S</th>';
      html += '<th style="text-align: center; padding: 2px; font-size: 10px; min-width: 25px;">L</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px; min-width: 25px;">S</th>';
      html += '<th style="text-align: center; padding: 2px; font-size: 10px; min-width: 25px;">L</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">Str</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">AP</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">D</th>';
      html += '<th style="text-align: center; padding: 2px; border-left: 1px solid #666; font-size: 10px;">Am</th>';
      html += '<th style="text-align: left; padding: 2px; border-left: 1px solid #666; font-size: 10px; max-width: 22vw;">Traits</th>';
      html += '</tr>';
      html += '</thead><tbody>';
      sortedProfiles.forEach(profile => {
        const profileHasData = hasProfileData(profile);
        html += '<tr style="border-bottom: 1px solid #555;">';
        html += `<td style="padding: 2px; vertical-align: top; font-weight: 500; text-overflow: ellipsis; max-width: 10vw;">${profile.profile_name || '-'}</td>`;
        if (profileHasData) {
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.range_short ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center;">${profile.range_long ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.acc_short ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center;">${profile.acc_long ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.strength ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.ap ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.damage ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; text-align: center; border-left: 1px solid #555;">${profile.ammo ?? '-'}</td>`;
          html += `<td style="padding: 3px; vertical-align: top; border-left: 1px solid #555; word-break: normal; white-space: normal; max-width: 22vw;">${profile.traits ?? '-'}</td>`;
        } else {
          html += '<td style="padding: 3px; text-align: center; border-left: 1px solid #555;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px; text-align: center;"></td>';
          html += '<td style="padding: 3px;"></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>' + sourceDiv;
    }
  } else {
    html = sourceDiv;
  }

  return html;
}

interface EquipmentTooltipTriggerProps {
  item: Equipment;
  children: React.ReactNode;
  className?: string;
  options?: EquipmentTooltipOptions;
}

export function EquipmentTooltipTrigger({ item, children, className, options }: EquipmentTooltipTriggerProps) {
  const html = getEquipmentTooltipHtml(item, options);
  const hasTooltipContent = html.length > 0;

  if (!hasTooltipContent) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`${className ?? ''} cursor-help`.trim()}
      data-tooltip-id={EQUIPMENT_TOOLTIP_ID}
      data-tooltip-html={html}
    >
      {children}
    </div>
  );
}

export function EquipmentTooltip() {
  return (
    <Tooltip
      id={EQUIPMENT_TOOLTIP_ID}
      place="top-start"
      className="!bg-neutral-900 !text-white !text-xs !z-[60]"
      style={{
        padding: '6px',
        maxWidth: '97vw',
        marginLeft: '-10px'
      }}
    />
  );
}
