export const DESCRIPTION_MAX_LENGTH = 400;

export function normalizeCustomDescription(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trimEnd();
  return trimmed.length === 0 ? null : trimmed;
}

export function getCustomDescriptionLengthError(
  description: string | null
): string | null {
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}
