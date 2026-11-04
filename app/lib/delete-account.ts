import { eq, inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import {
  battleSessionParticipants,
  battleSessions,
  customEquipment,
  customFighterTypes,
  customSkills,
  fighterEquipment,
  fighterSkills,
  fighters,
} from '@/utils/db/schema';

/**
 * What else an account delete changes through the cascades, read before the
 * delete so their caches can be busted after: other players' gangs that use
 * the user's custom fighter types, equipment or skills, and the battle
 * sessions the user hosted or played in.
 */
export async function getAccountDeleteCacheTargets(userId: string) {
  const db = getAppDb();
  const [typeGangs, equipmentGangs, skillGangs, participantSessions, hostedSessions] = await Promise.all([
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
    db.selectDistinct({ id: battleSessionParticipants.battle_session_id }).from(battleSessionParticipants)
      .where(eq(battleSessionParticipants.user_id, userId)),
    db.select({ id: battleSessions.id }).from(battleSessions).where(eq(battleSessions.created_by, userId)),
  ]);

  const gangIds = new Set([...typeGangs, ...equipmentGangs, ...skillGangs].flatMap(({ gang_id }) => (gang_id ? [gang_id] : [])));
  const battleSessionIds = new Set([...participantSessions, ...hostedSessions].map(({ id }) => id));
  return { gangIds: [...gangIds], battleSessionIds: [...battleSessionIds] };
}
