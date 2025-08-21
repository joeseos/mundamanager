import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { fightersApi } from '@/lib/api/fighters';
import { queryKeys } from './keys';

export const useGetFighter = (
  fighterId: string, 
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.detail(fighterId),
    queryFn: () => fightersApi.getBasic(fighterId),
    enabled: !!fighterId,
    ...options // Allow initialData and other options to be passed
  });
};

export const useGetFighterEquipment = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.equipment(fighterId),
    queryFn: () => fightersApi.getEquipment(fighterId),
    enabled: !!fighterId,
    staleTime: 1000 * 60 * 2, // 2 minutes (equipment changes frequently)
    ...options
  });
};

export const useGetFighterSkills = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.skills(fighterId),
    queryFn: () => fightersApi.getSkills(fighterId),
    enabled: !!fighterId,
    ...options
  });
};

export const useGetFighterEffects = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.effects(fighterId),
    queryFn: () => fightersApi.getEffects(fighterId),
    enabled: !!fighterId,
    ...options
  });
};

export const useGetFighterVehicles = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.vehicles(fighterId),
    queryFn: () => fightersApi.getVehicles(fighterId),
    enabled: !!fighterId,
    ...options
  });
};

export const useGetFighterTotalCost = (
  fighterId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.totalCost(fighterId),
    queryFn: () => fightersApi.getTotalCost(fighterId),
    enabled: !!fighterId,
    ...options
  });
};

// Additional fighter queries for full page data
export const useGetFighterType = (
  fighterTypeId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.reference.fighterTypes(fighterTypeId),
    queryFn: () => fightersApi.getFighterType(fighterTypeId),
    enabled: !!fighterTypeId && fighterTypeId !== 'placeholder',
    staleTime: 1000 * 60 * 60, // 1 hour (reference data changes rarely)
    ...options
  });
};

export const useGetFighterSubType = (
  fighterSubTypeId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: [...queryKeys.reference.fighterTypes(), 'sub-type', fighterSubTypeId],
    queryFn: () => fightersApi.getFighterSubType(fighterSubTypeId),
    enabled: !!fighterSubTypeId && fighterSubTypeId !== 'placeholder',
    staleTime: 1000 * 60 * 60, // 1 hour (reference data changes rarely)
    ...options
  });
};

export const useGetFighterCampaigns = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: [...queryKeys.fighters.detail(fighterId), 'campaigns'],
    queryFn: () => fightersApi.getCampaigns(fighterId),
    enabled: !!fighterId,
    staleTime: 1000 * 60 * 10, // 10 minutes
    ...options
  });
};

export const useGetFighterOwnedBeasts = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.beastCosts(fighterId),
    queryFn: () => fightersApi.getOwnedBeasts(fighterId),
    enabled: !!fighterId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  });
};

export const useGetFighterOwnerName = (
  fighterPetId: string,
  options?: Partial<UseQueryOptions<string, Error, string, readonly string[]>>
) => {
  return useQuery({
    queryKey: ['fighter-owner-name', fighterPetId],
    queryFn: () => fightersApi.getOwnerName(fighterPetId),
    enabled: !!fighterPetId && fighterPetId !== 'placeholder',
    staleTime: 1000 * 60 * 10, // 10 minutes
    ...options
  });
};

// Fighter Types Query
export const useGetFighterTypes = (
  gangId: string,
  gangTypeId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: ['fighter-types', gangId, gangTypeId],
    queryFn: async () => {
      const params = new URLSearchParams({
        gang_id: gangId,
        gang_type_id: gangTypeId,
        is_gang_addition: 'false'
      });
      
      const response = await fetch(`/api/fighter-types?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch fighter types');
      }
      
      return response.json();
    },
    enabled: !!gangId && !!gangTypeId,
    staleTime: 1000 * 60 * 30, // 30 minutes (reference data)
    ...options
  });
};

// Gang Legacies Query
export const useGetGangLegacies = (
  gangId: string,
  gangTypeId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly string[]>>
) => {
  return useQuery({
    queryKey: ['gang-legacies', gangId, gangTypeId],
    queryFn: async () => {
      const params = new URLSearchParams({
        gang_id: gangId,
        gang_type_id: gangTypeId,
        is_gang_addition: 'false'
      });
      
      const response = await fetch(`/api/fighter-types?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch legacies');
      }
      
      const data = await response.json();
      
      // Extract available legacies from the first fighter type
      if (data.length > 0 && data[0].available_legacies) {
        return data[0].available_legacies;
      }
      
      return [];
    },
    enabled: !!gangId && !!gangTypeId,
    staleTime: 1000 * 60 * 30, // 30 minutes (reference data)
    ...options
  });
};