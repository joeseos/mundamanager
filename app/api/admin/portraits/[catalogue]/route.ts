import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { invalidateCampaignPortraits, invalidateGangPortraits } from "@/utils/cache-tags";
import { isUuid } from "@/utils/uuid";
import {
  PORTRAIT_CATALOGUES,
  isPortraitCatalogueKey,
  toCampaignPortrait,
  toPortrait,
  validatePortraitWrite,
  type Portrait,
  type PortraitCatalogueKey,
} from "@/utils/portrait-catalogue";

const GANG_COLUMNS = 'id, storage_path, credit, group_label, style, label';
const CAMPAIGN_COLUMNS =
  'id, storage_path, credit, style, campaign_type_id, campaign_types(campaign_type_name)';

const INVALIDATE = {
  gang: invalidateGangPortraits,
  campaign: invalidateCampaignPortraits,
} as const;

type RouteProps = { params: Promise<{ catalogue: string }> };
type Supabase = Awaited<ReturnType<typeof createClient>>;
type WriteBody = Parameters<typeof validatePortraitWrite>[0];

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function constraintResponse(error: unknown): NextResponse | null {
  const code = postgresCode(error);
  if (code === '23505') {
    return NextResponse.json(
      { error: 'A portrait already uses this image path' },
      { status: 409 }
    );
  }
  if (code === '23503') {
    return NextResponse.json(
      { error: 'Choose a campaign type that still exists' },
      { status: 400 }
    );
  }
  if (code === '23514') {
    return NextResponse.json(
      { error: 'Portrait details do not match the catalogue rules' },
      { status: 400 }
    );
  }
  return null;
}

async function catalogueKey(props: RouteProps): Promise<PortraitCatalogueKey | null> {
  const { catalogue } = await props.params;
  return isPortraitCatalogueKey(catalogue) ? catalogue : null;
}

function rejected(result: { error: unknown }): NextResponse | null {
  if (!result.error) return null;
  return constraintResponse(result.error) ?? null;
}

async function listPortraits(supabase: Supabase, catalogue: PortraitCatalogueKey): Promise<Portrait[]> {
  const config = PORTRAIT_CATALOGUES[catalogue];
  if (config.requiresCampaignType) {
    const { data, error } = await supabase
      .from(config.table)
      .select(CAMPAIGN_COLUMNS)
      .order('storage_path');
    if (error) throw error;
    return (data ?? []).map((row) => toCampaignPortrait(row));
  }

  const { data, error } = await supabase
    .from(config.table)
    .select(GANG_COLUMNS)
    .order('group_label', { ascending: true })
    .order('label', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map((row) => toPortrait(row));
}

async function insertPortrait(
  supabase: Supabase,
  catalogue: PortraitCatalogueKey,
  body: WriteBody
): Promise<NextResponse> {
  const config = PORTRAIT_CATALOGUES[catalogue];
  if (config.requiresCampaignType) {
    const validated = validatePortraitWrite(body, { requireCampaignTypeId: true });
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const created = await supabase
      .from(config.table)
      .insert(validated.data)
      .select(CAMPAIGN_COLUMNS)
      .single();
    const constraint = rejected(created);
    if (constraint) return constraint;
    if (created.error) throw created.error;
    return NextResponse.json(toCampaignPortrait(created.data));
  }

  const validated = validatePortraitWrite(body, { requireCampaignTypeId: false });
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const created = await supabase
    .from(config.table)
    .insert(validated.data)
    .select(GANG_COLUMNS)
    .single();
  const constraint = rejected(created);
  if (constraint) return constraint;
  if (created.error) throw created.error;
  return NextResponse.json(toPortrait(created.data));
}

async function updatePortrait(
  supabase: Supabase,
  catalogue: PortraitCatalogueKey,
  id: string,
  body: WriteBody
): Promise<NextResponse> {
  const config = PORTRAIT_CATALOGUES[catalogue];
  if (config.requiresCampaignType) {
    const validated = validatePortraitWrite(body, { requireCampaignTypeId: true });
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const updated = await supabase
      .from(config.table)
      .update(validated.data)
      .eq('id', id)
      .select(CAMPAIGN_COLUMNS)
      .maybeSingle();
    const constraint = rejected(updated);
    if (constraint) return constraint;
    if (updated.error) throw updated.error;
    if (!updated.data) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }
    return NextResponse.json(toCampaignPortrait(updated.data));
  }

  const validated = validatePortraitWrite(body, { requireCampaignTypeId: false });
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const updated = await supabase
    .from(config.table)
    .update(validated.data)
    .eq('id', id)
    .select(GANG_COLUMNS)
    .maybeSingle();
  const constraint = rejected(updated);
  if (constraint) return constraint;
  if (updated.error) throw updated.error;
  if (!updated.data) {
    return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
  }
  return NextResponse.json(toPortrait(updated.data));
}

export async function GET(_request: Request, props: RouteProps) {
  const catalogue = await catalogueKey(props);
  if (!catalogue) return NextResponse.json({ error: 'Unknown portrait catalogue' }, { status: 404 });

  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await listPortraits(supabase, catalogue));
  } catch (error) {
    console.error('Error fetching portraits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portraits' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: RouteProps) {
  const catalogue = await catalogueKey(props);
  if (!catalogue) return NextResponse.json({ error: 'Unknown portrait catalogue' }, { status: 404 });

  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const saved = await insertPortrait(supabase, catalogue, await request.json());
    if (saved.ok) INVALIDATE[catalogue]();
    return saved;
  } catch (error) {
    console.error('Error creating portrait:', error);
    return NextResponse.json(
      { error: 'Failed to create portrait' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: RouteProps) {
  const catalogue = await catalogueKey(props);
  if (!catalogue) return NextResponse.json({ error: 'Unknown portrait catalogue' }, { status: 404 });

  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!isUuid(body?.id)) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const saved = await updatePortrait(supabase, catalogue, body.id, body);
    if (saved.ok) INVALIDATE[catalogue]();
    return saved;
  } catch (error) {
    console.error('Error updating portrait:', error);
    return NextResponse.json(
      { error: 'Failed to update portrait' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: RouteProps) {
  const catalogue = await catalogueKey(props);
  if (!catalogue) return NextResponse.json({ error: 'Unknown portrait catalogue' }, { status: 404 });

  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!isUuid(body?.id)) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const config = PORTRAIT_CATALOGUES[catalogue];
    const existing = await supabase
      .from(config.table)
      .select('id, storage_path')
      .eq('id', body.id)
      .maybeSingle();

    if (existing.error) throw existing.error;
    if (!existing.data) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }

    const { error } = await supabase.from(config.table).delete().eq('id', body.id);
    if (error) throw error;

    INVALIDATE[catalogue]();
    return NextResponse.json({ id: body.id, storage_path: existing.data.storage_path });
  } catch (error) {
    console.error('Error deleting portrait:', error);
    return NextResponse.json(
      { error: 'Failed to delete portrait' },
      { status: 500 }
    );
  }
}
