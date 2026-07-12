import { getGangFightersBundle } from '@/app/lib/shared/gang-data';

/**
 * Get gang fighters (id/name/status columns) — selector over the shared
 * gang fighters bundle, so it reads the same cache entry as the gang page
 * instead of maintaining a duplicate copy of the gang's fighter list.
 */
export const getGangFighters = async (gangId: string, supabase: any) => {
  const bundle = await getGangFightersBundle(gangId, supabase);
  return bundle.fighters.map((f: any) => ({
    id: f.id,
    fighter_name: f.fighter_name,
    fighter_type: f.fighter_type,
    xp: f.xp,
    killed: f.killed,
    retired: f.retired,
    enslaved: f.enslaved,
    starved: f.starved,
    recovery: f.recovery,
    captured: f.captured
  }));
};
