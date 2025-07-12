'use client';

import dynamic from 'next/dynamic';

const Toaster = dynamic(
  () =>
    import('@/components/ui/toaster').then((mod) => ({ default: mod.Toaster })),
  { ssr: false }
);

export default function ClientToaster() {
  return <Toaster />;
}
