import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { invalidateGangTacticsCards } from "@/utils/cache-tags";
import { compareTacticsCards } from "@/types/tactics-card";
import type { SupabaseClient } from "@supabase/supabase-js";

const CARD_COLUMNS = 'id, name, d66_min, d66_max, tactics_cards_pack_id, edition_id';
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
  if (message.includes('tactics_cards_tactics_cards_pack_id_name_key')) {
    return NextResponse.json(
      { error: 'A card with this name already exists in this pack' },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: 'A card with these values already exists' },
    { status: 409 }
  );
}

function parseOptionalD66(value: unknown, field: string): { error: string } | { data: number | null } {
  if (value === undefined || value === null || value === '') {
    return { data: null };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return { error: `${field} must be an integer` };
    }
    return { data: value };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { data: null };
    if (!/^-?\d+$/.test(trimmed)) {
      return { error: `${field} must be an integer` };
    }
    return { data: Number(trimmed) };
  }
  return { error: `${field} must be an integer` };
}

function validateCardPayload(body: {
  name?: unknown;
  tactics_cards_pack_id?: unknown;
  d66_min?: unknown;
  d66_max?: unknown;
}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const packId = emptyToNull(body.tactics_cards_pack_id);

  if (!name) {
    return { error: 'name is required' };
  }
  if (name.length > 200) {
    return { error: 'name must be 200 characters or less' };
  }
  if (!packId) {
    return { error: 'tactics_cards_pack_id is required' };
  }
  if (!UUID_RE.test(packId)) {
    return { error: 'tactics_cards_pack_id must be a valid UUID' };
  }

  const parsedMin = parseOptionalD66(body.d66_min, 'd66_min');
  if ('error' in parsedMin) return parsedMin;
  const parsedMax = parseOptionalD66(body.d66_max, 'd66_max');
  if ('error' in parsedMax) return parsedMax;

  const d66Min = parsedMin.data;
  const d66Max = parsedMax.data;

  if ((d66Min === null) !== (d66Max === null)) {
    return { error: 'd66_min and d66_max must both be set or both be empty' };
  }
  if (d66Min !== null && d66Max !== null && d66Min > d66Max) {
    return { error: 'd66_min must be less than or equal to d66_max' };
  }

  return {
    data: {
      name,
      tactics_cards_pack_id: packId,
      d66_min: d66Min,
      d66_max: d66Max,
    },
  };
}

async function loadPackEdition(
  supabase: SupabaseClient,
  packId: string
): Promise<{ error: string } | { editionId: string }> {
  const { data, error } = await supabase
    .from('tactics_cards_packs')
    .select('id, edition_id')
    .eq('id', packId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: 'tactics_cards_pack_id not found' };
  return { editionId: data.edition_id };
}

async function gangIdsOwningCard(
  supabase: SupabaseClient,
  cardId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('gang_tactics_cards')
    .select('gang_id')
    .eq('tactics_cards_id', cardId);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.gang_id).filter(Boolean)));
}

function bustGangTacticsCaches(gangIds: string[]) {
  for (const gangId of gangIds) {
    invalidateGangTacticsCards(gangId);
  }
}

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: cards, error } = await supabase
      .from('tactics_cards')
      .select(CARD_COLUMNS);

    if (error) throw error;

    const sorted = [...(cards ?? [])].sort(compareTacticsCards);
    return NextResponse.json(sorted);
  } catch (error) {
    console.error('Error fetching tactics cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
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
    const validated = validateCardPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const pack = await loadPackEdition(supabase, validated.data.tactics_cards_pack_id);
    if ('error' in pack) {
      return NextResponse.json({ error: pack.error }, { status: 400 });
    }

    const { data: card, error } = await supabase
      .from('tactics_cards')
      .insert([{
        ...validated.data,
        edition_id: pack.editionId,
      }])
      .select(CARD_COLUMNS)
      .single();

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }

    return NextResponse.json(card);
  } catch (error) {
    console.error('Error creating tactics card:', error);
    return NextResponse.json(
      { error: 'Failed to create tactics card' },
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

    const validated = validateCardPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const pack = await loadPackEdition(supabase, validated.data.tactics_cards_pack_id);
    if ('error' in pack) {
      return NextResponse.json({ error: pack.error }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('tactics_cards')
      .select('id, edition_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const owningGangIds = await gangIdsOwningCard(supabase, id);
    if (existing.edition_id !== pack.editionId && owningGangIds.length > 0) {
      return NextResponse.json(
        { error: 'Cannot change edition while gangs still reference this card' },
        { status: 409 }
      );
    }

    const { data: card, error } = await supabase
      .from('tactics_cards')
      .update({
        ...validated.data,
        edition_id: pack.editionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(CARD_COLUMNS)
      .maybeSingle();

    if (error) {
      const uniqueResponse = uniqueConstraintResponse(error);
      if (uniqueResponse) return uniqueResponse;
      throw error;
    }
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    bustGangTacticsCaches(owningGangIds);

    return NextResponse.json(card);
  } catch (error) {
    console.error('Error updating tactics card:', error);
    return NextResponse.json(
      { error: 'Failed to update tactics card' },
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
      .from('tactics_cards')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const owningGangIds = await gangIdsOwningCard(supabase, id);
    if (owningGangIds.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete card while gangs still reference it' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('tactics_cards')
      .delete()
      .eq('id', id);

    if (error) {
      if (isMissingRowError(error)) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 });
      }
      if (postgresCode(error) === '23503') {
        return NextResponse.json(
          { error: 'Cannot delete card while gangs still reference it' },
          { status: 409 }
        );
      }
      throw error;
    }

    bustGangTacticsCaches(owningGangIds);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tactics card:', error);
    return NextResponse.json(
      { error: 'Failed to delete tactics card' },
      { status: 500 }
    );
  }
}
