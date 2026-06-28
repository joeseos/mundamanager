// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Safety: require envs
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Mode: "delete" to remove old drafts, "list" to only report them
const MODE: "delete" | "list" = "delete";

// Expiry threshold in minutes (default: 48 hours)
const CUTOFF_HOURS = 1; // in hours
const CUTOFF_MS = CUTOFF_HOURS * 60 * 60 * 1000;

const BUCKET = "users-images";
const BATCH_SIZE = 100; // Batch size for deletion

type StorageEntry = {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  path?: string;
};

async function listAll(prefix: string): Promise<StorageEntry[]> {
  const results: StorageEntry[] = [];
  let page = 0;

  while (true) {
    const res = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset: page * 100 });

    if (!res || typeof res !== "object") {
      throw new Error(`Storage list returned invalid response for prefix="${prefix}"`);
    }

    const data = (res as any).data;
    const error = (res as any).error;

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;

    for (const entry of data) {
      results.push({
        ...entry,
        path: prefix ? `${prefix}/${entry.name}` : entry.name,
      });
    }

    page++;
  }

  return results;
}

function isDraftPath(path: string) {
  return /campaigns\/[^/]+\/pack\/_draft\//.test(path);
}

function isOlderThanCutoff(entry: StorageEntry, cutoff: number) {
  const created =
    entry.created_at ||
    entry.updated_at ||
    null;

  if (created) {
    const ms = Date.parse(created);
    if (!Number.isNaN(ms)) return ms < cutoff;
  }

  return false;
}

async function collectDraftFiles(): Promise<string[]> {
  const toDelete: string[] = [];
  const cutoff = Date.now() - CUTOFF_MS;

  // List campaigns at top level
  const campaigns = await listAll("campaigns");

  for (const campaign of campaigns) {
    const campaignId = campaign.name;
    if (!campaignId) continue;

    // Directly list the draft folder for this campaign
    const draftPrefix = `campaigns/${campaignId}/pack/_draft`;
    const drafts = await listAll(draftPrefix);
    for (const draft of drafts) {
      if (draft.path && isDraftPath(draft.path) && isOlderThanCutoff(draft, cutoff)) {
        toDelete.push(draft.path);
      }
    }
  }

  return toDelete;
}

async function deleteInBatches(paths: string[]) {
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const res = await supabase.storage.from(BUCKET).remove(batch);
    if (!res || typeof res !== "object") {
      throw new Error("Storage remove returned invalid response");
    }
    const error = (res as any).error;
    if (error) throw error;
  }
}

Deno.serve(async () => {
  try {
    const toDelete = await collectDraftFiles();
    if (MODE === "delete" && toDelete.length > 0) {
      await deleteInBatches(toDelete);
    }

    return new Response(
      JSON.stringify({
        mode: MODE,
        listed: toDelete.length,
        deleted: MODE === "delete" ? toDelete.length : 0,
        files: toDelete, // always return the matched draft paths
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("cleanup-drafts error:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "cleanup failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

