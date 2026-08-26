import "server-only";

import { requirePermission } from "@/lib/auth/current-profile";
import {
  mapRequestDetail,
  mapRequestListRows,
  type FulfillmentHistoryItem,
  type RequestDetail,
  type RequestLineDetail,
  type RequestListItem,
} from "@/lib/data/request-mappers";
import { createClient } from "@/lib/supabase/server";

export type {
  FulfillmentHistoryItem,
  RequestDetail,
  RequestLineDetail,
  RequestListItem,
};

export type RequestListFilters = {
  page?: number;
};

export type RequestListResult = {
  items: RequestListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export class RequestDataError extends Error {
  constructor() {
    super("Le richieste non sono disponibili in questo momento.");
    this.name = "RequestDataError";
  }
}

const PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUEST_DETAIL_SELECT = `
  id,
  request_number,
  requested_at,
  project,
  tool_line,
  utilities,
  notes,
  status,
  lines:material_request_lines(
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
    created_at,
    fulfillments:fulfillment_events(
      id,
      quantity,
      fulfilled_at,
      notes
    )
  )
`;

function normalizePage(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 1;
}

function reportRequestError(operation: string, error: unknown): never {
  const code = typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : null;
  console.error("Supabase request operation failed", { operation, code });
  throw new RequestDataError();
}

export async function listOwnRequests(
  filters: RequestListFilters = {},
): Promise<RequestListResult> {
  await requirePermission("requests:read-own");
  const page = normalizePage(filters.page);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const { data, error, count } = await supabase
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
    .range(from, from + PAGE_SIZE - 1);

  if (error) reportRequestError("list own requests", error);

  return {
    items: mapRequestListRows(data ?? []),
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
  };
}

export async function getRequestDetail(
  requestId: string,
): Promise<RequestDetail | null> {
  await requirePermission("requests:read-own");
  if (!UUID_PATTERN.test(requestId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select(REQUEST_DETAIL_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (error) reportRequestError("load request detail", error);
  if (!data) return null;

  const request = mapRequestDetail(data);
  if (!request) reportRequestError("map request detail", null);
  return request;
}
