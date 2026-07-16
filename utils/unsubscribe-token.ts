// Stateless, signed one-click unsubscribe tokens.
//
// Uses only Web Crypto + TextEncoder so it runs in the Next.js server runtime. The
// email worker (Deno) carries a matching `sign` implementation; both must produce the
// identical format: base64url(payloadJson) + "." + base64url(HMAC-SHA256(body)).
//
// The token identifies which user + category to unsubscribe and carries an expiry, so
// the unsubscribe route needs no session — a click straight from an email works.

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(sig);
}

export interface UnsubscribePayload {
  u: string; // user id
  t: string; // notification_type or the master key 'all'
  e: number; // expiry, unix seconds
}

export async function signUnsubscribeToken(
  payload: UnsubscribePayload,
  secret: string,
): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const sig = base64url(await hmac(body, secret));
  return `${body}.${sig}`;
}

/**
 * Decode the category (`t`) from a token WITHOUT verifying the signature. Display only —
 * used by the confirmation page to show which category is being unsubscribed. The real
 * mutation still verifies the signature server-side, so a tampered token can at most show
 * a misleading label; it can never change what is written.
 */
export function decodeUnsubscribeType(token: string): string | null {
  const body = token.split('.')[0];
  if (!body) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64url(body)),
    ) as Partial<UnsubscribePayload>;
    return typeof payload.t === 'string' ? payload.t : null;
  } catch {
    return null;
  }
}

export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<UnsubscribePayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = base64url(await hmac(body, secret));
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64url(body)),
    ) as UnsubscribePayload;
    if (typeof payload.e !== 'number' || payload.e < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
