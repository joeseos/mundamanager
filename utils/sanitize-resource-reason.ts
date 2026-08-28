/** Max length for optional resource-change reasons stored in gang logs. */
export const RESOURCE_REASON_MAX_LENGTH = 100;

/**
 * Collapse whitespace/newlines and cap length so log first-line / second-line
 * splitting in the log modal stays intact.
 */
export function sanitizeResourceReason(reason: string | undefined | null): string | undefined {
  if (!reason) return undefined;
  const cleaned = reason.replace(/\s+/g, ' ').trim().slice(0, RESOURCE_REASON_MAX_LENGTH);
  return cleaned || undefined;
}
