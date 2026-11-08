export type SortDir = 'asc' | 'desc';

export interface PageRequest<S extends string> {
  sort: S;
  dir: SortDir;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  /** Offset of the next page, or null when this is the last one. */
  nextOffset: number | null;
}

export function toPage<T>(
  items: T[],
  total: number,
  req: { limit: number; offset: number },
): Page<T> {
  const next = req.offset + items.length;
  return {
    items,
    total,
    offset: req.offset,
    limit: req.limit,
    nextOffset: next < total ? next : null,
  };
}

/** Case-insensitive substring match on any of the fields. */
export function matches(
  query: string | undefined,
  ...fields: (string | null | undefined)[]
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/**
 * Sorts, then slices an in-memory list. Values are compared as numbers when both
 * parse as numbers (decimal strings), otherwise as text; ties keep input order.
 */
export function pageInMemory<T, S extends string>(
  items: T[],
  req: PageRequest<S>,
  value: (item: T, sort: S) => string | number | Date | null,
): Page<T> {
  const factor = req.dir === 'asc' ? 1 : -1;
  const sorted = items
    .map((item, index) => ({ item, index, key: value(item, req.sort) }))
    .sort((a, b) => {
      // Empty values go last in both directions.
      if (a.key === null || b.key === null)
        return a.key === b.key ? a.index - b.index : a.key === null ? 1 : -1;
      return compare(a.key, b.key) * factor || a.index - b.index;
    })
    .map((x) => x.item);
  return toPage(
    sorted.slice(req.offset, req.offset + req.limit),
    items.length,
    req,
  );
}

function compare(a: string | number | Date, b: string | number | Date): number {
  if (a === b) return 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '')
    return na - nb;
  return String(a).localeCompare(String(b), 'el');
}
