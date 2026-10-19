import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomFighterType } from "@/types/fighter";
import { withEditionSlug } from "@/types/edition";
import { groupBy } from '@/utils/gang-assembly';

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
      const fighterTypes = await db.query.customFighterTypes.findMany({
        columns: { created_at: false, updated_at: false },
        extras: (fighter, { sql }) => ({
          created_at: sql<string>`to_json(${fighter.created_at})`.as('created_at'),
          updated_at: sql<string | null>`to_json(${fighter.updated_at})`.as('updated_at'),
        }),
        where: (fighter, { eq }) => eq(fighter.user_id, userId),
        orderBy: (fighter, { asc }) => asc(fighter.fighter_type),
        with: {
          editions: { columns: { slug: true } },
          custom_gang_type: { columns: { gang_type: true } },
        },
      });

      if (fighterTypes.length === 0) {
        return [];
      }

      // Flat reads rather than nested many() relations: fighter_defaults and
      // fighter_type_skill_access have no index on custom_fighter_type_id, so a
      // nested read would scan each table once per fighter type.
      const fighterIds = fighterTypes.map(fighter => fighter.id);
      const [skillAccess, fighterDefaults, equipmentList] = await Promise.all([
        db.query.fighterTypeSkillAccess.findMany({
          columns: { custom_fighter_type_id: true, skill_type_id: true, custom_skill_type_id: true, access_level: true },
          where: (access, { inArray }) => inArray(access.custom_fighter_type_id, fighterIds),
          with: {
            skill_type: { columns: { name: true } },
            custom_skill_type: { columns: { name: true } },
          },
        }),
        db.query.fighterDefaults.findMany({
          columns: { custom_fighter_type_id: true, skill_id: true, equipment_id: true, custom_equipment_id: true },
          where: (row, { inArray }) => inArray(row.custom_fighter_type_id, fighterIds),
          with: { skill: { columns: { name: true, skill_type_id: true } }, ...EQUIPMENT_NAMES },
        }),
        db.query.customFighterTypeEquipment.findMany({
          columns: { custom_fighter_type_id: true, equipment_id: true, custom_equipment_id: true },
          where: (row, { inArray }) => inArray(row.custom_fighter_type_id, fighterIds),
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
