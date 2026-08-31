import "server-only";

import { requirePermission } from "@/lib/auth/current-profile";
import {
  attachFulfillmentsToLines,
  mapRequestDetail,
  mapRequestListRows,
  mapManagedRequestListRows,
  type FulfillmentHistoryItem,
  type ManagedRequestListItem,
  type RequestDetail,
  type RequestLineDetail,
  type RequestListItem,
} from "@/lib/data/request-mappers";
import {
  clampPaginationPage,
  collectPaginatedRows,
  getSafePaginationRange,
} from "@/lib/data/paginated-query";
import { readConsistentRequestDetail } from "@/lib/data/request-consistency";
import { createClient } from "@/lib/supabase/server";

export type {
  FulfillmentHistoryItem,
  RequestDetail,
  RequestLineDetail,
  RequestListItem,
  ManagedRequestListItem,
};

export type RequestListFilters = {
  page?: number;
};

export type ManagedRequestListFilters = RequestListFilters & {
  query?: string;
  status?: string;
};

export type RequestListResult = {
  items: RequestListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ManagedRequestListResult = Omit<RequestListResult, "items"> & {
  items: ManagedRequestListItem[];
};

export class RequestDataError extends Error {
  constructor() {
    super("Le richieste non sono disponibili in questo momento.");
    this.name = "RequestDataError";
  }
}

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_STATUSES = new Set(["in_preparazione", "evasa_parziale", "evasa"]);

const REQUEST_DETAIL_SELECT = `
  id,
  request_number,
  requested_at,
  project,
  tool_line,
  utilities,
  notes,
  status
`;

const REQUEST_LINE_SELECT = `
  id,
  snapshot_fabtek_code,
  snapshot_oracle_sapio_code,
  snapshot_category_name,
  snapshot_family_name,
  snapshot_component_name,
  snapshot_description,
  snapshot_diameter,
  snapshot_material,
  snapshot_connection,
  snapshot_unit_of_measure,
  requested_quantity,
  fulfilled_quantity,
  status,
  created_at
`;

const FULFILLMENT_SELECT = `
  id,
  request_line_id,
  quantity,
  fulfilled_at,
  notes,
  request_line:material_request_lines!inner()
`;

function normalizePage(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 1;
}

function normalizeManagedFilters(filters: ManagedRequestListFilters) {
  const query = typeof filters.query === "string"
    ? filters.query.trim().slice(0, MAX_QUERY_LENGTH)
    : "";
  const status = typeof filters.status === "string" && REQUEST_STATUSES.has(filters.status)
    ? filters.status
    : null;

  return { page: normalizePage(filters.page), query, status };
}

function escapePostgrestSearchPattern(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[%_*]/g, "\\$&");
  return `"%${escaped}%"`;
}

function reportRequestError(operation: string, error: unknown): never {
  const cause = typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : error;
  const code = typeof cause === "object"
    && cause !== null
    && "code" in cause
    && typeof cause.code === "string"
    ? cause.code
    : null;
  console.error("Supabase request operation failed", { operation, code });
  throw new RequestDataError();
}

export async function listOwnRequests(
  filters: RequestListFilters = {},
): Promise<RequestListResult> {
  await requirePermission("requests:read-own");
  let page = getSafePaginationRange(normalizePage(filters.page), PAGE_SIZE).page;
  const supabase = await createClient();

  async function loadPage(targetPage: number) {
    const range = getSafePaginationRange(targetPage, PAGE_SIZE);
    return supabase
      .from("material_requests")
      .select(`
        id,
        request_number,
        requested_at,
        project,
        status,
        lines:material_request_lines(count)
      `, { count: "exact" })
      .order("requested_at", { ascending: false })
      .order("request_number", { ascending: false })
      .range(range.from, range.to);
  }

  let response = await loadPage(page);
  if (response.error) reportRequestError("list own requests", response.error);
  if (
    !Array.isArray(response.data)
    || !Number.isSafeInteger(response.count)
    || (response.count ?? -1) < 0
  ) {
    reportRequestError("validate own requests response", null);
  }

  const total = response.count as number;
  const clampedPage = clampPaginationPage(page, total, PAGE_SIZE);
  if (clampedPage !== page) {
    page = clampedPage;
    response = await loadPage(page);
    if (response.error) reportRequestError("list clamped own requests", response.error);
    if (!Array.isArray(response.data)) {
      reportRequestError("validate clamped own requests response", null);
    }
  }

  let items: RequestListItem[];
  try {
    items = mapRequestListRows(response.data);
  } catch (error) {
    return reportRequestError("map own requests", error);
  }

  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
  };
}

export async function listManagedRequests(
  filters: ManagedRequestListFilters = {},
): Promise<ManagedRequestListResult> {
  await requirePermission("requests:manage");
  const normalized = normalizeManagedFilters(filters);
  let page = getSafePaginationRange(normalized.page, PAGE_SIZE).page;
  const supabase = await createClient();

  async function loadPage(targetPage: number) {
    const range = getSafePaginationRange(targetPage, PAGE_SIZE);
    let query = supabase
      .from("material_requests")
      .select(`
        id,
        request_number,
        requested_at,
        project,
        status,
        lines:material_request_lines(count),
        requester:profiles!material_requests_requester_id_fkey(full_name)
      `, { count: "exact" })
      .order("requested_at", { ascending: false })
      .order("request_number", { ascending: false })
      .range(range.from, range.to);

    if (normalized.status) query = query.eq("status", normalized.status);
    if (normalized.query) {
      const pattern = escapePostgrestSearchPattern(normalized.query);
      query = query.or(
        `project.ilike.${pattern},tool_line.ilike.${pattern},utilities.ilike.${pattern}`,
      );
    }

    return query;
  }

  let response = await loadPage(page);
  if (response.error) reportRequestError("list managed requests", response.error);
  if (
    !Array.isArray(response.data)
    || !Number.isSafeInteger(response.count)
    || (response.count ?? -1) < 0
  ) {
    reportRequestError("validate managed requests response", null);
  }

  const total = response.count as number;
  const clampedPage = clampPaginationPage(page, total, PAGE_SIZE);
  if (clampedPage !== page) {
    page = clampedPage;
    response = await loadPage(page);
    if (response.error) reportRequestError("list clamped managed requests", response.error);
    if (!Array.isArray(response.data)) {
      reportRequestError("validate clamped managed requests response", null);
    }
  }

  let items: ManagedRequestListItem[];
  try {
    items = mapManagedRequestListRows(response.data);
  } catch (error) {
    return reportRequestError("map managed requests", error);
  }

  return { items, page, pageSize: PAGE_SIZE, total };
}

export async function getRequestDetail(
  requestId: string,
): Promise<RequestDetail | null> {
  await requirePermission("requests:read-own");
  if (!UUID_PATTERN.test(requestId)) return null;

  const supabase = await createClient();

  try {
    return await readConsistentRequestDetail(async () => {
      const { data, error } = await supabase
        .from("material_requests")
        .select(REQUEST_DETAIL_SELECT)
        .eq("id", requestId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const [lines, fulfillments] = await Promise.all([
        collectPaginatedRows(async (from, to) => {
          const response = await supabase
            .from("material_request_lines")
            .select(REQUEST_LINE_SELECT)
            .eq("request_id", requestId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);
          return { data: response.data, error: response.error };
        }),
        collectPaginatedRows(async (from, to) => {
          const response = await supabase
            .from("fulfillment_events")
            .select(FULFILLMENT_SELECT)
            .eq("request_line.request_id", requestId)
            .order("fulfilled_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);
          return { data: response.data, error: response.error };
        }),
      ]);
      const mappedLines = attachFulfillmentsToLines(lines, fulfillments);
      return mapRequestDetail({ ...data, lines: mappedLines });
    });
  } catch (mappingOrQueryError) {
    return reportRequestError("load complete request detail", mappingOrQueryError);
  }
}
