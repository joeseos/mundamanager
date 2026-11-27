import Image from 'next/image';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/app/lib/utils';

/**
 * Beside the name of a YakTribe member whose imported posts nobody has claimed yet. A span, like UserRoleBadge.
 * align-middle: the logo would otherwise set the pill's baseline and lift it above the text.
 */
export function YakTribeBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeVariants({ variant: 'discreet' }), 'gap-1 px-1.5 py-0 align-middle text-[10px] font-medium', className)}>
      <Image src="/images/yaktribe-logo.webp" alt="" width={14} height={14} />
      YakTribe
    </span>
  );
}
