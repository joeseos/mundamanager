import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { invalidateCampaignPortraits, invalidateGangPortraits } from "@/utils/cache-tags";
import { isUuid } from "@/utils/uuid";
import {
  PORTRAIT_CATALOGUES,
  isPortraitCatalogueKey,
  toPortrait,
  validatePortraitWrite,
  type PortraitCatalogueKey,
  type PortraitWrite,
} from "@/utils/portrait-catalogue";

const GANG_COLUMNS = 'id, storage_path, credit, group_label, style, label';
const CAMPAIGN_COLUMNS = `${GANG_COLUMNS}, campaign_type_id`;

const INVALIDATE = {
  gang: invalidateGangPortraits,
  campaign: invalidateCampaignPortraits,
} as const;

type RouteProps = { params: Promise<{ catalogue: string }> };

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

function campaignTypeId(write: PortraitWrite): string {
  if (!write.campaign_type_id) {
    throw new Error('campaign_type_id is required');
  }
  return write.campaign_type_id;
}

async function groupLabelForWrite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  catalogue: PortraitCatalogueKey,
  write: PortraitWrite
): Promise<{ error: string } | { data: PortraitWrite }> {
  if (!PORTRAIT_CATALOGUES[catalogue].requiresCampaignType) return { data: write };
  const campaignTypeId = write.campaign_type_id;
  if (!campaignTypeId) return { error: 'campaign_type_id is required' };

  const { data, error } = await supabase
    .from('campaign_types')
    .select('campaign_type_name')
    .eq('id', campaignTypeId)
    .maybeSingle();
  if (error) throw error;
  const name = data?.campaign_type_name?.trim();
  if (!name) return { error: 'Choose a campaign type that still exists' };
  return { data: { ...write, group_label: name } };
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

    if (catalogue === 'campaign') {
      const { data, error } = await supabase
        .from('campaign_portraits')
        .select(`${CAMPAIGN_COLUMNS}, campaign_types(campaign_type_name)`)
        .order('label', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return NextResponse.json((data ?? []).map((row) => {
        const joined = Array.isArray(row.campaign_types) ? row.campaign_types[0] : row.campaign_types;
        const liveName = joined?.campaign_type_name?.trim();
        return toPortrait({
          ...row,
          group_label: liveName || row.group_label,
        });
      }));
    }

    const { data, error } = await supabase
      .from('gang_portraits')
      .select(GANG_COLUMNS)
      .order('group_label', { ascending: true })
      .order('label', { ascending: true, nullsFirst: true });

    if (error) throw error;

    return NextResponse.json((data ?? []).map((row) => toPortrait(row)));
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

    const body = await request.json();
    const validated = validatePortraitWrite(body, {
      requireCampaignTypeId: PORTRAIT_CATALOGUES[catalogue].requiresCampaignType,
    });
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const write = await groupLabelForWrite(supabase, catalogue, validated.data);
    if ('error' in write) {
      return NextResponse.json({ error: write.error }, { status: 400 });
    }

    const created = catalogue === 'campaign'
      ? await supabase
          .from('campaign_portraits')
          .insert([{
            storage_path: write.data.storage_path,
            group_label: write.data.group_label,
            style: write.data.style,
            label: write.data.label,
            credit: write.data.credit,
            campaign_type_id: campaignTypeId(write.data),
          }])
          .select(CAMPAIGN_COLUMNS)
          .single()
      : await supabase
          .from('gang_portraits')
          .insert([{
            storage_path: write.data.storage_path,
            group_label: write.data.group_label,
            style: write.data.style,
            label: write.data.label,
            credit: write.data.credit,
          }])
          .select(GANG_COLUMNS)
          .single();

    if (created.error) {
      const constraint = constraintResponse(created.error);
      if (constraint) return constraint;
      throw created.error;
    }

    INVALIDATE[catalogue]();
    return NextResponse.json(toPortrait(created.data));
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

    const validated = validatePortraitWrite(body, {
      requireCampaignTypeId: PORTRAIT_CATALOGUES[catalogue].requiresCampaignType,
    });
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const write = await groupLabelForWrite(supabase, catalogue, validated.data);
    if ('error' in write) {
      return NextResponse.json({ error: write.error }, { status: 400 });
    }

    const updated = catalogue === 'campaign'
      ? await supabase
          .from('campaign_portraits')
          .update({
            storage_path: write.data.storage_path,
            group_label: write.data.group_label,
            style: write.data.style,
            label: write.data.label,
            credit: write.data.credit,
            campaign_type_id: campaignTypeId(write.data),
          })
          .eq('id', body.id)
          .select(CAMPAIGN_COLUMNS)
          .maybeSingle()
      : await supabase
          .from('gang_portraits')
          .update({
            storage_path: write.data.storage_path,
            group_label: write.data.group_label,
            style: write.data.style,
            label: write.data.label,
            credit: write.data.credit,
          })
          .eq('id', body.id)
          .select(GANG_COLUMNS)
          .maybeSingle();

    if (updated.error) {
      const constraint = constraintResponse(updated.error);
      if (constraint) return constraint;
      throw updated.error;
    }
    if (!updated.data) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }

    INVALIDATE[catalogue]();
    return NextResponse.json(toPortrait(updated.data));
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

    const existing = catalogue === 'campaign'
      ? await supabase
          .from('campaign_portraits')
          .select('id, storage_path')
          .eq('id', body.id)
          .maybeSingle()
      : await supabase
          .from('gang_portraits')
          .select('id, storage_path')
          .eq('id', body.id)
          .maybeSingle();

    if (existing.error) throw existing.error;
    if (!existing.data) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }

    const { error } = catalogue === 'campaign'
      ? await supabase.from('campaign_portraits').delete().eq('id', body.id)
      : await supabase.from('gang_portraits').delete().eq('id', body.id);

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
