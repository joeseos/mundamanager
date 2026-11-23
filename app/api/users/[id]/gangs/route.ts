import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { isUuid } from '@/utils/uuid';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const supabase = await createClient();
  // The loader reads over the direct connection, which doesn't check who is asking
  if (!await getUserIdFromClaims(supabase)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await getUserGangs(id));
}
