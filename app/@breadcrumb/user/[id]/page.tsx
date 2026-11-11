import { BreadcrumbBar } from "@/components/breadcrumb-bar"
import { getUserProfile } from "@/app/lib/shared/gang-data"

interface UserBreadcrumbProps {
  params: Promise<{ id: string }>
}

export default async function UserBreadcrumb({ params }: UserBreadcrumbProps) {
  const { id } = await params;
  
  // Reads the cached profile entry instead of an uncached query
  const profile = await getUserProfile(id).catch(() => null);

  const username = profile?.username || 'Unknown User';

  return <BreadcrumbBar items={[{ label: 'User Profile' }, { label: username }]} />
}
