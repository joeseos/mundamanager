import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ALLIANCE_TYPES = [
  'Criminal',
  'Merchant Guilds',
  'Noble Houses',
  'Others',
] as const;

const ALLOWED_ALIGNMENTS = [
  'Law Abiding',
  'Outlaw',
  'Unrestricted',
] as const;

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function validateAlliancePayload(body: {
  alliance_type?: unknown;
  alliance_name?: unknown;
  alignment?: unknown;
  strong_alliance?: unknown;
  alliance_crew_name?: unknown;
  edition_id?: unknown;
}) {
  const trimmedType = typeof body.alliance_type === 'string' ? body.alliance_type.trim() : '';
  const trimmedName = typeof body.alliance_name === 'string' ? body.alliance_name.trim() : '';
  const editionId = emptyToNull(body.edition_id);

  if (!trimmedType || !trimmedName) {
    return { error: 'alliance_type and alliance_name are required' };
  }

  if (!editionId) {
    return { error: 'edition_id is required' };
  }

  if (!(ALLOWED_ALLIANCE_TYPES as readonly string[]).includes(trimmedType)) {
    return { error: 'Invalid alliance_type' };
  }

  if (trimmedName.length > 200) {
    return { error: 'alliance_name must be 200 characters or less' };
  }

  const alignment = emptyToNull(body.alignment);
  if (alignment && !(ALLOWED_ALIGNMENTS as readonly string[]).includes(alignment)) {
    return { error: 'Invalid alignment' };
  }

  const allianceCrewName = emptyToNull(body.alliance_crew_name);
  if (allianceCrewName && allianceCrewName.length > 500) {
    return { error: 'alliance_crew_name must be 500 characters or less' };
  }

  return {
    data: {
      alliance_type: trimmedType,
      alliance_name: trimmedName,
      alignment,
      strong_alliance: emptyToNull(body.strong_alliance),
      alliance_crew_name: allianceCrewName,
      edition_id: editionId,
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

async function assertStrongAllianceMatchesEdition(
  supabase: SupabaseClient,
  strongAlliance: string | null,
  editionId: string
): Promise<string | null> {
  if (!strongAlliance) return null;

  const { data, error } = await supabase
    .from('gang_types')
    .select('gang_type_id, edition_id')
    .eq('gang_type_id', strongAlliance)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'strong_alliance must reference an existing gang type';
  if (data.edition_id !== editionId) {
    return 'strong_alliance must be a gang type of the same edition';
  }
  return null;
}

function isMissingRowError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' || /0 rows/i.test(error.message ?? '');
}

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: alliances, error } = await supabase
      .from('alliances')
      .select('id, alliance_type, alliance_name, alignment, strong_alliance, alliance_crew_name, edition_id')
      .order('alliance_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(alliances);
  } catch (error) {
    console.error('Error fetching alliances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alliances' },
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
    const validated = validateAlliancePayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const editionError = await assertEditionExists(supabase, validated.data.edition_id);
    if (editionError) {
      return NextResponse.json({ error: editionError }, { status: 400 });
    }

    const strongAllianceError = await assertStrongAllianceMatchesEdition(
      supabase,
      validated.data.strong_alliance,
      validated.data.edition_id
    );
    if (strongAllianceError) {
      return NextResponse.json({ error: strongAllianceError }, { status: 400 });
    }

    const { data: alliance, error } = await supabase
      .from('alliances')
      .insert([validated.data])
      .select('id, alliance_type, alliance_name, alignment, strong_alliance, alliance_crew_name, edition_id')
      .single();

    if (error) throw error;

    return NextResponse.json(alliance);
  } catch (error) {
    console.error('Error creating alliance:', error);
    return NextResponse.json(
      { error: 'Failed to create alliance' },
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

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const validated = validateAlliancePayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const editionError = await assertEditionExists(supabase, validated.data.edition_id);
    if (editionError) {
      return NextResponse.json({ error: editionError }, { status: 400 });
    }

    const strongAllianceError = await assertStrongAllianceMatchesEdition(
      supabase,
      validated.data.strong_alliance,
      validated.data.edition_id
    );
    if (strongAllianceError) {
      return NextResponse.json({ error: strongAllianceError }, { status: 400 });
    }

    const { data: alliance, error } = await supabase
      .from('alliances')
      .update(validated.data)
      .eq('id', id)
      .select('id, alliance_type, alliance_name, alignment, strong_alliance, alliance_crew_name, edition_id')
      .maybeSingle();

    if (error) throw error;
    if (!alliance) {
      return NextResponse.json({ error: 'Alliance not found' }, { status: 404 });
    }

    revalidateTag(`alliance-${id}`, { expire: 0 });

    return NextResponse.json(alliance);
  } catch (error) {
    console.error('Error updating alliance:', error);
    return NextResponse.json(
      { error: 'Failed to update alliance' },
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

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('alliances')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Alliance not found' }, { status: 404 });
    }

    const [{ count: gangCount, error: gangError }, { count: fighterTypeCount, error: fighterTypeError }] =
      await Promise.all([
        supabase
          .from('gangs')
          .select('id', { count: 'exact', head: true })
          .eq('alliance_id', id),
        supabase
          .from('fighter_types')
          .select('id', { count: 'exact', head: true })
          .eq('alliance_id', id),
      ]);

    if (gangError) throw gangError;
    if (fighterTypeError) throw fighterTypeError;

    if ((gangCount ?? 0) > 0 || (fighterTypeCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete alliance while gangs or fighter types still reference it',
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('alliances')
      .delete()
      .eq('id', id);

    if (error) {
      if (isMissingRowError(error)) {
        return NextResponse.json({ error: 'Alliance not found' }, { status: 404 });
      }
      throw error;
    }

    revalidateTag(`alliance-${id}`, { expire: 0 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alliance:', error);
    return NextResponse.json(
      { error: 'Failed to delete alliance' },
      { status: 500 }
    );
  }
}
