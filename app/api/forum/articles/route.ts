import { NextResponse } from 'next/server';
import { getForumArticles } from '@/app/lib/forum';

// DATABASE_URL only exists at runtime, so the build can't read the articles
export const dynamic = 'force-dynamic';

const LATEST_ARTICLES = 6;

/** The newest articles, for the home page's Articles tab. Public, like /articles. */
export async function GET() {
  try {
    return NextResponse.json((await getForumArticles()).slice(0, LATEST_ARTICLES));
  } catch (error) {
    console.error('Failed to load the articles', error);
    return NextResponse.json({ error: 'Failed to load the articles' }, { status: 500 });
  }
}
