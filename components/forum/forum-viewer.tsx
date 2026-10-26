'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClaims } from '@/hooks/use-claims';
import { isForumModeratorRole } from '@/utils/auth';
import {
  type ForumThreadViewerData,
  getForumThreadViewer,
  getForumUnreadThreads,
  markForumThreadRead,
} from '@/app/actions/forum';

interface ForumViewer {
  /** null while loading and when signed out. */
  userId: string | null;
  /** Only decides what to show: RLS and the forum triggers enforce it. */
  isModerator: boolean;
  loading: boolean;
}

const ForumViewerContext = createContext<ForumViewer>({ userId: null, isModerator: false, loading: true });

/** Reads the signed-in user once for all the forum's client components on a page. */
export function ForumViewerProvider({ children }: { children: ReactNode }) {
  const { userId, profile, loading } = useClaims();
  const isModerator = isForumModeratorRole(profile?.user_role);
  return (
    <ForumViewerContext.Provider value={{ userId, isModerator, loading }}>
      {children}
    </ForumViewerContext.Provider>
  );
}

export const useForumViewer = () => useContext(ForumViewerContext);

interface ForumThreadViewer {
  isAuthor: boolean;
  /** Empty while it loads and when signed out. */
  data?: ForumThreadViewerData | null;
  /** Shows the viewer's like, or its removal, on the post. */
  setLiked: (postId: string, liked: boolean) => void;
  /** Loads it again after a change to the thread's article suggestion. */
  reload: () => Promise<void>;
}

const ForumThreadViewerContext = createContext<ForumThreadViewer>({
  isAuthor: false,
  setLiked: () => {},
  reload: async () => {},
});

/** What a thread page shows only to the signed-in viewer, loaded in the browser so the page itself is static. */
export function ForumThreadViewerProvider({
  threadNumber,
  page,
  authorId,
  children,
}: {
  threadNumber: number;
  page: number;
  authorId: string | null;
  children: ReactNode;
}) {
  const { userId } = useForumViewer();
  const queryClient = useQueryClient();
  const queryKey = ['forum-thread-viewer', userId, threadNumber, page];
  const { data } = useQuery({
    queryKey,
    queryFn: () => getForumThreadViewer({ threadNumber, page }),
    enabled: userId !== null,
  });

  const setLiked = (postId: string, liked: boolean) =>
    queryClient.setQueryData<ForumThreadViewerData | null>(queryKey, (viewer) => {
      const likes = viewer?.likes[postId];
      if (!likes || likes.liked === liked) return viewer;
      return { ...viewer, likes: { ...viewer.likes, [postId]: { liked, count: likes.count + (liked ? 1 : -1) } } };
    });

  return (
    <ForumThreadViewerContext.Provider
      value={{
        isAuthor: userId !== null && userId === authorId,
        data,
        setLiked,
        reload: () => queryClient.invalidateQueries({ queryKey }),
      }}
    >
      {children}
    </ForumThreadViewerContext.Provider>
  );
}

export const useForumThreadViewer = () => useContext(ForumThreadViewerContext);

const ForumUnreadThreadsContext = createContext<number[]>([]);

/**
 * The last post the viewer is known to have read in each thread, by thread
 * number, kept in the browser so a thread list shows its bold titles at once
 * and the server's answer only corrects it.
 */
const READ_THREADS_KEY = 'forum-read-threads';

function storedReadThreads(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_THREADS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function storeReadThreads(update: (read: Record<number, string>) => void) {
  const read = storedReadThreads();
  update(read);
  try {
    localStorage.setItem(READ_THREADS_KEY, JSON.stringify(read));
  } catch {
    // Storage full or blocked: the list just waits for the server
  }
}

const noSubscribe = () => () => {};

/** Which of a category page's threads the signed-in viewer hasn't read, loaded in the browser so the page itself is static. */
export function ForumUnreadThreadsProvider({
  threads,
  children,
}: {
  threads: { number: number; last_post_at: string }[];
  children: ReactNode;
}) {
  const { userId, loading } = useForumViewer();
  const { data } = useQuery({
    // With each thread's last post, so a new post loads it again
    queryKey: ['forum-unread-threads', userId, threads],
    queryFn: async () => {
      const unread = await getForumUnreadThreads(threads.map((thread) => thread.number));
      storeReadThreads((read) => {
        for (const thread of threads) {
          if (unread.includes(thread.number)) delete read[thread.number];
          else read[thread.number] = thread.last_post_at;
        }
      });
      return unread;
    },
    enabled: userId !== null,
  });

  // Until the server answers: unread unless read up to the post the list shows. Null while hydrating.
  const stored = useSyncExternalStore(noSubscribe, () => localStorage.getItem(READ_THREADS_KEY), () => null);
  const guess = useMemo(() => {
    if (!stored || (!loading && userId === null)) return [];
    const read = storedReadThreads();
    return threads.filter((thread) => read[thread.number] !== thread.last_post_at).map((thread) => thread.number);
  }, [stored, loading, userId, threads]);

  return <ForumUnreadThreadsContext.Provider value={data ?? guess}>{children}</ForumUnreadThreadsContext.Provider>;
}

/** A thread's title in the category list, in bold while it has posts the viewer hasn't read. */
export function ForumThreadTitleLink({ number, href, title }: { number: number; href: string; title: string }) {
  const unread = useContext(ForumUnreadThreadsContext).includes(number);
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${unread ? 'font-bold' : 'font-medium'} truncate group-hover:text-red-800 transition-colors after:absolute after:inset-0`}
    >
      {title}
    </Link>
  );
}

/**
 * Marks the thread read for the signed-in viewer, up to the last post the page shows.
 * Rendered on its last page, so reading page 1 leaves later posts unread.
 */
export function ForumMarkThreadRead({
  threadId,
  threadNumber,
  lastPostAt,
}: {
  threadId: string;
  threadNumber: number;
  lastPostAt: string;
}) {
  const { userId } = useForumViewer();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    storeReadThreads((read) => {
      read[threadNumber] = lastPostAt;
    });
    markForumThreadRead({ threadId, lastPostAt }).then(() =>
      queryClient.invalidateQueries({ queryKey: ['forum-unread-threads'] }),
    );
  }, [userId, threadId, threadNumber, lastPostAt, queryClient]);
  return null;
}
