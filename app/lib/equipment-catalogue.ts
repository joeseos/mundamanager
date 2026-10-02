import 'server-only';

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { buildCatalogueIndex, catalogueFilesFor, type CatalogueIndex } from '@/utils/equipment/resolve';
import type {
  EquipmentCatalogueCore,
  EquipmentCatalogueGangType,
  EquipmentOverlay,
} from '@/types/equipment-catalogue';

/**
 * Serves the Equipment modal's catalogue snapshot at
 * /api/equipment/catalogue/{version}/{edition}[/{gangType}].
 *
 * A file never changes once built for a version, so the CDN and the browser may keep it for
 * good, and the route runs about once per file per version. It is official rules data, with
 * nothing about any user in it, so it is served to anyone. Everything that varies is in the
 * path, as some CDNs leave query strings out of their cache keys. A request for any other
 * version is redirected, uncached, to the current one.
 *
 * The buy action reads the same files, and the gang's overlay, through getEquipmentOverlay and
 * loadCatalogueIndex, to resolve the listed price on the server.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d{1,18}$/;

const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const NO_STORE = 'no-store';

/** The catalogue changed between the version check and the build. */
export class CatalogueVersionMoved extends Error {
  constructor(readonly current: number) {
    super(`Catalogue version moved to ${current}`);
  }
}

/** No file exists for that edition and gang type. Thrown, not returned, so it is never cached. */
export class CatalogueFileNotFound extends Error {
  constructor() {
    super('Equipment catalogue file not found');
  }
}

export type CatalogueFile = EquipmentCatalogueCore | EquipmentCatalogueGangType;

export async function getCurrentCatalogueVersion(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('catalogue_version')
    .select('version')
    .single();

  if (error || !data) {
    throw new Error(`Failed to read catalogue_version: ${error?.message ?? 'no row'}`);
  }
  return Number(data.version);
}

const RECENT_VERSION_MS = 5000;
let recentVersion: { version: number; readAt: number } | null = null;

/**
 * The current version as read in the last few seconds by this server instance, so a burst of
 * uncached file requests reads the database once. It can trail the database by that long, so a
 * version above it (atLeast) is checked in the database: the overlay may have read it after a
 * change.
 */
async function getRecentCatalogueVersion(atLeast: number): Promise<number> {
  if (recentVersion && recentVersion.version >= atLeast && Date.now() - recentVersion.readAt < RECENT_VERSION_MS) {
    return recentVersion.version;
  }
  const version = await getCurrentCatalogueVersion();
  recentVersion = { version, readAt: Date.now() };
  return version;
}

/**
 * Built once per version, edition and gang type. Throws rather than return a file of another
 * version, or nothing for an unknown edition or gang type, because unstable_cache keeps
 * whatever it is given.
 */
export const getCatalogueFile = unstable_cache(
  async (version: number, edition: string, gangType: string | null): Promise<CatalogueFile> => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('get_equipment_catalogue', {
      p_edition_id: edition,
      p_gang_type_id: gangType,
    });

    if (error) {
      throw new Error(`get_equipment_catalogue failed: ${error.message}`);
    }

    const row = (data as { version: number; data: CatalogueFile }[] | null)?.[0];
    if (!row) throw new CatalogueFileNotFound();
    if (Number(row.version) !== version) {
      throw new CatalogueVersionMoved(Number(row.version));
    }
    return row.data;
  },
  ['equipment-catalogue-v1'],
  { revalidate: false }
);

/**
 * The gang's overlay, read with the caller's own client: get_equipment_overlay applies the same
 * permission check and finds the same custom equipment as when the modal reads it.
 */
export async function getEquipmentOverlay(
  supabase: SupabaseClient,
  gangId: string,
  fighterId: string | null
): Promise<EquipmentOverlay> {
  const { data, error } = await supabase.rpc('get_equipment_overlay', {
    p_gang_id: gangId,
    p_fighter_id: fighterId,
  });
  if (error || !data) {
    throw new Error(`get_equipment_overlay failed: ${error?.message ?? 'no data'}`);
  }
  return data as EquipmentOverlay;
}

/**
 * The catalogue index for the files an overlay names. Files of different versions cannot be
 * mixed, so if the catalogue changed after the overlay was read, every file moves to the newer
 * version, as in the modal.
 */
export async function loadCatalogueIndex(overlay: EquipmentOverlay): Promise<CatalogueIndex> {
  const { coreEditions, ruleFiles } = catalogueFilesFor(overlay);
  let version = overlay.version;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [cores, rules] = await Promise.all([
        Promise.all(coreEditions.map((edition) => getCatalogueFile(version, edition, null))),
        Promise.all(ruleFiles.map(([edition, gangType]) => getCatalogueFile(version, edition, gangType))),
      ]);
      return buildCatalogueIndex(cores as EquipmentCatalogueCore[], rules as EquipmentCatalogueGangType[]);
    } catch (error) {
      if (!(error instanceof CatalogueVersionMoved)) throw error;
      version = error.current;
    }
  }
  throw new Error('The equipment catalogue is being updated. Please try again.');
}

function catalogueUrl(version: number, edition: string, gangType: string | null): string {
  return `/api/equipment/catalogue/${version}/${edition}${gangType ? `/${gangType}` : ''}`;
}

function redirectToVersion(requestUrl: string, version: number, edition: string, gangType: string | null) {
  const response = NextResponse.redirect(new URL(catalogueUrl(version, edition, gangType), requestUrl), 307);
  response.headers.set('Cache-Control', NO_STORE);
  return response;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': NO_STORE } });
}

/** path: [version, edition] for a core file, [version, edition, gangType] for a gang type's file. */
export async function serveEquipmentCatalogue(requestUrl: string, path: string[]): Promise<NextResponse> {
  const [version = '', rawEdition = '', rawGangType = null, ...rest] = path;

  if (
    rest.length > 0 ||
    !VERSION_RE.test(version) ||
    !UUID_RE.test(rawEdition) ||
    (rawGangType !== null && !UUID_RE.test(rawGangType))
  ) {
    return errorResponse('Not found', 404);
  }

  const edition = rawEdition.toLowerCase();
  const gangType = rawGangType?.toLowerCase() ?? null;

  try {
    const requested = Number(version);
    const current = await getRecentCatalogueVersion(requested);
    if (requested !== current) {
      return redirectToVersion(requestUrl, current, edition, gangType);
    }

    const file = await getCatalogueFile(current, edition, gangType);
    return NextResponse.json(file, { headers: { 'Cache-Control': IMMUTABLE } });
  } catch (error) {
    if (error instanceof CatalogueVersionMoved) {
      return redirectToVersion(requestUrl, error.current, edition, gangType);
    }
    if (error instanceof CatalogueFileNotFound) {
      return errorResponse('Not found', 404);
    }
    console.error('Error serving equipment catalogue:', error);
    return errorResponse('Error loading equipment catalogue', 500);
  }
}
