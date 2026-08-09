/**
 * The roster fighter-type fetch shared by the edit and promotion modals.
 *
 * isVehicle is part of the key as well as the URL: all three call sites use the same
 * key, so a list fetched for one catalog would otherwise be served to the other.
 */
export function rosterFighterTypesQuery(opts: {
  gangId: string;
  gangTypeId?: string | null;
  customGangTypeId?: string | null;
  isVehicle: boolean;
}) {
  const params = new URLSearchParams({
    gang_id: opts.gangId,
    is_gang_addition: 'false',
    is_vehicle: String(opts.isVehicle),
  });
  if (opts.gangTypeId) params.set('gang_type_id', opts.gangTypeId);
  if (opts.customGangTypeId) params.set('custom_gang_type_id', opts.customGangTypeId);

  return {
    queryKey: [
      'fighter-types-edit',
      opts.gangId,
      opts.gangTypeId,
      opts.customGangTypeId,
      opts.isVehicle,
    ],
    queryFn: async () => {
      const response = await fetch(`/api/fighter-types?${params}`);
      if (!response.ok) throw new Error('Failed to fetch fighter types');
      return response.json();
    },
  };
}
