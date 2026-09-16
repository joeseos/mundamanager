import { NextResponse } from 'next/server';
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidHttpUrl } from '@/utils/http-url';
import { invalidateGangTypesCatalog } from '@/utils/cache-tags';

const GANG_TYPE_LIST_COLUMNS = 'gang_type_id, gang_type, edition_id';

const GANG_TYPE_COLUMNS =
  'gang_type_id, gang_type, alignment, is_hidden, affiliation, trading_post_type_id, gang_origin_category_id, parent_gang_type_id, default_image_urls, edition_id';

const ALLOWED_ALIGNMENTS = [
  'Law Abiding',
  'Outlaw',
  'Unaligned',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DefaultImagePayload = {
  url: string;
  credit?: { name?: string; url?: string; suffix?: string };
};

type GangTypePayload = {
  gang_type: string;
  edition_id: string;
  alignment: string | null;
  is_hidden: boolean;
  affiliation: boolean;
  trading_post_type_id: string | null;
  gang_origin_category_id: string | null;
  parent_gang_type_id: string | null;
  default_image_urls: DefaultImagePayload[] | null;
};

type GangTypePatch = {
  gang_type?: string;
  edition_id?: string;
  alignment?: string | null;
  is_hidden?: boolean;
  affiliation?: boolean;
  trading_post_type_id?: string | null;
  gang_origin_category_id?: string | null;
  parent_gang_type_id?: string | null;
  default_image_urls?: DefaultImagePayload[] | null;
};

type GangTypeRow = {
  gang_type_id: string;
  gang_type: string | null;
  alignment: string | null;
  is_hidden: boolean | null;
  affiliation: boolean | null;
  trading_post_type_id: string | null;
  gang_origin_category_id: string | null;
  parent_gang_type_id: string | null;
  default_image_urls: unknown;
  edition_id: string | null;
};

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function mutationErrorResponse(error: unknown, fallback: string): NextResponse {
  const code = postgresCode(error);
  if (code === '22P02') {
    return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function parseUuid(
  value: unknown,
  field: string
): { error: string } | { data: string | null } {
  const trimmed = emptyToNull(value);
  if (trimmed === null) return { data: null };
  if (!UUID_RE.test(trimmed)) {
    return { error: `${field} must be a valid UUID` };
  }
  return { data: trimmed };
}

function parseOptionalBoolean(
  value: unknown,
  field: string,
  defaultValue: boolean
): { error: string } | { data: boolean } {
  if (value === undefined || value === null) {
    return { data: defaultValue };
  }
  if (typeof value === 'boolean') {
    return { data: value };
  }
  return { error: `${field} must be a boolean` };
}

function parseBooleanField(
  value: unknown,
  field: string
): { error: string } | { data: boolean } {
  if (typeof value === 'boolean') {
    return { data: value };
  }
  return { error: `${field} must be a boolean` };
}

function parseAlignment(
  value: unknown
): { error: string } | { data: string | null } {
  const alignment = emptyToNull(value);
  if (alignment && !(ALLOWED_ALIGNMENTS as readonly string[]).includes(alignment)) {
    return { error: 'Invalid alignment' };
  }
  return { data: alignment };
}

function parseGangTypeName(
  value: unknown
): { error: string } | { data: string } {
  const gangType = emptyToNull(value);
  if (!gangType) {
    return { error: 'gang_type is required' };
  }
  if (gangType.length > 200) {
    return { error: 'gang_type must be 200 characters or less' };
  }
  return { data: gangType };
}

function parseDefaultImageUrls(value: unknown):
  | { error: string }
  | { data: DefaultImagePayload[] | null } {
  if (value === undefined || value === null || value === '') {
    return { data: null };
  }

  if (!Array.isArray(value)) {
    return { error: 'default_image_urls must be an array or null' };
  }

  const parsed: DefaultImagePayload[] = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const url = entry.trim();
      if (!url) {
        return { error: 'default_image_urls entries require a valid http(s) image url' };
      }
      if (!isValidHttpUrl(url)) {
        return { error: 'default_image_urls entries must be valid http(s) URLs' };
      }
      parsed.push({ url });
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      return { error: 'default_image_urls entries must be objects or URL strings' };
    }

    const url = emptyToNull((entry as { url?: unknown }).url);
    const rawCredit = (entry as { credit?: unknown }).credit;
    const creditFields = rawCredit && typeof rawCredit === 'object'
      ? {
          name: emptyToNull((rawCredit as { name?: unknown }).name),
          url: emptyToNull((rawCredit as { url?: unknown }).url),
          suffix: emptyToNull((rawCredit as { suffix?: unknown }).suffix),
        }
      : { name: null, url: null, suffix: null };

    if (!url) {
      if (creditFields.name || creditFields.url || creditFields.suffix) {
        return { error: 'default_image_urls entries require an image url when credit fields are set' };
      }
      return { error: 'default_image_urls entries require a valid http(s) image url' };
    }
    if (!isValidHttpUrl(url)) {
      return { error: 'default_image_urls entries must be valid http(s) URLs' };
    }

    if (creditFields.url && !isValidHttpUrl(creditFields.url)) {
      return { error: 'default_image_urls credit url must be a valid http(s) URL' };
    }

    const credit: { name?: string; url?: string; suffix?: string } = {
      ...(creditFields.name ? { name: creditFields.name } : {}),
      ...(creditFields.url ? { url: creditFields.url } : {}),
      ...(creditFields.suffix ? { suffix: creditFields.suffix } : {}),
    };

    parsed.push(Object.keys(credit).length > 0 ? { url, credit } : { url });
  }

  return { data: parsed.length > 0 ? parsed : null };
}

function defaultImageUrlsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') {
      return emptyToNull((entry as { url?: unknown }).url) ?? '';
    }
    return '';
  });
}

/**
 * gangs.default_gang_image is a positional index into default_image_urls.
 * Match by URL left-to-right so a same-length remove+add (e.g. [A,B,C] →
 * [A,C,D]) remaps pins instead of keeping stale positions. Unmatched old
 * slots map to null. Duplicate URLs are claimed in order.
 */
function buildDefaultImageIndexMap(
  oldUrls: string[],
  newUrls: string[]
): Map<number, number | null> {
  const map = new Map<number, number | null>();
  const used = new Set<number>();
  for (let oldIndex = 0; oldIndex < oldUrls.length; oldIndex++) {
    let found: number | null = null;
    for (let newIndex = 0; newIndex < newUrls.length; newIndex++) {
      if (used.has(newIndex)) continue;
      if (oldUrls[oldIndex] === newUrls[newIndex]) {
        found = newIndex;
        used.add(newIndex);
        break;
      }
    }
    map.set(oldIndex, found);
  }
  return map;
}

function validateGangTypePayload(body: {
  gang_type?: unknown;
  edition_id?: unknown;
  alignment?: unknown;
  is_hidden?: unknown;
  affiliation?: unknown;
  trading_post_type_id?: unknown;
  gang_origin_category_id?: unknown;
  parent_gang_type_id?: unknown;
  default_image_urls?: unknown;
}): { error: string } | { data: GangTypePayload } {
  const gangType = parseGangTypeName(body.gang_type);
  if ('error' in gangType) return gangType;

  const editionId = parseUuid(body.edition_id, 'edition_id');
  if ('error' in editionId) return editionId;
  if (!editionId.data) {
    return { error: 'edition_id is required' };
  }

  const alignment = parseAlignment(body.alignment);
  if ('error' in alignment) return alignment;

  const defaultImages = parseDefaultImageUrls(body.default_image_urls);
  if ('error' in defaultImages) return defaultImages;

  const isHidden = parseOptionalBoolean(body.is_hidden, 'is_hidden', false);
  if ('error' in isHidden) return isHidden;

  const affiliation = parseOptionalBoolean(body.affiliation, 'affiliation', false);
  if ('error' in affiliation) return affiliation;

  const tradingPostTypeId = parseUuid(body.trading_post_type_id, 'trading_post_type_id');
  if ('error' in tradingPostTypeId) return tradingPostTypeId;

  const originCategoryId = parseUuid(body.gang_origin_category_id, 'gang_origin_category_id');
  if ('error' in originCategoryId) return originCategoryId;

  const parentGangTypeId = parseUuid(body.parent_gang_type_id, 'parent_gang_type_id');
  if ('error' in parentGangTypeId) return parentGangTypeId;

  return {
    data: {
      gang_type: gangType.data,
      edition_id: editionId.data,
      alignment: alignment.data,
      is_hidden: isHidden.data,
      affiliation: affiliation.data,
      trading_post_type_id: tradingPostTypeId.data,
      gang_origin_category_id: originCategoryId.data,
      parent_gang_type_id: parentGangTypeId.data,
      default_image_urls: defaultImages.data,
    },
  };
}

function validateGangTypePatch(body: Record<string, unknown>):
  | { error: string }
  | { data: GangTypePatch } {
  const data: GangTypePatch = {};

  if ('gang_type' in body) {
    const gangType = parseGangTypeName(body.gang_type);
    if ('error' in gangType) return gangType;
    data.gang_type = gangType.data;
  }

  if ('edition_id' in body) {
    const editionId = parseUuid(body.edition_id, 'edition_id');
    if ('error' in editionId) return editionId;
    if (!editionId.data) {
      return { error: 'edition_id is required' };
    }
    data.edition_id = editionId.data;
  }

  if ('alignment' in body) {
    const alignment = parseAlignment(body.alignment);
    if ('error' in alignment) return alignment;
    data.alignment = alignment.data;
  }

  if ('is_hidden' in body) {
    const isHidden = parseBooleanField(body.is_hidden, 'is_hidden');
    if ('error' in isHidden) return isHidden;
    data.is_hidden = isHidden.data;
  }

  if ('affiliation' in body) {
    const affiliation = parseBooleanField(body.affiliation, 'affiliation');
    if ('error' in affiliation) return affiliation;
    data.affiliation = affiliation.data;
  }

  if ('trading_post_type_id' in body) {
    const tradingPostTypeId = parseUuid(body.trading_post_type_id, 'trading_post_type_id');
    if ('error' in tradingPostTypeId) return tradingPostTypeId;
    data.trading_post_type_id = tradingPostTypeId.data;
  }

  if ('gang_origin_category_id' in body) {
    const originCategoryId = parseUuid(body.gang_origin_category_id, 'gang_origin_category_id');
    if ('error' in originCategoryId) return originCategoryId;
    data.gang_origin_category_id = originCategoryId.data;
  }

  if ('parent_gang_type_id' in body) {
    const parentGangTypeId = parseUuid(body.parent_gang_type_id, 'parent_gang_type_id');
    if ('error' in parentGangTypeId) return parentGangTypeId;
    data.parent_gang_type_id = parentGangTypeId.data;
  }

  if ('default_image_urls' in body) {
    const defaultImages = parseDefaultImageUrls(body.default_image_urls);
    if ('error' in defaultImages) return defaultImages;
    data.default_image_urls = defaultImages.data;
  }

  if (Object.keys(data).length === 0) {
    return { error: 'No fields to update' };
  }

  return { data };
}

async function assertEditionExists(
  supabase: SupabaseClient,
  editionId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('editions')
    .select('id')
    .eq('id', editionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'edition_id not found';
  return null;
}

async function assertTradingPostMatchesEdition(
  supabase: SupabaseClient,
  tradingPostTypeId: string | null,
  editionId: string | null
): Promise<string | null> {
  if (!tradingPostTypeId) return null;

  const { data, error } = await supabase
    .from('trading_post_types')
    .select('id, edition_id')
    .eq('id', tradingPostTypeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'trading_post_type_id must reference an existing trading post type';
  if (data.edition_id && editionId && data.edition_id !== editionId) {
    return 'trading_post_type_id must be a trading post type of the same edition';
  }
  return null;
}

async function assertOriginCategoryExists(
  supabase: SupabaseClient,
  originCategoryId: string | null
): Promise<string | null> {
  if (!originCategoryId) return null;

  const { data, error } = await supabase
    .from('gang_origin_categories')
    .select('id')
    .eq('id', originCategoryId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'gang_origin_category_id must reference an existing origin category';
  return null;
}

async function assertParentGangType(
  supabase: SupabaseClient,
  parentGangTypeId: string | null,
  editionId: string | null,
  currentGangTypeId?: string
): Promise<string | null> {
  if (!parentGangTypeId) return null;

  if (!editionId) {
    return 'parent_gang_type_id requires edition_id';
  }

  if (currentGangTypeId && parentGangTypeId === currentGangTypeId) {
    return 'parent_gang_type_id cannot reference itself';
  }

  const { data, error } = await supabase
    .from('gang_types')
    .select('gang_type_id, edition_id, parent_gang_type_id')
    .eq('gang_type_id', parentGangTypeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'parent_gang_type_id must reference an existing gang type';
  if (data.edition_id !== editionId) {
    return 'parent_gang_type_id must be a gang type of the same edition';
  }
  if (data.parent_gang_type_id) {
    return 'parent_gang_type_id must reference a root gang type';
  }

  if (currentGangTypeId) {
    const { data: children, error: childrenError } = await supabase
      .from('gang_types')
      .select('gang_type_id')
      .eq('parent_gang_type_id', currentGangTypeId)
      .limit(1);

    if (childrenError) throw childrenError;
    if (children && children.length > 0) {
      return 'cannot set parent_gang_type_id on a gang type that is already a parent of other gang lists';
    }
  }

  return null;
}

async function assertEditionScopedRefs(
  supabase: SupabaseClient,
  payload: {
    edition_id: string | null;
    trading_post_type_id: string | null;
    gang_origin_category_id: string | null;
    parent_gang_type_id: string | null;
  },
  currentGangTypeId?: string
): Promise<string | null> {
  const [editionError, tradingPostError, originError, parentError] = await Promise.all([
    payload.edition_id ? assertEditionExists(supabase, payload.edition_id) : Promise.resolve(null),
    assertTradingPostMatchesEdition(supabase, payload.trading_post_type_id, payload.edition_id),
    assertOriginCategoryExists(supabase, payload.gang_origin_category_id),
    assertParentGangType(
      supabase,
      payload.parent_gang_type_id,
      payload.edition_id,
      currentGangTypeId
    ),
  ]);
  return editionError ?? tradingPostError ?? originError ?? parentError;
}

async function assertEditionChangeAllowed(
  supabase: SupabaseClient,
  gangTypeId: string,
  currentEditionId: string | null,
  nextEditionId: string
): Promise<string | null> {
  if (currentEditionId === nextEditionId) return null;

  // Composite FKs on (gang_type_id, edition_id) are ON UPDATE CASCADE, so a
  // successful edition change would silently reclassify fighter types, tactics
  // packs, and child variants into the new edition. Block while any remain.
  const [
    { count: gangCount, error: gangError },
    { count: fighterTypeCount, error: fighterTypeError },
    { count: tacticsPackCount, error: tacticsPackError },
    { count: childTypeCount, error: childTypeError },
  ] = await Promise.all([
    supabase
      .from('gangs')
      .select('id', { count: 'exact', head: true })
      .eq('gang_type_id', gangTypeId),
    supabase
      .from('fighter_types')
      .select('id', { count: 'exact', head: true })
      .eq('gang_type_id', gangTypeId),
    supabase
      .from('tactics_cards_packs')
      .select('id', { count: 'exact', head: true })
      .eq('gang_type_id', gangTypeId),
    supabase
      .from('gang_types')
      .select('gang_type_id', { count: 'exact', head: true })
      .eq('parent_gang_type_id', gangTypeId),
  ]);

  if (gangError) throw gangError;
  if (fighterTypeError) throw fighterTypeError;
  if (tacticsPackError) throw tacticsPackError;
  if (childTypeError) throw childTypeError;

  if (
    (gangCount ?? 0) > 0 ||
    (fighterTypeCount ?? 0) > 0 ||
    (tacticsPackCount ?? 0) > 0 ||
    (childTypeCount ?? 0) > 0
  ) {
    return 'Cannot change edition_id while gangs, fighter types, tactics packs, or child gang types still reference this gang type';
  }

  return null;
}

async function syncDenormalizedGangTypeName(
  supabase: SupabaseClient,
  gangTypeId: string,
  gangType: string
): Promise<void> {
  const [gangsResult, fighterTypesResult] = await Promise.all([
    supabase
      .from('gangs')
      .update({ gang_type: gangType })
      .eq('gang_type_id', gangTypeId)
      .neq('gang_type', gangType),
    supabase
      .from('fighter_types')
      .update({ gang_type: gangType })
      .eq('gang_type_id', gangTypeId)
      .neq('gang_type', gangType),
  ]);

  if (gangsResult.error) throw gangsResult.error;
  if (fighterTypesResult.error) throw fighterTypesResult.error;
}

async function remapPinnedDefaultImages(
  supabase: SupabaseClient,
  gangTypeId: string,
  oldUrls: string[],
  newUrls: string[]
): Promise<void> {
  const indexMap = buildDefaultImageIndexMap(oldUrls, newUrls);
  const changes = [...indexMap.entries()].filter(([from, to]) => from !== to);

  const clearOutOfRange = async () => {
    const { error } = await supabase
      .from('gangs')
      .update({ default_gang_image: null })
      .eq('gang_type_id', gangTypeId)
      .gte('default_gang_image', newUrls.length);
    if (error) throw error;
  };

  if (changes.length === 0) {
    await clearOutOfRange();
    return;
  }

  try {
    // Phase 1: unique negatives so 2→1 cannot collide with existing 1s.
    for (const [from] of changes) {
      const { error } = await supabase
        .from('gangs')
        .update({ default_gang_image: -(from + 1) })
        .eq('gang_type_id', gangTypeId)
        .eq('default_gang_image', from);
      if (error) throw error;
    }

    for (const [from, to] of changes) {
      const { error } = await supabase
        .from('gangs')
        .update({ default_gang_image: to })
        .eq('gang_type_id', gangTypeId)
        .eq('default_gang_image', -(from + 1));
      if (error) throw error;
    }
  } catch (error) {
    // Best-effort, not transactional: phase-2 rows already written to `to` no
    // longer match -(from+1), so they stay migrated while later entries revert.
    for (const [from] of changes) {
      await supabase
        .from('gangs')
        .update({ default_gang_image: from })
        .eq('gang_type_id', gangTypeId)
        .eq('default_gang_image', -(from + 1));
    }
    await clearOutOfRange();
    throw error;
  }

  await clearOutOfRange();
}

function withReferenceInvalidation(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    const response = await handler(request);
    if (response.ok) {
      invalidateGangTypesCatalog();
    }
    return response;
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const detailed = new URL(request.url).searchParams.get('detailed') === '1';
    const { data, error } = await supabase
      .from('gang_types')
      .select(detailed ? GANG_TYPE_COLUMNS : GANG_TYPE_LIST_COLUMNS)
      .order('gang_type');

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching gang types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang types' },
      { status: 500 }
    );
  }
}

async function _POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = validateGangTypePayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const refError = await assertEditionScopedRefs(supabase, validated.data);
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }

    const { data: gangType, error } = await supabase
      .from('gang_types')
      .insert([validated.data])
      .select(GANG_TYPE_COLUMNS)
      .single();

    if (error) throw error;

    return NextResponse.json(gangType);
  } catch (error) {
    return mutationErrorResponse(error, 'Failed to create gang type');
  }
}

async function _PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    const gangTypeIdParsed = parseUuid(body.gang_type_id, 'gang_type_id');
    if ('error' in gangTypeIdParsed) {
      return NextResponse.json({ error: gangTypeIdParsed.error }, { status: 400 });
    }
    const gangTypeId = gangTypeIdParsed.data;

    if (!gangTypeId) {
      return NextResponse.json({ error: 'gang_type_id is required' }, { status: 400 });
    }

    const validated = validateGangTypePatch(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('gang_types')
      .select(GANG_TYPE_COLUMNS)
      .eq('gang_type_id', gangTypeId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Gang type not found' }, { status: 404 });
    }

    const current = existing as GangTypeRow;
    const patch = validated.data;
    const nextEditionId = patch.edition_id ?? current.edition_id;

    if (patch.edition_id) {
      const editionChangeError = await assertEditionChangeAllowed(
        supabase,
        gangTypeId,
        current.edition_id,
        patch.edition_id
      );
      if (editionChangeError) {
        return NextResponse.json({ error: editionChangeError }, { status: 409 });
      }
    }

    const refError = await assertEditionScopedRefs(
      supabase,
      {
        edition_id: nextEditionId,
        trading_post_type_id: patch.trading_post_type_id !== undefined
          ? patch.trading_post_type_id
          : current.trading_post_type_id,
        gang_origin_category_id: patch.gang_origin_category_id !== undefined
          ? patch.gang_origin_category_id
          : current.gang_origin_category_id,
        parent_gang_type_id: patch.parent_gang_type_id !== undefined
          ? patch.parent_gang_type_id
          : current.parent_gang_type_id,
      },
      gangTypeId
    );
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }

    const { data: gangType, error } = await supabase
      .from('gang_types')
      .update(patch)
      .eq('gang_type_id', gangTypeId)
      .select(GANG_TYPE_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    if (!gangType) {
      return NextResponse.json({ error: 'Gang type not found' }, { status: 404 });
    }

    if (patch.gang_type) {
      await syncDenormalizedGangTypeName(supabase, gangTypeId, patch.gang_type);
    }

    if (patch.default_image_urls !== undefined) {
      await remapPinnedDefaultImages(
        supabase,
        gangTypeId,
        defaultImageUrlsOf(current.default_image_urls),
        (patch.default_image_urls ?? []).map((entry) => entry.url)
      );
    }

    return NextResponse.json(gangType);
  } catch (error) {
    return mutationErrorResponse(error, 'Failed to update gang type');
  }
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
