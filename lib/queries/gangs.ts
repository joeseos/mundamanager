import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { gangsApi } from '@/lib/api/gangs';
import { queryKeys } from './keys';

export const useGetGang = (
  gangId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.detail(gangId),
    queryFn: () => gangsApi.getBasic(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    ...options
  });
};

export const useGetGangCredits = (
  gangId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.credits(gangId),
    queryFn: () => gangsApi.getCredits(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 1, // 1 minute (credits change frequently)
    ...options
  });
};

export const useGetGangPositioning = (
  gangId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.positioning(gangId),
    queryFn: () => gangsApi.getPositioning(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  });
};

export const useGetGangFighters = (
  gangId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.fighters(gangId),
    queryFn: () => gangsApi.getFighters(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  });
};