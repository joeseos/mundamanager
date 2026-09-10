import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const PACK_COLUMNS = 'id, name, edition_id, gang_type_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function isMissingRowError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' || /0 rows/i.test(error.message ?? '');
}

function uniqueConstraintResponse(error: unknown): NextResponse | null {
  if (postgresCode(error) !== '23505') return null;
  const message = errorMessage(error);
  if (message.includes('tactics_cards_packs_edition_core_uidx')) {
    return NextResponse.json(
      { error: 'This edition already has a core tactics pack' },
      { status: 409 }
    );
  }
  if (message.includes('tactics_cards_packs_edition_id_name_key')) {
    return NextResponse.json(
      { error: 'A pack with this name already exists for this edition' },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: 'A pack with these values already exists' },
    { status: 409 }
  );
}

function validatePackPayload(body: {
  name?: unknown;
  edition_id?: unknown;
  gang_type_id?: unknown;
}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const editionId = emptyToNull(body.edition_id);
  const gangTypeId = emptyToNull(body.gang_type_id);

  if (!name) {
    return { error: 'name is required' };
  }
  if (name.length > 200) {
    return { error: 'name must be 200 characters or less' };
  }
  if (!editionId) {
    return { error: 'edition_id is required' };
  }
  if (!UUID_RE.test(editionId)) {
    return { error: 'edition_id must be a valid UUID' };
  }
  if (gangTypeId && !UUID_RE.test(gangTypeId)) {
    return { error: 'gang_type_id must be a valid UUID' };
  }

  return {
    data: {
      name,
      edition_id: editionId,
      gang_type_id: gangTypeId,
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

async function assertGangTypeMatchesEdition(
  supabase: SupabaseClient,
  gangTypeId: string | null,
  editionId: string
): Promise<string | null> {
  if (!gangTypeId) return null;

  const { data, error } = await supabase
    .from('gang_types')
    .select('gang_type_id, edition_id')
    .eq('gang_type_id', gangTypeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'gang_type_id must reference an existing gang type';
  if (data.edition_id !== editionId) {
    return 'gang_type_id must be a gang type of the same edition';
  }
  return null;
}

async function assertEditionScopedRefs(
  supabase: SupabaseClient,
  gangTypeId: string | null,
  editionId: string
): Promise<string | null> {
  const [editionError, gangTypeError] = await Promise.all([
    assertEditionExists(supabase, editionId),
    assertGangTypeMatchesEdition(supabase, gangTypeId, editionId),
  ]);
  return editionError ?? gangTypeError;
}

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: packs, error } = await supabase
      .from('tactics_cards_packs')
      .select(PACK_COLUMNS)
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(packs ?? []);
  } catch (error) {
    console.error('Error fetching tactics card packs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics card packs' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = validatePackPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const refError = await assertEditionScopedRefs(
      supabase,
      validated.data.gang_type_id,
      validated.data.edition_id
    );
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }

    const { data: pack, error } = await supabase
      .from('tactics_cards_packs')
      .insert([validated.data])
      .select(PACK_COLUMNS)
      .single();

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }

    return NextResponse.json(pack);
  } catch (error) {
    console.error('Error creating tactics card pack:', error);
    return NextResponse.json(
      { error: 'Failed to create tactics card pack' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const validated = validatePackPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const refError = await assertEditionScopedRefs(
      supabase,
      validated.data.gang_type_id,
      validated.data.edition_id
    );
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('tactics_cards_packs')
      .select('id, edition_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }

    if (existing.edition_id !== validated.data.edition_id) {
      const { count, error: cardCountError } = await supabase
        .from('tactics_cards')
        .select('id', { count: 'exact', head: true })
        .eq('tactics_cards_pack_id', id);

      if (cardCountError) throw cardCountError;
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Cannot change edition_id while this pack still has cards' },
          { status: 409 }
        );
      }
    }

    const { data: pack, error } = await supabase
      .from('tactics_cards_packs')
      .update({
        ...validated.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(PACK_COLUMNS)
      .maybeSingle();

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }
    if (!pack) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }

    return NextResponse.json(pack);
  } catch (error) {
    console.error('Error updating tactics card pack:', error);
    return NextResponse.json(
      { error: 'Failed to update tactics card pack' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('tactics_cards_packs')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }

    const { count: cardCount, error: cardCountError } = await supabase
      .from('tactics_cards')
      .select('id', { count: 'exact', head: true })
      .eq('tactics_cards_pack_id', id);

    if (cardCountError) throw cardCountError;
    if ((cardCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete pack while tactics cards still reference it' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('tactics_cards_packs')
      .delete()
      .eq('id', id);

    if (error) {
      if (isMissingRowError(error)) {
        return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
      }
      if (postgresCode(error) === '23503') {
        return NextResponse.json(
          { error: 'Cannot delete pack while tactics cards still reference it' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tactics card pack:', error);
    return NextResponse.json(
      { error: 'Failed to delete tactics card pack' },
      { status: 500 }
    );
  }
}
