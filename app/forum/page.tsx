import { Metadata } from 'next';
import { getForumCategories } from '@/app/lib/forum';
import { ForumCategoryList } from '@/components/forum/forum-category-list';

// Rendered per request: DATABASE_URL only exists at runtime, so the build can't
// read the forum. getForumCategories() is cached, so a request doesn't hit the database.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Forum - Munda Manager',
  description: 'Discuss Necromunda rules, gangs, miniatures and battles with the Munda Manager community.',
};

export default async function ForumPage() {
  const categories = await getForumCategories();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl font-bold mb-4">Forum</h1>

        <ForumCategoryList categories={categories} />
      </div>
    </main>
  );
}
