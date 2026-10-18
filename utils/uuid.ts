const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether value is a UUID in its usual hyphenated form. */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);
