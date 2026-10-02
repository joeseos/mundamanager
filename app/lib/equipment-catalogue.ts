import 'server-only';

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServiceRoleClient } from '@/utils/supabase/server';
import type { EquipmentCatalogueCore, EquipmentCatalogueGangType } from '@/types/equipment-catalogue';

/**
 * Serves the Equipment modal's catalogue snapshot at
 * /api/equipment/catalogue/{version}/{edition}[/{gangType}].
 *
 * A file never changes once built for a version, so the CDN and the browser may keep it for
 * good, and the route runs about once per file per version. It is official rules data, with
 * nothing about any user in it, so it is served to anyone. Everything that varies is in the
 * path, as some CDNs leave query strings out of their cache keys. A request for any other
 * version is redirected, uncached, to the current one.
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

/**
 * Built once per version, edition and gang type. Throws rather than return a file of another
 * version, because unstable_cache keeps whatever it is given.
 */
export const getCatalogueFile = unstable_cache(
  async (version: number, edition: string, gangType: string | null): Promise<CatalogueFile | null> => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('get_equipment_catalogue', {
      p_edition_id: edition,
      p_gang_type_id: gangType,
    });

    if (error) {
      throw new Error(`get_equipment_catalogue failed: ${error.message}`);
    }

    const row = (data as { version: number; data: CatalogueFile }[] | null)?.[0];
    if (!row) return null;
    if (Number(row.version) !== version) {
      throw new CatalogueVersionMoved(Number(row.version));
    }
    return row.data;
  },
  ['equipment-catalogue-v1'],
  { revalidate: false }
);

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
    const current = await getCurrentCatalogueVersion();
    if (Number(version) !== current) {
      return redirectToVersion(requestUrl, current, edition, gangType);
    }

    const file = await getCatalogueFile(current, edition, gangType);
    if (!file) {
      return errorResponse('Not found', 404);
    }

    return NextResponse.json(file, { headers: { 'Cache-Control': IMMUTABLE } });
  } catch (error) {
    if (error instanceof CatalogueVersionMoved) {
      return redirectToVersion(requestUrl, error.current, edition, gangType);
    }
    console.error('Error serving equipment catalogue:', error);
    return errorResponse('Error loading equipment catalogue', 500);
  }
}
