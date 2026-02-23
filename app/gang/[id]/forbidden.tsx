import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GangForbidden() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center max-w-lg mx-auto px-4">
      <h1 className="text-2xl font-semibold text-white">Restricted Record</h1>
      <p className="text-white/90 leading-relaxed italic">
        &ldquo;This gang operates in the deep shadows of the Underhive. Their
        movements are known only to those who walk alongside them. Turn back,
        stranger — there is nothing for you here.&rdquo;
      </p>
      <p className="text-white/70 text-sm leading-relaxed">
        This gang has been set to <strong>private</strong> by its owner. Only
        the gang&apos;s owner and campaign arbitrators can view it.
      </p>
      <Button asChild>
        <Link href="/">Return to the Homepage</Link>
      </Button>
    </div>
  );
}
