import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";
import { invalidateCampaignPortraits } from "@/utils/cache-tags";
import { isValidHttpUrl } from "@/utils/http-url";
import { CAMPAIGN_PORTRAIT_STYLES, toCampaignPortrait } from "@/utils/campaign-portraits";

const PORTRAIT_COLUMNS = 'id, storage_path, credit, group_label, style, label';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STYLES = new Set<string>(CAMPAIGN_PORTRAIT_STYLES);

type PortraitWrite = {
  storage_path: string;
  group_label: string;
  style: string;
  label: string | null;
  credit: { name: string; url?: string; suffix?: string };
};

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
  if (code === '23514') {
    return NextResponse.json(
      { error: 'Portrait details do not match the catalogue rules' },
      { status: 400 }
    );
  }
  return null;
}

function trimmedText(value: unknown, field: string, max: number): { error: string } | { data: string } {
  if (typeof value !== 'string') return { error: `${field} is required` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required` };
  if (trimmed.length > max) return { error: `${field} must be ${max} characters or less` };
  return { data: trimmed };
}

function optionalText(value: unknown, field: string, max: number): { error: string } | { data: string | null } {
  if (value === undefined || value === null) return { data: null };
  if (typeof value !== 'string') return { error: `${field} must be text` };
  const trimmed = value.trim();
  if (!trimmed) return { data: null };
  if (trimmed.length > max) return { error: `${field} must be ${max} characters or less` };
  return { data: trimmed };
}

function isSafeStoragePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.length > 1024) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return false;
  if (/\s/.test(path)) return false;
  return true;
}

function validatePortraitPayload(body: {
  storage_path?: unknown;
  group_label?: unknown;
  style?: unknown;
  label?: unknown;
  credit_name?: unknown;
  credit_url?: unknown;
  credit_suffix?: unknown;
}): { error: string } | { data: PortraitWrite } {
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!isSafeStoragePath(storagePath)) {
    return { error: 'storage_path must be a non-empty path without a leading slash' };
  }

  const groupLabel = trimmedText(body.group_label, 'group_label', 200);
  if ('error' in groupLabel) return groupLabel;

  const style = typeof body.style === 'string' ? body.style.trim() : '';
  if (!STYLES.has(style)) {
    return { error: 'style must be colour, black & white, or ai-assisted' };
  }

  const label = optionalText(body.label, 'label', 200);
  if ('error' in label) return label;

  const creditName = trimmedText(body.credit_name, 'credit_name', 200);
  if ('error' in creditName) return creditName;

  const creditUrl = optionalText(body.credit_url, 'credit_url', 2000);
  if ('error' in creditUrl) return creditUrl;
  if (creditUrl.data && !isValidHttpUrl(creditUrl.data)) {
    return { error: 'credit_url must be an http or https URL' };
  }

  const creditSuffix = optionalText(body.credit_suffix, 'credit_suffix', 200);
  if ('error' in creditSuffix) return creditSuffix;

  const credit: PortraitWrite['credit'] = { name: creditName.data };
  if (creditUrl.data) credit.url = creditUrl.data;
  if (creditSuffix.data) credit.suffix = creditSuffix.data;

  return {
    data: {
      storage_path: storagePath,
      group_label: groupLabel.data,
      style,
      label: label.data,
      credit,
    },
  };
}

function parseId(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_RE.test(value)) return null;
  return value;
}

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('campaign_portraits')
      .select(PORTRAIT_COLUMNS)
      .order('group_label', { ascending: true })
      .order('label', { ascending: true, nullsFirst: true });

    if (error) throw error;

    return NextResponse.json((data ?? []).map((row) => toCampaignPortrait(row)));
  } catch (error) {
    console.error('Error fetching campaign portraits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign portraits' },
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
    const validated = validatePortraitPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campaign_portraits')
      .insert([validated.data])
      .select(PORTRAIT_COLUMNS)
      .single();

    if (error) {
      const constraint = constraintResponse(error);
      if (constraint) return constraint;
      throw error;
    }

    invalidateCampaignPortraits();
    return NextResponse.json(toCampaignPortrait(data));
  } catch (error) {
    console.error('Error creating campaign portrait:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign portrait' },
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
    const id = parseId(body?.id);
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const validated = validatePortraitPayload(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campaign_portraits')
      .update(validated.data)
      .eq('id', id)
      .select(PORTRAIT_COLUMNS)
      .maybeSingle();

    if (error) {
      const constraint = constraintResponse(error);
      if (constraint) return constraint;
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }

    invalidateCampaignPortraits();
    return NextResponse.json(toCampaignPortrait(data));
  } catch (error) {
    console.error('Error updating campaign portrait:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign portrait' },
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
    const id = parseId(body?.id);
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('campaign_portraits')
      .select('id, storage_path')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Portrait not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('campaign_portraits')
      .delete()
      .eq('id', id);

    if (error) throw error;

    invalidateCampaignPortraits();
    return NextResponse.json({ id, storage_path: existing.storage_path });
  } catch (error) {
    console.error('Error deleting campaign portrait:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign portrait' },
      { status: 500 }
    );
  }
}
