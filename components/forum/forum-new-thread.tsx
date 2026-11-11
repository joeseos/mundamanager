'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LuPlus } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { ForumTagPicker } from '@/components/forum/forum-tag-picker';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { createForumThread } from '@/app/actions/forum';
import type { ForumTag } from '@/app/lib/forum';

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

export function ForumNewThreadForm({ category, categoryPath, tags }: ForumNewThreadProps & { tags: ForumTag[] }) {
  const router = useRouter();
  const { loading, isModerator } = useForumViewer();
  const [tagIds, setTagIds] = useState<string[]>([]);
  if (loading) return null;

  if (category.moderators_only && !isModerator) {
    return <p className="text-muted-foreground">Only moderators can start threads in {category.name}.</p>;
  }

  return (
    <ForumPostForm
      initialTitle=""
      placeholder="Write the opening post..."
      submitText="Post thread"
      onSubmit={({ title, content }) => createForumThread({ categoryId: category.id, title, content, tagIds })}
      onCancel={() => router.push(categoryPath)}
    >
      <ForumTagPicker tags={tags} selected={tagIds} onChange={setTagIds} />
    </ForumPostForm>
  );
}
