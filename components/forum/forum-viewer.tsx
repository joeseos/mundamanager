'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useClaims } from '@/hooks/use-claims';

interface ForumViewer {
  /** null while loading and when signed out. */
  userId: string | null;
  /** Only decides what to show: RLS and the forum triggers enforce it. */
  isModerator: boolean;
  /** Admins review articles. */
  isAdmin: boolean;
  loading: boolean;
}

const ForumViewerContext = createContext<ForumViewer>({ userId: null, isModerator: false, isAdmin: false, loading: true });

/** Reads the signed-in user once for all the forum's client components on a page. */
export function ForumViewerProvider({ children }: { children: ReactNode }) {
  const { userId, profile, loading } = useClaims();
  const isAdmin = profile?.user_role === 'admin';
  const isModerator = isAdmin || profile?.user_role === 'moderator';
  return (
    <ForumViewerContext.Provider value={{ userId, isModerator, isAdmin, loading }}>
      {children}
    </ForumViewerContext.Provider>
  );
}

export const useForumViewer = () => useContext(ForumViewerContext);
