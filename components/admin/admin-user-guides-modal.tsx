'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import type { RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { LazyRichTextEditor } from '@/components/ui/lazy-rich-text-editor';
import { EditionSelect, editionSlugOf, useEditions } from '@/components/edition-select';
import {
  EDITION_N23,
  EDITION_N26,
  type EditionSlug,
} from '@/types/edition';
import { toast } from 'sonner';

interface AdminUserGuidesModalProps {
  onClose: () => void;
}

type GuideContent = Record<EditionSlug, string>;

const EMPTY_GUIDES: GuideContent = { [EDITION_N23]: '', [EDITION_N26]: '' };

function isGuideEditionSlug(value: string | null | undefined): value is EditionSlug {
  return value === EDITION_N23 || value === EDITION_N26;
}

function guidesFromResponse(data: unknown): GuideContent {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    [EDITION_N23]: typeof row[EDITION_N23] === 'string' ? row[EDITION_N23] : '',
    [EDITION_N26]: typeof row[EDITION_N26] === 'string' ? row[EDITION_N26] : '',
  };
}

async function fetchGuides(): Promise<GuideContent> {
  const response = await fetch('/api/admin/user-guides');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to load user guides');
  }
  return guidesFromResponse(data);
}

function editionLabel(slug: EditionSlug): string {
  return slug === EDITION_N23 ? 'N23' : 'N26';
}

export function AdminUserGuidesModal({ onClose }: AdminUserGuidesModalProps) {
  const { data: editions = [] } = useEditions();
  const [editionId, setEditionId] = useState('');
  const activeSlugRaw = editionSlugOf(editions, editionId);
  const activeSlug = isGuideEditionSlug(activeSlugRaw) ? activeSlugRaw : null;

  const queryClient = useQueryClient();
  // Server snapshot for every edition (so switching editions does not refetch).
  // gcTime 0 reads it fresh on each open, as the draft is seeded from it.
  const { data: saved = null, error: loadError, refetch } = useQuery({
    queryKey: ['admin-user-guides'],
    queryFn: fetchGuides,
    gcTime: 0,
  });
  // Draft for the edition currently being edited only.
  const [draft, setDraft] = useState('');
  // When set, a discard-confirm modal is open for switching to this edition id.
  const [pendingEditionId, setPendingEditionId] = useState<string | null>(null);

  const editorRef = useRef<RichTextEditorHandle | null>(null);

  // Seed the draft whenever the snapshot changes (first load, or after a save)
  const [seededFrom, setSeededFrom] = useState<GuideContent | null>(null);
  if (saved !== seededFrom) {
    setSeededFrom(saved);
    if (saved && activeSlug) setDraft(saved[activeSlug]);
  }

  const hasChanges =
    saved !== null && activeSlug !== null && draft !== saved[activeSlug];

  const switchEdition = (newEditionId: string) => {
    // Drop any staged uploads / unsaved edits for the edition we are leaving.
    void editorRef.current?.discardAssets();
    setEditionId(newEditionId);
    setPendingEditionId(null);
    const slug = editionSlugOf(editions, newEditionId);
    if (isGuideEditionSlug(slug) && saved) {
      setDraft(saved[slug]);
    } else {
      setDraft('');
    }
  };

  const handleEditionChange = (newEditionId: string) => {
    if (newEditionId === editionId) return;
    if (hasChanges) {
      setPendingEditionId(newEditionId);
      return;
    }
    switchEdition(newEditionId);
  };

  const handleClose = () => {
    void editorRef.current?.discardAssets();
    onClose();
  };

  const handleSave = async () => {
    if (!saved || !activeSlug) return false;

    const label = editionLabel(activeSlug);

    try {
      const finalHtml =
        (await editorRef.current?.finalizeAssets(draft)) ?? draft;

      if (finalHtml !== draft) {
        setDraft(finalHtml);
        editorRef.current?.setContent(finalHtml);
      }

      if (finalHtml === saved[activeSlug]) {
        toast.success('No changes to save');
        return true;
      }

      const response = await fetch('/api/admin/user-guides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editionSlug: activeSlug, content: finalHtml }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to save the ${label} user guide`);
      }

      queryClient.setQueryData<GuideContent>(['admin-user-guides'], (prev) => ({ ...(prev ?? EMPTY_GUIDES), [activeSlug]: finalHtml }));
      toast.success(`${label} user guide updated`);
      return true;
    } catch (error) {
      console.error('Failed to save user guide:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save user guide');
      // Show what the server holds now, unless that read fails too
      const { data: guides, isError } = await refetch();
      if (!isError && guides && activeSlug) {
        setDraft(guides[activeSlug]);
        editorRef.current?.setContent(guides[activeSlug]);
      }
      return false;
    }
  };

  return (
    <Modal
      title="User Guides"
      helper="Edit the user guide shown at /user-guide for one edition at a time. The table of contents is generated from the headings."
      onClose={handleClose}
      onConfirm={handleSave}
      confirmText="Save"
      confirmDisabled={saved === null || !activeSlug || !hasChanges}
      width="4xl"
    >
      <div className="space-y-4">
        <EditionSelect
          value={editionId}
          onChange={handleEditionChange}
          defaultToCurrent
        />

        {loadError && saved === null ? (
          <p className="text-red-500 text-sm">{loadError.message}</p>
        ) : saved === null || !activeSlug ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {saved === null ? 'Loading user guides...' : 'Select an edition to edit.'}
          </p>
        ) : (
          <div key={activeSlug} className="bg-white rounded-md">
            <LazyRichTextEditor
              editorRef={editorRef}
              fallbackHtml={saved[activeSlug]}
              content={saved[activeSlug]}
              onChange={setDraft}
              placeholder={`Write the ${editionLabel(activeSlug)} user guide here...`}
              className="min-h-[400px]"
              enableImages={true}
              storageBucket="site-images"
              storageBasePath={`user-guide/${activeSlug}`}
              filePrefix="guide"
              maxImages={null}
              stickyWithinScrollContainer
            />
          </div>
        )}
      </div>

      {pendingEditionId !== null && (
        <Modal
          title="Unsaved Changes"
          content={
            <p className="text-muted-foreground">
              You have unsaved changes. Discard them and switch edition?
            </p>
          }
          onClose={() => setPendingEditionId(null)}
          onConfirm={() => {
            switchEdition(pendingEditionId);
          }}
          confirmText="Discard"
          width="sm"
        />
      )}
    </Modal>
  );
}
