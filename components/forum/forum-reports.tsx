'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { dismissForumPostReports, reportForumPost } from '@/app/actions/forum';

/** Asks before reporting a post, or a thread through its opening post, to the moderators. */
export function ForumReportDialog({
  target,
  title,
  question,
  onClose,
}: {
  target: Parameters<typeof reportForumPost>[0];
  title: string;
  question: string;
  onClose: () => void;
}) {
  const report = async () => {
    try {
      const result = await reportForumPost(target);
      if (!result.success) throw new Error(result.error);
      toast.success('Reported to the moderators');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to report');
      return false;
    }
  };

  return <Modal title={title} content={<p>{question}</p>} onClose={onClose} onConfirm={report} confirmText="Report" />;
}

/** Clears a post's reports when a moderator decides the post can stay. */
export function ForumDismissReportsButton({ postId, reportedUntil }: { postId: string; reportedUntil: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const dismiss = async () => {
    setSaving(true);
    try {
      const result = await dismissForumPostReports({ postId, reportedUntil });
      if (!result.success) throw new Error(result.error);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to dismiss the reports');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={dismiss} disabled={saving}>
      Dismiss
    </Button>
  );
}
