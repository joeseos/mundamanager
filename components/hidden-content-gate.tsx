'use client';

import { useRouter } from 'next/navigation';
import { useClientAuth } from '@/hooks/useClientAuth';
import { usePermissions } from '@/hooks/usePermissions';
import type { UserPermissions } from '@/types/user-permissions';

interface HiddenContentGateProps {
  type: 'gang' | 'fighter';
  id: string;
  children: (props: { userId: string; permissions: UserPermissions }) => React.ReactNode;
  loadingComponent?: React.ReactNode;
}

export default function HiddenContentGate({
  type,
  id,
  children,
  loadingComponent = <div className="p-8 text-center">Loading...</div>
}: HiddenContentGateProps) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useClientAuth();

  const { permissions, isLoading: isPermissionsLoading } = usePermissions(
    type,
    id,
    { enabled: !!user }
  );

  if (isAuthLoading || isPermissionsLoading) {
    return <>{loadingComponent}</>;
  }

  if (!user) {
    router.push('/sign-in');
    return null;
  }

  const canView = permissions?.isOwner || permissions?.isAdmin || permissions?.canEdit;

  if (!canView) {
    router.push('/');
    return null;
  }

  return <>{children({ userId: user.id, permissions: permissions! })}</>;
}
