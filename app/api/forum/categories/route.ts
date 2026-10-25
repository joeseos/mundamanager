import { NextResponse } from 'next/server';
import { getForumCategories } from '@/app/lib/forum';

// DATABASE_URL only exists at runtime, so the build can't read the forum
export const dynamic = 'force-dynamic';

/** The forum's categories, for the home page's Forum tab. Public, like /forum. */
export async function GET() {
  try {
    return NextResponse.json(await getForumCategories());
  } catch (error) {
    console.error('Failed to load the forum categories', error);
    return NextResponse.json({ error: 'Failed to load the forum' }, { status: 500 });
  }
}
