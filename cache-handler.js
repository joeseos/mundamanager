// Next dynamic-imports this file from disk at runtime (next-server.ts →
// formatDynamicImportPath), so it is never compiled: keep it plain ESM JS.
//
// Nothing Node-only may be imported at the top level. Next bundles this module
// into the edge chunk for `runtime = 'edge'` routes, where a top-level `redis`
// import fails to resolve node:crypto at module evaluation and breaks the build.
// Both loaders below degrade to null so an edge context falls through to misses.

let nodeDeps;
async function loadNode() {
  if (nodeDeps !== undefined) return nodeDeps;
  try {
    const [v8, fs, pathMod] = await Promise.all([
      import('node:v8'),
      import('node:fs'),
      import('node:path'),
    ]);
    nodeDeps = {
      serialize: v8.serialize,
      deserialize: v8.deserialize,
      readFileSync: fs.readFileSync,
      join: pathMod.default.join,
    };
  } catch {
    nodeDeps = null;
  }
  return nodeDeps;
}

let redisDeps;
async function loadRedis() {
  if (redisDeps !== undefined) return redisDeps;
  try {
    const redis = await import('redis');
    redisDeps = { createClient: redis.createClient, RESP_TYPES: redis.RESP_TYPES };
  } catch (error) {
    logError('import', error);
    redisDeps = null;
  }
  return redisDeps;
}

const PREFIX = `${process.env.REDIS_CACHE_PREFIX || 'munda-manager:next-cache'}:v1`;
const TIMEOUT_MS = Number(process.env.REDIS_CACHE_TIMEOUT_MS) || 1000;
const DEBUG = !!process.env.NEXT_PRIVATE_DEBUG_CACHE;
const TAGS_HEADER = 'x-next-cache-tags';
const MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

const FALLBACK_MAX_ENTRIES = 1000;
const FALLBACK_TTL_MS = 60_000;
const ERROR_LOG_INTERVAL_MS = 10_000;

// REDIS_URL is deliberately absent during `next build` on Coolify, and the build
// must not reach for Redis even if it leaks in, so both signals disable it.
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const REDIS_ENABLED = !IS_BUILD && !!process.env.REDIS_URL;

const debug = (...args) => {
  if (DEBUG) console.log('[redis-cache]', ...args);
};

let lastErrorLoggedAt = 0;
function logError(scope, error) {
  const now = Date.now();
  if (!DEBUG && now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLoggedAt = now;
  console.error(`[redis-cache] ${scope}:`, error?.message || error);
}

let client;
let bufferClient;
let connecting;
let announced = false;

async function connect() {
  if (!REDIS_ENABLED) return null;
  if (client) return client;

  const redis = await loadRedis();
  if (!redis) return null;
  if (client) return client;

  client = redis.createClient({
    url: process.env.REDIS_URL,
    pingInterval: 30_000,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
    },
  });

  // Throwing from this listener stops node-redis reconnecting after a socket error.
  client.on('error', (error) => logError('client', error));
  client.on('ready', () => debug('connected'));

  bufferClient = client.withTypeMapping({ [redis.RESP_TYPES.BLOB_STRING]: Buffer });
  connecting = client.connect().catch((error) => logError('connect', error));

  return client;
}

function withTimeout(promise, scope) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${scope} timed out`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function withRedis(scope, fn, fallback) {
  if (!REDIS_ENABLED) return fallback;

  try {
    const redis = await connect();
    if (!redis) return fallback;

    if (!redis.isReady) {
      await withTimeout(connecting, scope).catch(() => {});
      if (!redis.isReady) return fallback;
    }
    return await withTimeout(fn(redis, bufferClient), scope);
  } catch (error) {
    logError(scope, error);
    return fallback;
  }
}

const fallbackStore = new Map();

function fallbackGet(key) {
  const hit = fallbackStore.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt && hit.expiresAt < Date.now()) {
    fallbackStore.delete(key);
    return undefined;
  }
  fallbackStore.delete(key);
  fallbackStore.set(key, hit);
  return hit.entry;
}

function fallbackSet(key, entry) {
  fallbackStore.delete(key);
  fallbackStore.set(key, {
    entry,
    // During the build this tier is the only store, so it must not expire.
    expiresAt: REDIS_ENABLED ? Date.now() + FALLBACK_TTL_MS : 0,
  });
  while (fallbackStore.size > FALLBACK_MAX_ENTRIES) {
    fallbackStore.delete(fallbackStore.keys().next().value);
  }
}

const tagKey = (tag) => `${PREFIX}:tag:${tag}`;
const markerKey = (tag) => `${PREFIX}:rt:${tag}`;

function headerTags(data) {
  const header = data?.headers?.[TAGS_HEADER];
  return typeof header === 'string' && header ? header.split(',') : [];
}

/** Mirrors Next's areTagsExpired: a tag invalidated at T kills entries older than T. */
const isExpiredBy = (markers, lastModified) =>
  markers.some((marker) => marker != null && Number(marker) > lastModified);

export default class RedisCacheHandler {
  constructor(ctx = {}) {
    this.revalidatedTags = ctx.revalidatedTags || [];
    this.serverDistDir = ctx.serverDistDir;
    this.buildId = undefined;

    // Next builds a handler per request; the client below is module-scoped.
    if (!announced) {
      announced = true;
      debug('init', REDIS_ENABLED ? 'redis' : 'memory');
    }
  }

  resetRequestCache() {}

  async get(key, ctx = {}) {
    const { kind } = ctx;
    const entryKey = await this.#entryKey(key, kind);
    const ctxTags = [...(ctx.tags || []), ...(ctx.softTags || [])];

    if (ctxTags.some((tag) => this.revalidatedTags.includes(tag))) {
      debug('get REVALIDATED', key);
      return null;
    }

    const result = await withRedis(
      'get',
      async (redis, buffers) => {
        const [payload, markers] = await Promise.all([
          buffers.get(entryKey),
          ctxTags.length ? redis.mGet(ctxTags.map(markerKey)) : [],
        ]);
        return { payload, markers };
      },
      null
    );

    let entry;
    if (result) {
      if (result.payload) {
        entry = await this.#decode(entryKey, result.payload);
        if (entry && isExpiredBy(result.markers, entry.lastModified)) {
          debug('get EXPIRED', key);
          this.#drop(entryKey);
          return null;
        }
      }
    } else {
      entry = fallbackGet(entryKey);
    }

    if (!entry) {
      debug('get MISS', key, kind);
      return null;
    }

    // Page entries carry their tags in the stored headers rather than in ctx, so
    // anything the pipeline above could not know about needs a second lookup.
    const extraTags = (entry.tags || []).filter((tag) => !ctxTags.includes(tag));
    if (extraTags.length && result) {
      const markers = await withRedis(
        'get:tags',
        (redis) => redis.mGet(extraTags.map(markerKey)),
        []
      );
      if (isExpiredBy(markers, entry.lastModified)) {
        debug('get EXPIRED', key);
        this.#drop(entryKey);
        return null;
      }
    }

    debug('get HIT', key, kind);
    return { value: entry.value, lastModified: entry.lastModified };
  }

  async set(key, data, ctx = {}) {
    const kind = data?.kind || ctx.kind;
    const entryKey = await this.#entryKey(key, kind);
    const tags = [...new Set([...(ctx.tags || []), ...headerTags(data)])];
    const entry = { value: data, lastModified: Date.now(), tags };

    fallbackSet(entryKey, entry);
    debug('set', key, kind, `tags=${tags.length}`);

    await withRedis('set', async (redis) => {
      const node = await loadNode();
      if (!node) return;

      let payload;
      try {
        payload = node.serialize(entry);
      } catch (error) {
        logError('serialize', error);
        return;
      }

      const multi = redis.multi().set(entryKey, payload);
      for (const tag of tags) multi.sAdd(tagKey(tag), entryKey);
      await multi.exec();
    });
  }

  async revalidateTag(tags) {
    const list = [tags].flat().filter(Boolean);
    if (!list.length) return;

    for (const [key, hit] of fallbackStore) {
      if (hit.entry.tags?.some((tag) => list.includes(tag))) fallbackStore.delete(key);
    }

    const now = String(Date.now());
    const deleted = await withRedis(
      'revalidateTag',
      async (redis) => {
        const read = redis.multi();
        for (const tag of list) {
          // The marker is what invalidates implicit `_N_T_/…` soft tags and any
          // entry whose tag index was lost — neither of which the index can cover.
          read.set(markerKey(tag), now, { EX: MARKER_TTL_SECONDS });
          read.sMembers(tagKey(tag));
        }
        const results = await read.exec();

        const keys = new Set();
        for (let i = 1; i < results.length; i += 2) {
          for (const member of results[i] || []) keys.add(String(member));
        }

        const write = redis.multi();
        for (const key of keys) write.del(key);
        for (const tag of list) write.del(tagKey(tag));
        await write.exec();

        return keys.size;
      },
      null
    );

    if (deleted === null) {
      if (REDIS_ENABLED) {
        console.error(
          `[redis-cache] revalidateTag lost while Redis was unavailable: ${list.join(', ')}`
        );
      }
      return;
    }

    debug('revalidateTag', list.join(','), `deleted=${deleted}`);
  }

  // Fetch entries outlive a deploy; compiled page payloads must not, or a new
  // build would serve the previous build's RSC data.
  async #entryKey(key, kind) {
    if (kind === 'FETCH') return `${PREFIX}:fetch:${key}`;

    if (this.buildId === undefined) {
      this.buildId = 'shared';
      const node = await loadNode();
      if (node && this.serverDistDir) {
        try {
          this.buildId = node
            .readFileSync(node.join(this.serverDistDir, '..', 'BUILD_ID'), 'utf8')
            .trim();
        } catch {
          // Falls back to a shared namespace.
        }
      }
    }

    return `${PREFIX}:${this.buildId}:page:${key}`;
  }

  async #decode(entryKey, payload) {
    const node = await loadNode();
    if (!node) return undefined;
    try {
      return node.deserialize(payload);
    } catch (error) {
      logError('deserialize', error);
      this.#drop(entryKey);
      return undefined;
    }
  }

  #drop(entryKey) {
    fallbackStore.delete(entryKey);
    withRedis('drop', (redis) => redis.del(entryKey));
  }
}
