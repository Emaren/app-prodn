export type RestrictedPaperStatus = Readonly<{
  schema: "KT_SESSION_C_SAFE_STATUS_ONLY_V1";
  accessScope: "NONFINANCIAL_STATUS_ONLY";
  paperStatus: "HALT_NO_INDEPENDENT_FRESH_MARKET_DATA";
  sourceClassification: "HISTORICAL_PAPER_REPRODUCTION_NOT_LIVE_BOTS";
  originalAccounts: 100;
  openUnpricedOriginalPositions: 7;
  sourceFresh: false;
  paperNewOrdersAllowed: false;
  realOrders: 0;
  fundedAuthority: false;
  releaseSource: string;
}>;

export type RestrictedPaperReadResult =
  | Readonly<{ ok: true; status: "READ_ONLY_PAPER_HALT"; model: RestrictedPaperStatus }>
  | Readonly<{ ok: false;
      status: "HOLD_APP_HANDOFF_OR_ADMIN_AUTH" | "HOLD_PRODUCT_READ_MODEL_UNAVAILABLE";
      paperNewOrdersAllowed: false; realOrders: 0 }>;

export function readRestrictedPaperStatus(options?: {
  authorizedAdmin?: boolean;
  releaseAdmitted?: boolean;
  machineCredentialFile?: string;
  productCaFile?: string;
}): Promise<RestrictedPaperReadResult>;
