'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';

/** Marks notifications as read. The policies only let users update their own. */
export async function markNotificationsRead(ids: string[]) {
  const supabase = await createClient();
  await getAuthenticatedUser(supabase);

  const { error } = await supabase.from('notifications').update({ dismissed: true }).in('id', ids);
  if (error) throw new Error(error.message);
}
