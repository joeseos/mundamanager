import Link from 'next/link';
import { LuMessageSquare, LuNewspaper } from 'react-icons/lu';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ForumTagChips } from '@/components/forum/forum-tag-chips';
import { formatForumDate, formatForumReplies, forumArticlePath, forumReplyCount, type ForumArticle } from '@/app/lib/forum';

interface ForumArticleCardProps {
  article: ForumArticle;
  /** The hero at the top of the articles page: image beside the text from sm up. */
  featured?: boolean;
}

/** An article's card: its first image, category, title, opening text, tags, author and replies. */
export function ForumArticleCard({ article, featured = false }: ForumArticleCardProps) {
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card ${featured ? 'sm:flex-row' : ''}`}
    >
      <div className={`aspect-video shrink-0 bg-muted ${featured ? 'sm:w-3/5' : ''}`}>
        {article.image ? (
          // Posts can show images from any https host, so not next/image
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.image} alt="" loading={featured ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <LuNewspaper className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
          {featured && 'Featured · '}
          {article.category.name}
        </p>
        {/* Stretched over the whole card, so the card opens the article */}
        <Link
          href={forumArticlePath(article.number, article.title)}
          prefetch={false}
          className={`font-bold line-clamp-2 group-hover:text-red-800 transition-colors after:absolute after:inset-0 ${featured ? 'text-xl md:text-2xl' : 'text-base'}`}
        >
          {article.title}
        </Link>
        <p className={`text-sm text-muted-foreground ${featured ? 'line-clamp-4' : 'line-clamp-2'}`}>{article.excerpt}</p>
        <ForumTagChips tags={article.tags} className="mt-1" />
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <UserAvatar username={article.author} avatarUrl={article.author_avatar_url} className="size-6 text-[10px]" />
          <span className="min-w-0 flex-1 truncate">
            {article.author ?? 'Unknown User'} · {formatForumDate(article.published_at)}
          </span>
          <span className="flex items-center gap-1 shrink-0" title={formatForumReplies(article.post_count)}>
            <LuMessageSquare className="h-3.5 w-3.5" />
            {forumReplyCount(article.post_count)}
          </span>
        </div>
      </div>
    </article>
  );
}
