'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
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

// The last post the viewer is known to have read in each thread, by thread
// number, so a later visit can show the bold titles before the server answers
const readThreadsKey = (userId: string) => `forum-read-threads:${userId}`;
// Enough for every thread a page shows many times over, so the entry stays small
const READ_THREADS_LIMIT = 500;

type ReadThreads = Record<string, string>;

function loadReadThreads(userId: string): ReadThreads {
  try {
    const parsed = JSON.parse(localStorage.getItem(readThreadsKey(userId)) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveReadThreads(userId: string, update: (read: ReadThreads) => void) {
  const read = loadReadThreads(userId);
  update(read);
  // Keep the threads read most recently
  const kept = Object.entries(read)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .slice(0, READ_THREADS_LIMIT);
  try {
    localStorage.setItem(readThreadsKey(userId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage can be unavailable: the list then waits for the server
  }
}

const isReadUpTo = (read: ReadThreads, thread: { number: number; last_post_at: string }) =>
  read[thread.number] !== undefined && Date.parse(read[thread.number]) >= Date.parse(thread.last_post_at);

/** Which of a category page's threads the signed-in viewer hasn't read, loaded in the browser so the page itself is static. */
export function ForumUnreadThreadsProvider({
  threads,
  children,
}: {
  threads: { number: number; last_post_at: string }[];
  children: ReactNode;
}) {
  const { userId } = useForumViewer();
  const { data, isPlaceholderData } = useQuery({
    // With each thread's last post, so a new post loads it again
    queryKey: ['forum-unread-threads', userId, threads],
    queryFn: () => getForumUnreadThreads(threads.map((thread) => thread.number)),
    enabled: userId !== null,
    // What this browser last knew, shown until the server answers
    placeholderData: () => {
      if (!userId) return undefined;
      const read = loadReadThreads(userId);
      return threads.filter((thread) => !isReadUpTo(read, thread)).map((thread) => thread.number);
    },
  });

  useEffect(() => {
    if (!userId || !data || isPlaceholderData) return;
    saveReadThreads(userId, (read) => {
      for (const thread of threads) {
        if (data.includes(thread.number)) delete read[thread.number];
        else read[thread.number] = thread.last_post_at;
      }
    });
  }, [userId, data, isPlaceholderData, threads]);

  return <ForumUnreadThreadsContext.Provider value={data ?? []}>{children}</ForumUnreadThreadsContext.Provider>;
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
    markForumThreadRead({ threadId, lastPostAt }).then(() => {
      saveReadThreads(userId, (read) => {
        read[threadNumber] = lastPostAt;
      });
      // Lists already loaded this visit show it read at once
      queryClient.setQueriesData<number[]>({ queryKey: ['forum-unread-threads'] }, (unread) =>
        unread?.filter((number) => number !== threadNumber),
      );
    });
  }, [userId, threadId, threadNumber, lastPostAt, queryClient]);
  return null;
}
