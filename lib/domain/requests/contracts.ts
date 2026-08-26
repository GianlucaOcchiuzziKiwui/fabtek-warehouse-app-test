export type SubmitRequestLineInput = {
  itemVariantId: string;
  categoryId: string;
  quantity: number;
};

export type SubmitRequestInput = {
  clientRequestId: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
  lines: SubmitRequestLineInput[];
};

export type FulfillRequestInput = {
  requestLineId: string;
  quantity: number;
  idempotencyKey: string;
  notes: string | null;
};
