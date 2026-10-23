'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { slugifyHeading } from '@/utils/user-guide-content';
import { toast } from 'sonner';

interface AdminArticlesModalProps {
  onClose: () => void;
}

interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  has_draft: boolean;
}

interface ArticleFields {
  slug: string;
  title: string;
  summary: string;
  content: string;
}

interface OpenArticle {
  id: string;
  isNew: boolean;
  saved: ArticleFields;
  publishedContent: string;
  publishedAt: string | null;
  hasDraft: boolean;
}

const ARTICLES_KEY = ['admin-articles'];

const EMPTY_FIELDS: ArticleFields = { slug: '', title: '', summary: '', content: '' };

function statusLabel(publishedAt: string | null, hasDraft: boolean) {
  if (!publishedAt) return 'Draft';
  return hasDraft ? 'Unpublished changes' : 'Published';
}

function StatusBadge({ publishedAt, hasDraft }: { publishedAt: string | null; hasDraft: boolean }) {
  return (
    <Badge variant={publishedAt && !hasDraft ? 'default' : 'secondary'}>
      {statusLabel(publishedAt, hasDraft)}
    </Badge>
  );
}

async function requestJson(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export function AdminArticlesModal({ onClose }: AdminArticlesModalProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<OpenArticle | null>(null);

  const { data: articles, error: loadError } = useQuery<ArticleListItem[]>({
    queryKey: ARTICLES_KEY,
    queryFn: () => requestJson('/api/admin/articles'),
  });

  const handleAdd = () => {
    setOpen({
      id: crypto.randomUUID(),
      isNew: true,
      saved: EMPTY_FIELDS,
      publishedContent: '',
      publishedAt: null,
      hasDraft: false,
    });
  };

  const handleEdit = async (id: string) => {
    try {
      const data = await requestJson(`/api/admin/articles?id=${id}`);
      setOpen({
        id,
        isNew: false,
        saved: {
          slug: data.slug,
          title: data.title,
          summary: data.summary ?? '',
          content: data.content,
        },
        publishedContent: data.published_content,
        publishedAt: data.published_at,
        hasDraft: data.has_draft,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load article');
    }
  };

  return (
    <Modal
      title="Articles"
      helper="Articles are shown at /articles. Save keeps your changes off the site until you publish them."
      onClose={onClose}
      width="2xl"
      headerContent={<Button onClick={handleAdd}>Add</Button>}
    >
      {loadError ? (
        <p className="text-red-500 text-sm">{loadError.message}</p>
      ) : !articles ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading articles...</p>
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No articles yet.</p>
      ) : (
        <ul className="divide-y">
          {articles.map((article) => (
            <li key={article.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{article.title}</p>
                <p className="text-xs text-muted-foreground truncate">/articles/{article.slug}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge publishedAt={article.published_at} hasDraft={article.has_draft} />
                <Button variant="outline" size="sm" onClick={() => void handleEdit(article.id)}>
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ArticleEditorModal
          key={open.id}
          article={open}
          onChange={setOpen}
          onClose={() => {
            setOpen(null);
            void queryClient.invalidateQueries({ queryKey: ARTICLES_KEY });
          }}
        />
      )}
    </Modal>
  );
}

interface ArticleEditorModalProps {
  article: OpenArticle;
  onChange: (article: OpenArticle) => void;
  onClose: () => void;
}

function ArticleEditorModal({ article, onChange, onClose }: ArticleEditorModalProps) {
  const [fields, setFields] = useState<ArticleFields>(article.saved);
  // A new article's slug follows its title until the slug is edited by hand.
  const [slugEdited, setSlugEdited] = useState(!article.isNew);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  // The editor's latest HTML, read after an async save.
  const contentRef = useRef(article.saved.content);

  const isPublished = article.publishedAt !== null;
  const hasChanges = (Object.keys(fields) as (keyof ArticleFields)[]).some(
    (key) => fields[key] !== article.saved[key]
  );
  const isValid = fields.title.trim() !== '' && fields.slug !== '';
  // Publishable when there is something not yet live: unsaved or saved changes, or an unpublished article.
  const canPublish =
    !isBusy && isValid && (hasChanges || article.hasDraft || (!isPublished && !article.isNew));

  const updateField = (key: keyof ArticleFields, value: string) => {
    if (key === 'content') contentRef.current = value;
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && !slugEdited) {
        next.slug = value.trim() ? slugifyHeading(value) : '';
      }
      return next;
    });
  };

  const closeEditor = () => {
    void editorRef.current?.discardAssets();
    onClose();
  };

  const handleClose = () => {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  };

  /** Save the draft. Returns the saved article state, or null when the save failed. */
  const save = async (): Promise<OpenArticle | null> => {
    if (!hasChanges) return article;

    try {
      const finalHtml =
        (await editorRef.current?.finalizeAssets(fields.content, article.publishedContent)) ?? fields.content;

      const savedFields = { ...fields, content: finalHtml };
      await requestJson('/api/admin/articles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, ...savedFields }),
      });

      // Promoted images have new URLs. Leave anything typed during the save alone.
      if (finalHtml !== fields.content && contentRef.current === fields.content) {
        contentRef.current = finalHtml;
        editorRef.current?.setContent(finalHtml);
        setFields((prev) => ({ ...prev, content: finalHtml }));
      }
      setSlugEdited(true);
      const saved = { ...article, isNew: false, saved: savedFields, hasDraft: true };
      onChange(saved);
      return saved;
    } catch (error) {
      console.error('Failed to save article:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save article');
      return null;
    }
  };

  const handleSave = async () => {
    setIsBusy(true);
    const saved = await save();
    setIsBusy(false);
    if (saved) toast.success('Article saved');
    // Stay open: saving is not the end of editing an article.
    return false;
  };

  const handlePublish = async () => {
    setIsBusy(true);
    try {
      const saved = await save();
      if (!saved) return;
      await requestJson('/api/admin/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, action: 'publish' }),
      });
      // The draft is now live, so images only the old version used can go.
      await editorRef.current?.finalizeAssets(saved.saved.content);
      onChange({
        ...saved,
        publishedContent: saved.saved.content,
        publishedAt: article.publishedAt ?? new Date().toISOString(),
        hasDraft: false,
      });
      toast.success('Article published');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish article');
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnpublish = async () => {
    setIsBusy(true);
    try {
      await requestJson('/api/admin/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, action: 'unpublish' }),
      });
      onChange({ ...article, publishedAt: null });
      toast.success('Article unpublished');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unpublish article');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    try {
      await requestJson(`/api/admin/articles?id=${article.id}`, { method: 'DELETE' });
      toast.success('Article deleted');
      onClose();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete article');
      return false;
    }
  };

  return (
    <Modal
      title={article.isNew ? 'Add Article' : 'Edit Article'}
      onClose={handleClose}
      onConfirm={handleSave}
      confirmText="Save"
      confirmDisabled={isBusy || !hasChanges || !isValid}
      onDelete={article.isNew ? undefined : () => setConfirmDelete(true)}
      deleteLabel="Delete"
      width="4xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge publishedAt={article.publishedAt} hasDraft={article.hasDraft} />
          <div className="flex gap-2">
            {isPublished && (
              <Button variant="outline" onClick={handleUnpublish} disabled={isBusy}>
                Unpublish
              </Button>
            )}
            <Button onClick={handlePublish} disabled={!canPublish}>
              Publish
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="article-title">Title</label>
          <Input
            id="article-title"
            value={fields.title}
            onChange={(e) => updateField('title', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="article-slug">URL</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">/articles/</span>
            <Input
              id="article-slug"
              value={fields.slug}
              disabled={isPublished}
              onChange={(e) => {
                setSlugEdited(true);
                updateField('slug', e.target.value.toLowerCase());
              }}
            />
          </div>
          {isPublished && (
            <p className="text-xs text-muted-foreground mt-1">
              The URL can&apos;t change while the article is published.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="article-summary">Summary</label>
          <Textarea
            id="article-summary"
            value={fields.summary}
            onChange={(e) => updateField('summary', e.target.value)}
            placeholder="Shown in the article list and in link previews"
          />
        </div>

        <div className="bg-white rounded-md">
          <RichTextEditor
            ref={editorRef}
            content={article.saved.content}
            onChange={(html) => updateField('content', html)}
            placeholder="Write the article here..."
            className="min-h-[400px]"
            enableImages={true}
            storageBucket="site-images"
            storageBasePath={`articles/${article.id}`}
            filePrefix="article"
            maxImages={null}
            stickyWithinScrollContainer
          />
        </div>
      </div>

      {confirmDiscard && (
        <Modal
          title="Unsaved Changes"
          content={
            <p className="text-muted-foreground">
              You have unsaved changes. Discard them and close?
            </p>
          }
          onClose={() => setConfirmDiscard(false)}
          onConfirm={closeEditor}
          confirmText="Discard"
          width="sm"
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete Article"
          content={
            <p className="text-muted-foreground">
              Delete &quot;{fields.title || 'this article'}&quot; and its images? This can&apos;t be undone.
            </p>
          }
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          confirmText="Delete"
          width="sm"
        />
      )}
    </Modal>
  );
}
