/** Reject invisible or stale targets instead of reporting a successful save. */
export function requireAffectedRows(actual: number, expected = 1) {
  if (actual !== expected)
    throw new Error(
      `Only ${actual} of ${expected} records were saved. Refresh and check your access.`,
    );
}

/** Fetch complete, stably ordered datasets for totals and bulk operations. */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await page(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
