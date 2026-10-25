import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { getForumArticle, getForumPosts, getForumThread, parseForumThreadNumber } from '@/app/lib/forum';
import { formatForumDate, formatForumReplies, forumArticlePath, forumThreadPath } from '@/utils/forum';
import '@/components/ui/rich-text-editor.css';

interface ArticlePageProps {
  params: Promise<{ article: string }>;
}

async function findArticle(segment: string) {
  const number = parseForumThreadNumber(segment);
  return number === null ? null : getForumArticle(number);
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const article = await findArticle((await params).article);
  if (!article) return {};
  return {
    title: `${article.title} - Articles - Munda Manager`,
    description: article.excerpt,
    openGraph: article.image ? { images: [article.image] } : undefined,
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { article: segment } = await params;
  const article = await findArticle(segment);
  if (!article) notFound();

  // A renamed thread keeps its number, so old links land on the current URL
  const path = forumArticlePath(article.number, article.title);
  if (path !== `/articles/${segment}`) redirect(path);

  const thread = await getForumThread(article.number);
  if (!thread) notFound();
  const [post] = await getForumPosts(thread, 1);
  const threadPath = forumThreadPath(thread.category.slug, thread.number, thread.title);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <article className="w-full bg-card shadow-md rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{article.category.name}</p>
        <h1 className="text-2xl md:text-3xl font-bold break-words">{article.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
          <UserAvatar username={article.author} avatarUrl={article.author_avatar_url} className="size-8 text-xs" />
          <span>
            {post?.author_id && article.author ? (
              <Link href={`/user/${post.author_id}`} prefetch={false} className="font-semibold text-foreground hover:text-red-800 transition-colors">
                {article.author}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">Unknown User</span>
            )}
            {' '}· {formatForumDate(article.published_at)}
          </span>
        </div>

        {post && (
          <div
            className="forum-post prose max-w-none mt-4 [&_li]:marker:text-red-800"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-6 border-t pt-4">
          <p className="flex-1 text-sm text-muted-foreground">{formatForumReplies(thread.post_count)} in the forum</p>
          <Button asChild size="sm">
            <Link href={threadPath} prefetch={false}>Discuss in the forum</Link>
          </Button>
        </div>
      </article>
    </main>
  );
}
