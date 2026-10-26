'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClaims } from '@/hooks/use-claims';
import { PERSISTED_QUERY_MAX_AGE } from '@/app/providers/query-client-provider';
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

/** Which of a category page's threads the signed-in viewer hasn't read, loaded in the browser so the page itself is static. */
export function ForumUnreadThreadsProvider({
  categoryId,
  page,
  threads,
  children,
}: {
  categoryId: string;
  page: number;
  threads: { number: number; last_post_at: string }[];
  children: ReactNode;
}) {
  const { userId } = useForumViewer();
  const { data } = useQuery({
    queryKey: ['forum-unread-threads', userId, categoryId, page],
    queryFn: () => getForumUnreadThreads(threads.map((thread) => thread.number)),
    enabled: userId !== null,
    // Shows the last answer saved in this browser at once and asks the server on every visit
    meta: { persist: true },
    staleTime: 0,
    gcTime: PERSISTED_QUERY_MAX_AGE,
  });
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
      // Lists already loaded show it read at once, then ask the server for the real state
      queryClient.setQueriesData<number[]>({ queryKey: ['forum-unread-threads'] }, (unread) =>
        unread?.filter((number) => number !== threadNumber),
      );
      return queryClient.invalidateQueries({ queryKey: ['forum-unread-threads'] });
    });
  }, [userId, threadId, threadNumber, lastPostAt, queryClient]);
  return null;
}
