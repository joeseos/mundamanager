import { eq, inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import {
  liveBattleParticipants,
  liveBattles,
  customEquipment,
  customFighterTypes,
  customSkills,
  fighterEquipment,
  fighterSkills,
  fighters,
  gangs,
} from '@/utils/db/schema';

/**
 * What else an account delete changes through the cascades, read before the
 * delete so their caches can be busted after: other players' gangs that use
 * the user's custom fighter types, equipment or skills or have fighters held
 * captive by the user's gangs, and the live battles the user hosted or
 * played in.
 */
export async function getAccountDeleteCacheTargets(userId: string) {
  const db = getAppDb();
  const [typeGangs, equipmentGangs, skillGangs, captiveGangs, participantLiveBattles, hostedLiveBattles] = await Promise.all([
    db.selectDistinct({ gang_id: fighters.gang_id }).from(fighters)
      .where(inArray(fighters.custom_fighter_type_id,
        db.select({ id: customFighterTypes.id }).from(customFighterTypes).where(eq(customFighterTypes.user_id, userId)))),
    db.selectDistinct({ gang_id: fighterEquipment.gang_id }).from(fighterEquipment)
      .where(inArray(fighterEquipment.custom_equipment_id,
        db.select({ id: customEquipment.id }).from(customEquipment).where(eq(customEquipment.user_id, userId)))),
    db.selectDistinct({ gang_id: fighters.gang_id }).from(fighterSkills)
      .innerJoin(fighters, eq(fighters.id, fighterSkills.fighter_id))
      .where(inArray(fighterSkills.custom_skill_id,
        db.select({ id: customSkills.id }).from(customSkills).where(eq(customSkills.user_id, userId)))),
    db.selectDistinct({ gang_id: fighters.gang_id }).from(fighters)
      .where(inArray(fighters.captured_by_gang_id,
        db.select({ id: gangs.id }).from(gangs).where(eq(gangs.user_id, userId)))),
    db.selectDistinct({ id: liveBattleParticipants.live_battle_id }).from(liveBattleParticipants)
      .where(eq(liveBattleParticipants.user_id, userId)),
    db.select({ id: liveBattles.id }).from(liveBattles).where(eq(liveBattles.created_by, userId)),
  ]);

  const gangIds = new Set([...typeGangs, ...equipmentGangs, ...skillGangs, ...captiveGangs].flatMap(({ gang_id }) => (gang_id ? [gang_id] : [])));
  const liveBattleIds = new Set([...participantLiveBattles, ...hostedLiveBattles].map(({ id }) => id));
  return { gangIds: [...gangIds], liveBattleIds: [...liveBattleIds] };
}
