'use client';

import { lazy, Suspense, type Ref } from 'react';
import type { RichTextEditorHandle, RichTextEditorProps } from '@/components/ui/rich-text-editor';

// TipTap loads with the editor, not with the page that hosts it.
const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((mod) => ({ default: mod.RichTextEditor }))
);

type LazyRichTextEditorProps = RichTextEditorProps & {
  editorRef?: Ref<RichTextEditorHandle>;
  /** Current HTML shown in the loading frame so the layout does not jump. */
  fallbackHtml?: string;
};

function RichTextEditorSkeleton({ fallbackHtml }: { fallbackHtml?: string }) {
  return (
    <div className="border rounded-md min-h-[200px]">
      {/* Below 769px the toolbar sits at the top of the screen, so no toolbar strip. */}
      <div className="hidden min-[769px]:block border-b rounded-t-md p-1 bg-card shadow-xs">
        <div className="h-8" />
      </div>
      {fallbackHtml !== undefined && (
        <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
      )}
    </div>
  );
}

export function LazyRichTextEditor({
  editorRef,
  fallbackHtml,
  ...props
}: LazyRichTextEditorProps) {
  return (
    <Suspense fallback={<RichTextEditorSkeleton fallbackHtml={fallbackHtml} />}>
      <RichTextEditor ref={editorRef} {...props} />
    </Suspense>
  );
}
