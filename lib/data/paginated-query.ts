export type PaginatedQueryPage<T> = {
  data: T[] | null;
  error: unknown;
};

export class PaginatedQueryError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Impossibile caricare tutte le righe della relazione.");
    this.name = "PaginatedQueryError";
    this.cause = cause;
  }
}

const POSTGREST_PAGE_SIZE = 1_000;

export function clampPaginationPage(
  requestedPage: number,
  total: number,
  pageSize: number,
): number {
  const normalizedPage = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(pageSize) || pageSize <= 0) {
    return 1;
  }
  return Math.min(normalizedPage, Math.ceil(total / pageSize));
}

export async function collectPaginatedRows<T>(
  loadPage: (from: number, to: number) => Promise<PaginatedQueryPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await loadPage(
      from,
      from + POSTGREST_PAGE_SIZE - 1,
    );

    if (error || !Array.isArray(data) || data.length > POSTGREST_PAGE_SIZE) {
      throw new PaginatedQueryError(error);
    }

    rows.push(...data);
    if (data.length < POSTGREST_PAGE_SIZE) return rows;
    from += POSTGREST_PAGE_SIZE;
  }
}
