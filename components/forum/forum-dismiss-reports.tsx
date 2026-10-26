'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dismissForumPostReports } from '@/app/actions/forum';

/** Clears a post's reports when a moderator decides the post can stay. */
export function ForumDismissReportsButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const dismiss = async () => {
    setSaving(true);
    const result = await dismissForumPostReports(postId);
    if (result.success) router.refresh();
    else toast.error(result.error);
    setSaving(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={dismiss} disabled={saving}>
      Dismiss
    </Button>
  );
}
