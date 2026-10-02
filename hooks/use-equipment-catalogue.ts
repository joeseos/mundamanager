'use client';

import { useMemo, useState } from 'react';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import {
  buildCatalogueIndex,
  catalogueFileUrl,
  catalogueFilesFor,
  type CatalogueIndex,
} from '@/utils/equipment/resolve';
import type {
  EquipmentCatalogueCore,
  EquipmentCatalogueGangType,
  EquipmentOverlay,
} from '@/types/equipment-catalogue';

/** A file came back for another version: the catalogue changed after the overlay was read. */
class CatalogueVersionMoved extends Error {
  constructor(readonly version: number) {
    super(`Equipment catalogue moved to version ${version}`);
  }
}

/** Stable, so React Query hands back the same arrays until a file changes. */
function combineFiles<T>(results: UseQueryResult<T, Error>[]) {
  return { data: results.map((r) => r.data), errors: results.map((r) => r.error) };
}
const combineCores = combineFiles<EquipmentCatalogueCore>;
const combineRuleFiles = combineFiles<EquipmentCatalogueGangType>;

/**
 * The Equipment modal's data: the gang's overlay, read fresh each time the modal opens, and
 * the catalogue snapshot files it names, which the browser and the CDN keep for good per
 * version.
 *
 * Files of different versions cannot be mixed (items are referred to by position), so a file
 * that comes back for a newer version, because the catalogue changed after the overlay was read,
 * moves every file to that version.
 */
export function useEquipmentCatalogue(gangId: string, fighterId: string | null) {
  const overlayQuery = useQuery({
    queryKey: ['equipment-overlay', gangId, fighterId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_equipment_overlay', {
        p_gang_id: gangId,
        p_fighter_id: fighterId,
      });
      if (error) throw new Error(error.message);
      return data as EquipmentOverlay;
    },
    // One call per opening of the modal: it carries the catalogue version.
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const overlay = overlayQuery.data;
  const [movedTo, setMovedTo] = useState<number | null>(null);
  const version = overlay ? Math.max(overlay.version, movedTo ?? 0) : null;
  const wanted = overlay ? catalogueFilesFor(overlay) : { coreEditions: [], ruleFiles: [] };

  const fileQuery = <T extends { version: number }>(edition: string, gangType: string | null) => ({
    queryKey: ['equipment-catalogue', version, edition, gangType],
    queryFn: async (): Promise<T> => {
      const response = await fetch(catalogueFileUrl(version!, edition, gangType));
      if (!response.ok) throw new Error(`Failed to load the equipment catalogue (${response.status})`);
      const file = (await response.json()) as T;
      if (file.version !== version) throw new CatalogueVersionMoved(file.version);
      return file;
    },
    enabled: version !== null,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount: number, error: Error) => !(error instanceof CatalogueVersionMoved) && failureCount < 1,
  });

  const cores = useQueries({
    queries: wanted.coreEditions.map((edition) => fileQuery<EquipmentCatalogueCore>(edition, null)),
    combine: combineCores,
  });
  const ruleFiles = useQueries({
    queries: wanted.ruleFiles.map(([edition, gangType]) => fileQuery<EquipmentCatalogueGangType>(edition, gangType)),
    combine: combineRuleFiles,
  });

  const errors = [...cores.errors, ...ruleFiles.errors];
  const moved = errors
    .map((e) => (e instanceof CatalogueVersionMoved ? e.version : null))
    .filter((v): v is number => v !== null);
  const newest = moved.length > 0 ? Math.max(...moved) : null;
  if (newest !== null && newest !== movedTo && (version === null || newest > version)) {
    setMovedTo(newest);
  }

  const ready = overlay !== undefined && cores.data.every(Boolean) && ruleFiles.data.every(Boolean);
  const index = useMemo<CatalogueIndex | null>(
    () =>
      ready
        ? buildCatalogueIndex(cores.data as EquipmentCatalogueCore[], ruleFiles.data as EquipmentCatalogueGangType[])
        : null,
    [ready, cores.data, ruleFiles.data]
  );

  const error = overlayQuery.error ?? errors.find((e) => e && !(e instanceof CatalogueVersionMoved)) ?? null;

  return { overlay: overlay ?? null, index, error };
}
