'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClaims } from '@/hooks/use-claims';
import { isForumModeratorRole } from '@/utils/auth';
import { type ForumThreadViewerData, getForumThreadViewer } from '@/app/actions/forum';

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
  /** Records a like the viewer just saved. */
  setLiked: (postId: string, liked: boolean) => void;
  /** Loads it again after a change to the thread's article suggestion. */
  reload: () => void;
}

const ForumThreadViewerContext = createContext<ForumThreadViewer>({
  isAuthor: false,
  setLiked: () => {},
  reload: () => {},
});

/** What a thread page shows only to the signed-in viewer, loaded in the browser so the page itself is static. */
export function ForumThreadViewerProvider({
  threadId,
  authorId,
  postIds,
  children,
}: {
  threadId: string;
  authorId: string | null;
  /** The page's posts. */
  postIds: string[];
  children: ReactNode;
}) {
  const { userId } = useForumViewer();
  const queryClient = useQueryClient();
  const queryKey = ['forum-thread-viewer', userId, threadId, postIds];
  const { data } = useQuery({
    queryKey,
    queryFn: () => getForumThreadViewer({ threadId, postIds }),
    enabled: userId !== null,
  });

  const setLiked = (postId: string, liked: boolean) =>
    queryClient.setQueryData<ForumThreadViewerData | null>(queryKey, (viewer) =>
      viewer && {
        ...viewer,
        likedPostIds: liked ? [...viewer.likedPostIds, postId] : viewer.likedPostIds.filter((id) => id !== postId),
      },
    );

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
