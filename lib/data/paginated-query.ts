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

export type PaginationRange = {
  page: number;
  from: number;
  to: number;
};

export function getSafePaginationRange(
  requestedPage: number,
  pageSize: number,
): PaginationRange {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new RangeError("La dimensione della pagina deve essere positiva.");
  }

  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    return { page: 1, from: 0, to: pageSize - 1 };
  }

  return { page, from, to };
}

export function clampPaginationPage(
  requestedPage: number,
  total: number,
  pageSize: number,
): number {
  const normalizedPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  if (
    !Number.isSafeInteger(total)
    || total <= 0
    || !Number.isSafeInteger(pageSize)
    || pageSize <= 0
  ) {
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
