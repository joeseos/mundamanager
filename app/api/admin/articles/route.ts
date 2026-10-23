import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkEditor, getAuthenticatedUser } from '@/utils/auth';
import { invalidateArticles } from '@/utils/cache-tags';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';
import { ARTICLE_SLUG_RE } from '@/app/lib/articles';

const STORAGE_BUCKET = 'site-images';

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  published_at: string | null;
  article_drafts: { title: string; summary: string | null; content: string } | null;
};

const ARTICLE_COLUMNS = 'id, slug, title, summary, content, published_at, article_drafts (title, summary, content)';

async function getEditor() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase).catch(() => null);
  if (!user || !(await checkEditor(supabase, user))) return null;
  return { supabase, user };
}

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

/**
 * Without id: every article, newest first, with its saved draft title.
 * With ?id=: one article's draft (or live version when there is no draft) plus
 * the live content, which the editor keeps images for until it is replaced.
 */
export async function GET(request: NextRequest) {
  const editor = await getEditor();
  if (!editor) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');

  try {
    if (!id) {
      const { data, error } = await editor.supabase
        .from('articles')
        .select('id, slug, title, published_at, article_drafts (title)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      return NextResponse.json(
        ((data ?? []) as unknown as Pick<ArticleRow, 'id' | 'slug' | 'title' | 'published_at' | 'article_drafts'>[]).map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.article_drafts?.title ?? row.title,
          published_at: row.published_at,
          has_draft: row.article_drafts !== null,
        }))
      );
    }

    const { data, error } = await editor.supabase
      .from('articles')
      .select(ARTICLE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const row = data as unknown as ArticleRow;
    const draft = row.article_drafts;
    return NextResponse.json({
      id: row.id,
      slug: row.slug,
      title: draft?.title ?? row.title,
      summary: draft ? draft.summary : row.summary,
      content: draft?.content ?? row.content,
      published_content: row.content,
      published_at: row.published_at,
      has_draft: draft !== null,
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
  }
}

/**
 * Save an article without publishing it. Body: { id, slug, title, summary, content }.
 * Creates the article on its first save. The changes go to article_drafts, so a
 * published article stays as it is until it is published again.
 */
export async function PUT(request: Request) {
  const editor = await getEditor();
  if (!editor) return unauthorized();
  const { supabase, user } = editor;

  const body = await request.json();
  const id = typeof body.id === 'string' ? body.id : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : null;

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!ARTICLE_SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'Slug must be lowercase letters and numbers separated by single hyphens' },
      { status: 400 }
    );
  }
  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }
  const content = isHtmlEffectivelyEmpty(body.content) ? '' : body.content;
  const now = new Date().toISOString();

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('articles')
      .select('slug, published_at')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;

    if (existing?.published_at && existing.slug !== slug) {
      return NextResponse.json(
        { error: 'The slug of a published article cannot change' },
        { status: 400 }
      );
    }

    // The live row only changes here for a new article or a new slug; the rest waits for Publish.
    const { error: articleError } = !existing
      ? await supabase
          .from('articles')
          .insert({ id, slug, title, author_id: user.id, updated_by: user.id })
      : existing.slug !== slug
        ? await supabase.from('articles').update({ slug }).eq('id', id)
        : { error: null };
    if (articleError) {
      if (articleError.code === '23505') {
        return NextResponse.json({ error: 'Another article already uses this slug' }, { status: 409 });
      }
      throw articleError;
    }

    const { error: draftError } = await supabase
      .from('article_drafts')
      .upsert({ article_id: id, title, summary, content, updated_at: now, updated_by: user.id });
    if (draftError) throw draftError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving article:', error);
    return NextResponse.json({ error: 'Failed to save article' }, { status: 500 });
  }
}

/** Publish or unpublish. Body: { id, action: 'publish' | 'unpublish' }. */
export async function PATCH(request: Request) {
  const editor = await getEditor();
  if (!editor) return unauthorized();
  const { supabase, user } = editor;

  const body = await request.json();
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id || (body.action !== 'publish' && body.action !== 'unpublish')) {
    return NextResponse.json({ error: 'id and action (publish or unpublish) are required' }, { status: 400 });
  }
  const now = new Date().toISOString();

  try {
    if (body.action === 'unpublish') {
      const { error } = await supabase
        .from('articles')
        .update({ published_at: null, updated_at: now, updated_by: user.id })
        .eq('id', id);
      if (error) throw error;
    } else {
      const { data, error: fetchError } = await supabase
        .from('articles')
        .select('published_at, article_drafts (title, summary, content, updated_at)')
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

      const draft = (data as unknown as {
        article_drafts: (NonNullable<ArticleRow['article_drafts']> & { updated_at: string }) | null;
      }).article_drafts;
      const { error } = await supabase
        .from('articles')
        .update({
          ...(draft ? { title: draft.title, summary: draft.summary, content: draft.content } : {}),
          published_at: data.published_at ?? now,
          updated_at: now,
          updated_by: user.id,
        })
        .eq('id', id);
      if (error) throw error;

      if (draft) {
        // Only the draft that was published: a newer save stays as unpublished changes.
        // The article is live either way, so a failed delete only leaves a stale draft.
        const { error: deleteError } = await supabase
          .from('article_drafts')
          .delete()
          .eq('article_id', id)
          .eq('updated_at', draft.updated_at);
        if (deleteError) console.error('Error deleting published article draft:', deleteError);
      }
    }

    invalidateArticles();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error publishing article:', error);
    return NextResponse.json({ error: `Failed to ${body.action} article` }, { status: 500 });
  }
}

/** Delete an article, its draft and its images. */
export async function DELETE(request: NextRequest) {
  const editor = await getEditor();
  if (!editor) return unauthorized();
  const { supabase } = editor;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) throw error;

    const folders = [`articles/${id}`, `articles/${id}/_draft`];
    const listings = await Promise.all(
      folders.map((folder) => supabase.storage.from(STORAGE_BUCKET).list(folder, { limit: 1000 }))
    );
    const paths = listings.flatMap(({ data }, i) =>
      (data ?? []).filter((file) => file.id !== null).map((file) => `${folders[i]}/${file.name}`)
    );
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      if (storageError) console.error('Error deleting article images:', storageError);
    }

    invalidateArticles();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting article:', error);
    return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
  }
}
