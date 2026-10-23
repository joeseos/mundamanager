'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LuPlus } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { createForumThread } from '@/app/actions/forum';

interface ForumNewThreadProps {
  category: { id: string; name: string; moderators_only: boolean };
  categoryPath: string;
}

/** The category page's link to the new thread form, hidden where only moderators post. */
export function ForumNewThreadButton({ category, categoryPath }: ForumNewThreadProps) {
  const { isModerator } = useForumViewer();
  if (category.moderators_only && !isModerator) return null;

  return (
    <Button asChild size="sm">
      <Link href={`${categoryPath}/new`} prefetch={false}>
        <LuPlus className="h-4 w-4 mr-1" /> New thread
      </Link>
    </Button>
  );
}

export function ForumNewThreadForm({ category, categoryPath }: ForumNewThreadProps) {
  const router = useRouter();
  const { loading, isModerator } = useForumViewer();
  if (loading) return null;

  if (category.moderators_only && !isModerator) {
    return <p className="text-muted-foreground">Only moderators can start threads in {category.name}.</p>;
  }

  return (
    <ForumPostForm
      initialTitle=""
      placeholder="Write the opening post..."
      submitText="Post thread"
      onSubmit={({ title, content }) => createForumThread({ categoryId: category.id, title, content })}
      onCancel={() => router.push(categoryPath)}
    />
  );
}
