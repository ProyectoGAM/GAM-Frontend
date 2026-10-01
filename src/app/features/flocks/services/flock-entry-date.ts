export function formatFlockEntryDate(entryDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}
