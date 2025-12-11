'use client';

import { useQuery } from '@tanstack/react-query';
import type { UserPermissions } from '@/types/user-permissions';

const fetcher = async (url: string): Promise<UserPermissions> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch permissions');
  }
  return res.json();
};

interface UsePermissionsOptions {
  enabled?: boolean;
}

export function usePermissions(
  type: 'gang' | 'fighter',
  id: string,
  options: UsePermissionsOptions = {}
) {
  const { enabled = true } = options;

  const { data, error, isLoading } = useQuery<UserPermissions>({
    queryKey: ['permissions', type, id],
    queryFn: () => fetcher(`/api/permissions/${type}/${id}`),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    permissions: data,
    isLoading,
    error
  };
}
