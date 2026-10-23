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
  draft_title: string | null;
  draft_summary: string | null;
  draft_content: string | null;
};

const ARTICLE_COLUMNS = 'id, slug, title, summary, content, published_at, draft_title, draft_summary, draft_content';

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
        .select('id, slug, title, published_at, draft_title')
        .order('created_at', { ascending: false });
      if (error) throw error;

      return NextResponse.json(
        (data ?? []).map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.draft_title ?? row.title,
          published_at: row.published_at,
          has_draft: row.draft_title !== null,
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

    const row = data as ArticleRow;
    const hasDraft = row.draft_title !== null;
    return NextResponse.json({
      id: row.id,
      slug: row.slug,
      title: row.draft_title ?? row.title,
      summary: hasDraft ? row.draft_summary : row.summary,
      content: row.draft_content ?? row.content,
      published_content: row.content,
      published_at: row.published_at,
      has_draft: hasDraft,
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
  }
}

/**
 * Save an article without publishing it. Body: { id, slug, title, summary, content }.
 * Creates the article on its first save. The changes go to the draft_* columns,
 * so a published article stays as it is until it is published again.
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

    // Only the slug changes the live version here (a new article needs a title too); the rest waits for Publish.
    const draft = {
      slug,
      draft_title: title,
      draft_summary: summary,
      draft_content: content,
      updated_at: now,
      updated_by: user.id,
    };
    const { error } = existing
      ? await supabase.from('articles').update(draft).eq('id', id)
      : await supabase.from('articles').insert({ ...draft, id, title, author_id: user.id });
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Another article already uses this slug' }, { status: 409 });
      }
      throw error;
    }

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
      const { data: row, error: fetchError } = await supabase
        .from('articles')
        .select('published_at, updated_at, draft_title, draft_summary, draft_content')
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!row) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

      // Only if nothing was saved since the read, so a newer save is never cleared unpublished.
      const { data: published, error } = await supabase
        .from('articles')
        .update({
          ...(row.draft_title !== null
            ? {
                title: row.draft_title,
                summary: row.draft_summary,
                content: row.draft_content ?? '',
                draft_title: null,
                draft_summary: null,
                draft_content: null,
              }
            : {}),
          published_at: row.published_at ?? now,
          updated_at: now,
          updated_by: user.id,
        })
        .eq('id', id)
        .filter('updated_at', row.updated_at === null ? 'is' : 'eq', row.updated_at)
        .select('id');
      if (error) throw error;
      if (published.length === 0) {
        return NextResponse.json({ error: 'The article changed while publishing. Try again.' }, { status: 409 });
      }
    }

    invalidateArticles();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error publishing article:', error);
    return NextResponse.json({ error: `Failed to ${body.action} article` }, { status: 500 });
  }
}

/** Delete an article and its images. */
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
