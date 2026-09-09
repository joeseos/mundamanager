import { TAGS } from '@/utils/cache-tags';
import { NextResponse } from 'next/server';
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

const GANG_TYPE_LIST_COLUMNS = 'gang_type_id, gang_type, edition_id';

const GANG_TYPE_COLUMNS =
  'gang_type_id, gang_type, alignment, is_hidden, affiliation, trading_post_type_id, gang_origin_category_id, parent_gang_type_id, default_image_urls, edition_id';

const ALLOWED_ALIGNMENTS = [
  'Law Abiding',
  'Outlaw',
  'Unaligned',
] as const;

type GangTypePayload = {
  gang_type: string;
  edition_id: string;
  alignment: string | null;
  is_hidden: boolean;
  affiliation: boolean;
  trading_post_type_id: string | null;
  gang_origin_category_id: string | null;
  parent_gang_type_id: string | null;
  default_image_urls: Array<{
    url: string;
    credit?: { name?: string; url?: string; suffix?: string };
  }> | null;
};

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseDefaultImageUrls(value: unknown):
  | { error: string }
  | { data: GangTypePayload['default_image_urls'] } {
  if (value === undefined || value === null || value === '') {
    return { data: null };
  }

  if (!Array.isArray(value)) {
    return { error: 'default_image_urls must be an array or null' };
  }

  const parsed: NonNullable<GangTypePayload['default_image_urls']> = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const url = entry.trim();
      if (!url) continue;
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

    if (!rawCredit || typeof rawCredit !== 'object') {
      parsed.push({ url });
      continue;
    }

    const creditName = creditFields.name;
    const creditUrl = creditFields.url;
    const creditSuffix = creditFields.suffix;

    if (creditUrl && !isValidHttpUrl(creditUrl)) {
      return { error: 'default_image_urls credit url must be a valid http(s) URL' };
    }

    const credit: { name?: string; url?: string; suffix?: string } = {
      ...(creditName ? { name: creditName } : {}),
      ...(creditUrl ? { url: creditUrl } : {}),
      ...(creditSuffix ? { suffix: creditSuffix } : {}),
    };

    parsed.push(Object.keys(credit).length > 0 ? { url, credit } : { url });
  }

  return { data: parsed.length > 0 ? parsed : null };
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
  const gangType = emptyToNull(body.gang_type);
  const editionId = emptyToNull(body.edition_id);

  if (!gangType) {
    return { error: 'gang_type is required' };
  }

  if (gangType.length > 200) {
    return { error: 'gang_type must be 200 characters or less' };
  }

  if (!editionId) {
    return { error: 'edition_id is required' };
  }

  const alignment = emptyToNull(body.alignment);
  if (alignment && !(ALLOWED_ALIGNMENTS as readonly string[]).includes(alignment)) {
    return { error: 'Invalid alignment' };
  }

  const defaultImages = parseDefaultImageUrls(body.default_image_urls);
  if ('error' in defaultImages) {
    return defaultImages;
  }

  return {
    data: {
      gang_type: gangType,
      edition_id: editionId,
      alignment,
      is_hidden: parseBoolean(body.is_hidden),
      affiliation: parseBoolean(body.affiliation),
      trading_post_type_id: emptyToNull(body.trading_post_type_id),
      gang_origin_category_id: emptyToNull(body.gang_origin_category_id),
      parent_gang_type_id: emptyToNull(body.parent_gang_type_id),
      default_image_urls: defaultImages.data,
    },
  };
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
  editionId: string
): Promise<string | null> {
  if (!tradingPostTypeId) return null;

  const { data, error } = await supabase
    .from('trading_post_types')
    .select('id, edition_id')
    .eq('id', tradingPostTypeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'trading_post_type_id must reference an existing trading post type';
  if (data.edition_id && data.edition_id !== editionId) {
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
  editionId: string,
  currentGangTypeId?: string
): Promise<string | null> {
  if (!parentGangTypeId) return null;

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
  payload: GangTypePayload,
  currentGangTypeId?: string
): Promise<string | null> {
  const [editionError, tradingPostError, originError, parentError] = await Promise.all([
    assertEditionExists(supabase, payload.edition_id),
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

function withReferenceInvalidation(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    const response = await handler(request);
    if (response.ok) {
      revalidateTag(TAGS.globalGangTypes(), { expire: 0 });
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
    console.error('Error creating gang type:', error);
    return NextResponse.json(
      { error: 'Failed to create gang type' },
      { status: 500 }
    );
  }
}

async function _PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const gangTypeId = emptyToNull(body.gang_type_id);

    if (!gangTypeId) {
      return NextResponse.json({ error: 'gang_type_id is required' }, { status: 400 });
    }

    const validated = validateGangTypePayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const refError = await assertEditionScopedRefs(supabase, validated.data, gangTypeId);
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }

    const { data: gangType, error } = await supabase
      .from('gang_types')
      .update(validated.data)
      .eq('gang_type_id', gangTypeId)
      .select(GANG_TYPE_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    if (!gangType) {
      return NextResponse.json({ error: 'Gang type not found' }, { status: 404 });
    }

    return NextResponse.json(gangType);
  } catch (error) {
    console.error('Error updating gang type:', error);
    return NextResponse.json(
      { error: 'Failed to update gang type' },
      { status: 500 }
    );
  }
}

export const POST = withReferenceInvalidation(_POST);
export const PATCH = withReferenceInvalidation(_PATCH);
