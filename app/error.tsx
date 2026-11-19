'use client';

import { Button } from '@/components/ui/button';

export default function Error({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
      <p className="text-white/80">This page couldn&apos;t be loaded. Please try again.</p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
