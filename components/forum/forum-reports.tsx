'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { dismissForumPostReports, reportForumPost } from '@/app/actions/forum';

// Same limits as reportForumPost
const REASON_MIN_LENGTH = 50;
const REASON_MAX_LENGTH = 500;

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
  const [reason, setReason] = useState('');
  // In characters, as the server counts them
  const reasonLength = [...reason.trim()].length;

  const report = async () => {
    try {
      const result = await reportForumPost(target, reason);
      if (!result.success) throw new Error(result.error);
      toast.success('Reported to the moderators');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to report');
      return false;
    }
  };

  return (
    <Modal
      title={title}
      content={
        <div className="space-y-2">
          <p>{question}</p>
          <label htmlFor="forum-report-reason" className="block text-sm font-medium text-muted-foreground">
            Why are you reporting it?
          </label>
          <Textarea
            id="forum-report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX_LENGTH}
            rows={3}
          />
          <p className="text-xs text-muted-foreground text-right">
            {reasonLength < REASON_MIN_LENGTH ? `${reasonLength}/${REASON_MIN_LENGTH} characters minimum` : `${reasonLength}/${REASON_MAX_LENGTH}`}
          </p>
        </div>
      }
      onClose={onClose}
      onConfirm={report}
      confirmText="Report"
      confirmDisabled={reasonLength < REASON_MIN_LENGTH}
    />
  );
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
