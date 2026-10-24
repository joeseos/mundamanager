'use client';

import { useRef, useState, useTransition, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LazyRichTextEditor } from '@/components/ui/lazy-rich-text-editor';
import type { RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { useForumViewer } from '@/components/forum/forum-viewer';
import type { ForumActionResult } from '@/app/actions/forum';

interface ForumPostFormProps {
  /** Shows a title field: starting a thread, or editing its opening post. */
  initialTitle?: string;
  initialContent?: string;
  placeholder: string;
  submitText: string;
  onSubmit: (values: { title: string; content: string }) => Promise<ForumActionResult>;
  /** Its state changes land with the refreshed page, so the old post doesn't flash back. */
  onSuccess?: () => void;
  onCancel?: () => void;
  /** Lets the parent add to the post, e.g. a quote. */
  editorRef?: RefObject<RichTextEditorHandle | null>;
}

export function ForumPostForm({
  initialTitle,
  initialContent = '',
  placeholder,
  submitText,
  onSubmit,
  onSuccess,
  onCancel,
  editorRef: parentEditorRef,
}: ForumPostFormProps) {
  const router = useRouter();
  const { userId } = useForumViewer();
  const ownEditorRef = useRef<RichTextEditorHandle | null>(null);
  const editorRef = parentEditorRef ?? ownEditorRef;
  const [title, setTitle] = useState(initialTitle ?? '');
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  // A new image folder for each form: saving deletes the folder's images that
  // aren't in the post, which would take other posts' images (and the ones
  // edit history still points at) if posts shared a folder.
  const [imageFolder] = useState(() => crypto.randomUUID());

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const finalHtml = (await editorRef.current?.finalizeAssets(content)) ?? content;
      if (finalHtml !== content) {
        setContent(finalHtml);
        editorRef.current?.setContent(finalHtml);
      }

      const result = await onSubmit({ title, content: finalHtml });
      if (!result.success) throw new Error(result.error);
      // Stays disabled while the page changes, so the post can't be sent twice
      startTransition(() => {
        router.push(result.path!);
        onSuccess?.();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the post');
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    void editorRef.current?.discardAssets();
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {initialTitle !== undefined && (
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          aria-label="Title"
          required
        />
      )}
      <div className="bg-white rounded-md">
        <LazyRichTextEditor
          editorRef={editorRef}
          fallbackHtml={content}
          content={content}
          onChange={setContent}
          placeholder={placeholder}
          className="min-h-[200px]"
          enableImages
          storageBasePath={userId ? `forum/${userId}/${imageFolder}` : undefined}
          filePrefix="post"
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitText}
        </Button>
      </div>
    </form>
  );
}
