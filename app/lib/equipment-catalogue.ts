import 'server-only';

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import type { EquipmentCatalogueCore, EquipmentCatalogueGangType } from '@/types/equipment-catalogue';

/**
 * Serves the Equipment modal's catalogue snapshot at
 * /api/equipment/catalogue?version=&edition_id=[&gang_type_id=].
 *
 * A file never changes once built for a version, so the browser may keep it for good. The
 * version is in the URL, and a request for any other version is redirected, uncached, to the
 * current one. Each version is built once (Next data cache) whoever asks first.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d{1,18}$/;

const IMMUTABLE = 'private, max-age=31536000, immutable';
const NO_STORE = 'no-store';

/** The catalogue changed between the version check and the build. */
class CatalogueVersionMoved extends Error {
  constructor(readonly current: number) {
    super(`Catalogue version moved to ${current}`);
  }
}

type CatalogueFile = EquipmentCatalogueCore | EquipmentCatalogueGangType;

async function getCurrentCatalogueVersion(): Promise<number> {
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
const getCatalogueFile = unstable_cache(
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
  const params = new URLSearchParams({ version: String(version), edition_id: edition });
  if (gangType) params.set('gang_type_id', gangType);
  return `/api/equipment/catalogue?${params}`;
}

function redirectToVersion(requestUrl: string, version: number, edition: string, gangType: string | null) {
  const response = NextResponse.redirect(new URL(catalogueUrl(version, edition, gangType), requestUrl), 307);
  response.headers.set('Cache-Control', NO_STORE);
  return response;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': NO_STORE } });
}

export async function serveEquipmentCatalogue(
  requestUrl: string,
  params: { version: string; edition: string; gangType: string | null }
): Promise<NextResponse> {
  const { version, edition, gangType } = params;

  // Signed-in users only, as the catalogue tables are.
  const userId = await getUserIdFromClaims(await createClient());
  if (!userId) {
    return errorResponse('Unauthorized', 401);
  }

  if (!VERSION.test(version) || !UUID.test(edition) || (gangType !== null && !UUID.test(gangType))) {
    return errorResponse('Not found', 404);
  }

  try {
    const current = await getCurrentCatalogueVersion();
    if (Number(version) !== current) {
      return redirectToVersion(requestUrl, current, edition, gangType);
    }

    const file = await getCatalogueFile(current, edition.toLowerCase(), gangType?.toLowerCase() ?? null);
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
