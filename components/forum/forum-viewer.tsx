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
 * Only for the user in the Supabase session cookie (chunked as .0, .1 when long),
 * so a signed-out viewer or another account sees no one else's saved state.
 */
function unreadBootScript(categoryId: string, page: number) {
  return `(function(){try{var session=document.cookie.split("; ").filter(function(c){return /^sb-[^=]*-auth-token(?:\\.\\d+)?=/.test(c);}).sort().map(function(c){return c.slice(c.indexOf("=")+1);}).join("");if(!session)return;session=session.indexOf("base64-")===0?atob(session.slice(7).replace(/-/g,"+").replace(/_/g,"/")):decodeURIComponent(session);var userId=JSON.parse(session).user.id;var cache=JSON.parse(localStorage.getItem(${JSON.stringify(PERSISTED_QUERY_STORAGE_KEY)}));if(!cache||Date.now()-cache.timestamp>${PERSISTED_QUERY_MAX_AGE})return;var query=cache.clientState.queries.filter(function(q){var k=q.queryKey;return k[0]==="forum-unread-threads"&&k[1]===userId&&k[2]===${JSON.stringify(categoryId)}&&k[3]===${page};})[0];if(!query||!query.state.data.length)return;var style=document.createElement("style");style.id=${JSON.stringify(UNREAD_BOOT_STYLE_ID)};style.textContent=query.state.data.map(function(n){return 'a[data-forum-thread="'+n+'"]';}).join(",")+"{font-weight:700}";document.head.appendChild(style);}catch(_){}})();`;
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
    const removeBootStyle = () => document.getElementById(UNREAD_BOOT_STYLE_ID)?.remove();
    if (settled) removeBootStyle();
    // Also when the page is left first, so the style can't reach the next list
    return removeBootStyle;
  }, [settled]);
  return (
    <ForumUnreadThreadsContext.Provider value={data ?? []}>
      <script
        suppressHydrationWarning
        {...clientScriptProps}
        dangerouslySetInnerHTML={{ __html: unreadBootScript(categoryId, page) }}
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
