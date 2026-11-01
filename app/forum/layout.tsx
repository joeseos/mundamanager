import type { ReactNode } from 'react';
import { ForumViewerProvider } from '@/components/forum/forum-viewer';

export default function ForumLayout({ children }: { children: ReactNode }) {
  return <ForumViewerProvider>{children}</ForumViewerProvider>;
}
