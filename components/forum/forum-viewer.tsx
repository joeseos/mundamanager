'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useClaims } from '@/hooks/use-claims';
import { isForumModeratorRole } from '@/utils/auth';

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
