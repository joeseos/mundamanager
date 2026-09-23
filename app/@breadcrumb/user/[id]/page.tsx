import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { createClient } from '@/utils/supabase/server'
import { getUserProfile } from "@/app/lib/shared/gang-data"

interface UserBreadcrumbProps {
  params: Promise<{ id: string }>
}

export default async function UserBreadcrumb({ params }: UserBreadcrumbProps) {
  const { id } = await params;
  
  // Reads the cached profile entry instead of an uncached query
  const supabase = await createClient();
  const profile = await getUserProfile(id, supabase).catch(() => null);

  const username = profile?.username || 'Unknown User';

  return <BreadcrumbBar items={[{ label: 'User Profile' }, { label: username }]} />
}
