import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getClaims, isForumModeratorRole } from '@/utils/auth';
import {
  formatForumDate,
  forumPostHref,
  forumThreadPath,
  getForumArticleQueue,
  getForumReports,
} from '@/app/lib/forum';
import { ForumDismissReportsButton } from '@/components/forum/forum-reports';

export const metadata: Metadata = {
  title: 'Moderation - Forum - Munda Manager',
};

/** Moderators only: reported posts and article suggestions, each handled on the thread itself. */
export default async function ForumModerationPage() {
  const claims = await createClient().then(getClaims);
  if (!claims || !isForumModeratorRole(claims.profile?.user_role)) notFound();

  const [reports, suggestions] = await Promise.all([
    getForumReports(claims.userId),
    getForumArticleQueue(claims.userId),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-2xl font-bold mb-4">Reported posts</h1>
          <ul className="divide-y">
            {reports.length ? (
              reports.map((report) => (
                <li key={report.post_id} className="py-2 first:pt-0 last:pb-0 flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={forumPostHref(
                        forumThreadPath(report.category_slug, report.thread_number, report.thread_title),
                        report.post_number
                      )}
                      prefetch={false}
                      className="font-semibold hover:text-red-800 transition-colors"
                    >
                      {report.thread_title}
                    </Link>
                    <p className="text-muted-foreground">
                      {report.post_number === 1 ? 'Thread' : `Post #${report.post_number}`} by{' '}
                      {report.author ?? 'Unknown User'} · reported by {report.reporters.join(', ')}, last{' '}
                      {formatForumDate(report.last_reported_at)}
                    </p>
                  </div>
                  <ForumDismissReportsButton postId={report.post_id} reportedUntil={report.last_reported_at} />
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground italic">Nothing has been reported.</li>
            )}
          </ul>
        </div>

        <div className="bg-card shadow-md rounded-lg p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Article suggestions</h2>
          <ul className="divide-y">
            {suggestions.length ? (
              suggestions.map((item) => (
                <li key={item.number} className="py-2 first:pt-0 last:pb-0 text-sm">
                  <Link
                    href={forumThreadPath(item.category_slug, item.number, item.title)}
                    prefetch={false}
                    className="font-semibold hover:text-red-800 transition-colors"
                  >
                    {item.title}
                  </Link>
                  <p className="text-muted-foreground">
                    {item.author ?? 'Unknown User'} · submitted {formatForumDate(item.submitted_at)}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground italic">Nothing is awaiting review.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}
