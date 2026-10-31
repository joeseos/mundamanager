import type { CatalogueSlot } from '@/utils/portrait-catalogue';

/** n23 gang type names whose catalogue section uses the n26 name. */
const CATALOGUE_GROUP_BY_GANG_TYPE: Record<string, string> = {
  'Helot Chaos Cults': 'Chaos Helots',
  'Ironhead Squat Prospectors': 'Ironhead Squats',
  'Underhive Outcasts': 'Outcasts',
  'Slave Ogryns': 'Free Ogryns',
  'Spyre Hunting Party': 'Spyre Hunters',
  'Malstrain Genestealers': 'The Malstrain',
};

export function catalogueGroupLabel(gangTypeName: string): string {
  return CATALOGUE_GROUP_BY_GANG_TYPE[gangTypeName] ?? gangTypeName;
}

export function catalogueSlotForGangType(
  gangType: { gang_type: string; is_custom?: boolean; parent_gang_type_id?: string | null },
  parentGangTypeName: string | null
): CatalogueSlot | null {
  if (gangType.is_custom) return null;
  if (gangType.parent_gang_type_id) {
    if (!parentGangTypeName) return null;
    return {
      groupLabel: catalogueGroupLabel(parentGangTypeName),
      label: gangType.gang_type,
    };
  }
  return { groupLabel: catalogueGroupLabel(gangType.gang_type), label: null };
}
