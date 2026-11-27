'use client';

import { createContext, useContext, useEffect, useLayoutEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClaims } from '@/hooks/use-claims';
import { PERSISTED_QUERY_MAX_AGE, PERSISTED_QUERY_STORAGE_KEY } from '@/app/providers/query-client-provider';
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

const UNREAD_BOOT_STYLE_ID = 'forum-unread-boot';

// As in client-theme-provider: React 19 won't run a component's <script> on the
// client and warns when it creates one, so the client renders it as data
const clientScriptProps = typeof window === 'undefined' ? {} : { type: 'application/json' as const };

/**
 * Runs from the static HTML before first paint: bolds the titles this browser last
 * saw unread, from the page's query in the saved query cache, until the query settles.
 * Only for the user in the Supabase session cookie, so a signed-out viewer or another
 * account sees no one else's saved state. Inlined with toString, so it uses only its arguments.
 */
function bootUnreadStyle(
  storageKey: string,
  maxAge: number,
  styleId: string,
  categoryId: string,
  page: number,
  threadNumbers: number[],
) {
  try {
    // The session cookie, whole or in chunks .0, .1, ... (as @supabase/ssr reads it)
    let whole = '';
    const chunks: string[] = [];
    for (const cookie of document.cookie.split('; ')) {
      const match = /^sb-[^=]*-auth-token(?:\.(\d+))?=(.*)$/.exec(cookie);
      if (match && match[1] === undefined) whole = match[2];
      else if (match) chunks[Number(match[1])] = match[2];
    }
    let session = whole || chunks.join('');
    if (!session) return;
    session = session.startsWith('base64-')
      ? atob(session.slice(7).replace(/-/g, '+').replace(/_/g, '/'))
      : decodeURIComponent(session);
    const userId = JSON.parse(session).user.id;

    const cache = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!cache || Date.now() - cache.timestamp > maxAge) return;
    const query = cache.clientState.queries.find(({ queryKey: key }: { queryKey: unknown[] }) =>
      key[0] === 'forum-unread-threads' && key[1] === userId && key[2] === categoryId && key[3] === page,
    );
    const unread = ((query?.state.data ?? []) as number[]).filter((number) => threadNumbers.includes(number));
    if (!unread.length) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `${unread.map((number) => `a[data-forum-thread="${number}"]`).join(',')}{font-weight:700}`;
    document.head.appendChild(style);
  } catch {
    // Leaves the titles to the query
  }
}

/**
 * Which of a category page's threads the signed-in viewer hasn't read, loaded in the
 * browser so the page itself is static. The boot script shows the saved answer until then.
 */
export function ForumUnreadThreadsProvider({
  categoryId,
  page,
  threadNumbers,
  children,
}: {
  categoryId: string;
  page: number;
  threadNumbers: number[];
  children: ReactNode;
}) {
  const { userId, loading } = useForumViewer();
  const { data, isError } = useQuery({
    queryKey: ['forum-unread-threads', userId, categoryId, page],
    queryFn: () => getForumUnreadThreads(threadNumbers),
    enabled: userId !== null,
    // Shows the last answer saved in this browser at once and asks the server on every visit
    meta: { persist: true },
    staleTime: 0,
    gcTime: PERSISTED_QUERY_MAX_AGE,
  });
  // Before paint, so the titles go from the boot style to their own classes in one frame
  const settled = data !== undefined || isError || (!loading && userId === null);
  useLayoutEffect(() => {
    if (settled) document.getElementById(UNREAD_BOOT_STYLE_ID)?.remove();
  }, [settled]);
  // Escaped, as the arguments go inside a <script> tag
  const bootArgs = JSON.stringify([
    PERSISTED_QUERY_STORAGE_KEY,
    PERSISTED_QUERY_MAX_AGE,
    UNREAD_BOOT_STYLE_ID,
    categoryId,
    page,
    threadNumbers,
  ]).replace(/</g, '\\u003c');
  return (
    <ForumUnreadThreadsContext.Provider value={data ?? []}>
      <script
        suppressHydrationWarning
        {...clientScriptProps}
        dangerouslySetInnerHTML={{ __html: `(${bootUnreadStyle})(...${bootArgs})` }}
      />
      {children}
    </ForumUnreadThreadsContext.Provider>
  );
}

/** A thread's title in the category list, in bold while it has posts the viewer hasn't read. */
export function ForumThreadTitleLink({ number, href, title }: { number: number; href: string; title: string }) {
  const unread = useContext(ForumUnreadThreadsContext).includes(number);
  return (
    <Link
      href={href}
      prefetch={false}
      data-forum-thread={number}
      className={`${unread ? 'font-bold' : 'font-medium'} min-w-0 truncate group-hover:text-red-800 transition-colors after:absolute after:inset-0`}
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
