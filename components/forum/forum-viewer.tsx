'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
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
  authorId,
  postIds,
  children,
}: {
  threadNumber: number;
  authorId: string | null;
  /** The page's posts. */
  postIds: string[];
  children: ReactNode;
}) {
  const { userId } = useForumViewer();
  const queryClient = useQueryClient();
  const queryKey = ['forum-thread-viewer', userId, threadNumber, postIds];
  const { data } = useQuery({
    queryKey,
    queryFn: () => getForumThreadViewer({ threadNumber, postIds }),
    enabled: userId !== null,
    // A reply adds a post to the page: the likes shown stay until the new ones load
    placeholderData: keepPreviousData,
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
