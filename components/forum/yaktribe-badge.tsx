import Image from 'next/image';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/app/lib/utils';

/**
 * Beside the name of a YakTribe member whose imported posts nobody has claimed yet. A span, like UserRoleBadge.
 * A fixed 16px pill 2px under the baseline sits centred on the name's capitals and on whole pixels. The keyword
 * alignments land on half pixels, where the browser rounds the logo and the text apart inside the pill.
 * The logo goes 1px up to line up with the text, whose capitals sit a little above the pill's middle.
 */
export function YakTribeBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeVariants({ variant: 'discreet' }), 'h-4 gap-1 px-1.5 py-0 align-[-2px] text-[10px] leading-none font-medium', className)}>
      <Image src="/images/yaktribe-logo.webp" alt="" width={14} height={14} className="-translate-y-px" />
      YakTribe
    </span>
  );
}
