import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/app/lib/utils';

/** "Admin" or "Moderator" beside a username; nothing for other users. A span, so it can sit in a heading or a line of text. */
export function UserRoleBadge({ role, className }: { role: string | null; className?: string }) {
  if (role === 'admin') {
    return <span className={cn(badgeVariants({ variant: 'destructive' }), className)}>Admin</span>;
  }
  if (role === 'moderator') {
    return <span className={cn(badgeVariants(), 'bg-blue-700 hover:bg-blue-700/80', className)}>Moderator</span>;
  }
  return null;
}
