import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { customFighterTypes } from '@/utils/db/schema';
import { CustomFighterType } from "@/types/fighter";
import { withEditionSlug } from "@/types/edition";
import { groupBy } from '@/utils/gang-assembly';
import { CUSTOM_ROW } from './custom-row';

type EquipmentRow = {
  equipment_id: string | null;
  custom_equipment_id: string | null;
  equipment: { equipment_name: string | null } | null;
  custom_equipment: { equipment_name: string | null } | null;
};

// Regular equipment first, then custom, with the custom_ id prefix the equipment API uses.
function equipmentEntries(rows: EquipmentRow[]) {
  return [
    ...rows.flatMap(row => row.equipment_id ? [{
      equipment_id: row.equipment_id,
      equipment_name: row.equipment?.equipment_name || 'Unknown',
    }] : []),
    ...rows.flatMap(row => row.custom_equipment_id ? [{
      equipment_id: `custom_${row.custom_equipment_id}`,
      equipment_name: `${row.custom_equipment?.equipment_name || 'Unknown'} (Custom)`,
    }] : []),
  ];
}

const EQUIPMENT_NAMES = {
  equipment: { columns: { equipment_name: true } },
  custom_equipment: { columns: { equipment_name: true } },
} as const;

export async function getUserCustomFighterTypes(userId: string): Promise<CustomFighterType[]> {
  return unstable_cache(
    async () => {
      const db = getAppDb();
      // Lets the skill and equipment reads run alongside the fighter types read.
      const userFighterTypeIds = db
        .select({ id: customFighterTypes.id })
        .from(customFighterTypes)
        .where(eq(customFighterTypes.user_id, userId));

      const [fighterTypes, skillAccess, fighterDefaults, equipmentList] = await Promise.all([
        db.query.customFighterTypes.findMany({
          ...CUSTOM_ROW,
          where: (fighter, { eq }) => eq(fighter.user_id, userId),
          orderBy: (fighter, { asc }) => asc(fighter.fighter_type),
          with: {
            editions: { columns: { slug: true } },
            custom_gang_type: { columns: { gang_type: true } },
          },
        }),
        db.query.fighterTypeSkillAccess.findMany({
          columns: { custom_fighter_type_id: true, skill_type_id: true, custom_skill_type_id: true, access_level: true },
          where: (access) => inArray(access.custom_fighter_type_id, userFighterTypeIds),
          with: {
            skill_type: { columns: { name: true } },
            custom_skill_type: { columns: { name: true } },
          },
        }),
        db.query.fighterDefaults.findMany({
          columns: { custom_fighter_type_id: true, skill_id: true, equipment_id: true, custom_equipment_id: true },
          where: (row) => inArray(row.custom_fighter_type_id, userFighterTypeIds),
          with: { skill: { columns: { name: true, skill_type_id: true } }, ...EQUIPMENT_NAMES },
        }),
        db.query.customFighterTypeEquipment.findMany({
          columns: { custom_fighter_type_id: true, equipment_id: true, custom_equipment_id: true },
          where: (row) => inArray(row.custom_fighter_type_id, userFighterTypeIds),
          with: EQUIPMENT_NAMES,
        }),
      ]);

      const skillAccessByFighter = groupBy(skillAccess, 'custom_fighter_type_id');
      const defaultsByFighter = groupBy(fighterDefaults, 'custom_fighter_type_id');
      const equipmentListByFighter = groupBy(equipmentList, 'custom_fighter_type_id');

      return fighterTypes.map(({ custom_gang_type, ...fighter }) => {
        const defaults = defaultsByFighter[fighter.id] ?? [];
        return {
          ...withEditionSlug(fighter),
          gang_type: custom_gang_type?.gang_type ?? fighter.gang_type,
          skill_access: (skillAccessByFighter[fighter.id] ?? []).flatMap(access => {
            const skillTypeId = access.skill_type_id || access.custom_skill_type_id;
            return skillTypeId ? [{
              skill_type_id: skillTypeId,
              access_level: access.access_level,
              skill_type_name: access.skill_type?.name || access.custom_skill_type?.name || 'Unknown',
              is_custom: !!access.custom_skill_type_id,
            }] : [];
          }),
          default_skills: defaults.flatMap(row => row.skill_id ? [{
            skill_id: row.skill_id,
            skill_name: row.skill?.name || 'Unknown',
            skill_type_id: row.skill?.skill_type_id || '',
          }] : []),
          default_equipment: equipmentEntries(defaults),
          equipment_list: equipmentEntries(equipmentListByFighter[fighter.id] ?? []),
        };
      });
    },
    [`user-custom-fighters-v4-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
