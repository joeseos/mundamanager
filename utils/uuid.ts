const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');

/** Whether value is a UUID in its usual hyphenated form. */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/**
 * The path with every UUID in it lower-cased. Ids are compared, cached and
 * tagged in lower case, as Postgres prints them.
 */
export const lowerCaseUuids = (path: string): string =>
  path.replace(new RegExp(UUID, 'gi'), (id) => id.toLowerCase());
