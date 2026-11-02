/** Splits an admin text field like "Rapid Fire (1), Scarce" into its trimmed, non-empty entries */
export const toList = (value: string) => value.split(',').map(t => t.trim()).filter(Boolean);

/** Joins a stored list back into the text an admin edits */
export const fromList = (value: string[] | undefined) => value?.join(', ') ?? '';
