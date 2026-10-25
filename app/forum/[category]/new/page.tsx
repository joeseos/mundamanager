import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getForumCategory } from '@/app/lib/forum';
import { forumCategoryPath } from '@/utils/forum';
import { ForumNewThreadForm } from '@/components/forum/forum-new-thread';
import '@/components/ui/rich-text-editor.css';

interface NewForumThreadPageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: NewForumThreadPageProps): Promise<Metadata> {
  const category = await getForumCategory((await params).category);
  if (!category) return {};
  return { title: `New thread - ${category.name} - Munda Manager` };
}

// Signed-out visitors don't get here: the proxy sends them to sign in first.
export default async function NewForumThreadPage({ params }: NewForumThreadPageProps) {
  const category = await getForumCategory((await params).category);
  if (!category) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl font-bold mb-4">New thread in {category.name}</h1>
        <ForumNewThreadForm category={category} categoryPath={forumCategoryPath(category.slug)} />
      </div>
    </main>
  );
}
