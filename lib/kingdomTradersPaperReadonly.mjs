// Session C PRODUCT — NOT mounted as a Next route before Session B handoff.
// Node.js-only status adapter. No account rows, owner passwords, financial SQL,
// exchange privileges, wallets or Wolo paths. Default trust is always HOLD.
import { readFileSync, lstatSync } from "node:fs";
import { request as httpsRequest } from "node:https";

export const SOURCE_STATUS_SCHEMA = "KT_SESSION_C_SAFE_STATUS_ONLY_V1";
export const SOURCE_HALT = "HALT_NO_INDEPENDENT_FRESH_MARKET_DATA";
export const PRIVATE_PRODUCT_ORIGIN = "127.0.0.1:9447";
const READ_PATH = "/api/bridge-status-v1";
const MAX_RESPONSE_BYTES = 4096;

function safeFile(path, max, privateFile) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("HOLD_UNAPPROVED_LOCAL_PRODUCT_FILE");
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 ||
      stat.size > max || (privateFile && (stat.mode & 0o077) !== 0)) {
    throw new Error("HOLD_UNSAFE_PRODUCT_LOCAL_FILE");
  }
  return readFileSync(path);
}

export function validateRestrictedStatus(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      body.schema !== SOURCE_STATUS_SCHEMA ||
      body.accessScope !== "NONFINANCIAL_STATUS_ONLY" ||
      body.classification !== "HISTORICAL_PAPER_REPRODUCTION_NOT_LIVE_BOTS" ||
      body.paperStatus !== SOURCE_HALT ||
      body.originalAccounts !== 100 ||
      body.openUnpricedOriginalPositions !== 7 ||
      body.sourceFresh !== false ||
      body.paperNewOrdersAllowed !== false ||
      body.realOrders !== 0 ||
      body.fundedAuthority !== false ||
      body.walletOperationsAllowed !== false ||
      body.woloOperationsAllowed !== false ||
      typeof body.releaseSource !== "string" ||
      !/^[0-9a-f]{7,64}$/.test(body.releaseSource)) {
    throw new Error("HOLD_PRODUCT_READ_MODEL_REJECTED");
  }
  // Return an explicit allowlist: never forward accidental backend extras.
  return Object.freeze({
    schema: SOURCE_STATUS_SCHEMA,
    accessScope: "NONFINANCIAL_STATUS_ONLY",
    paperStatus: SOURCE_HALT,
    sourceClassification: body.classification,
    originalAccounts: 100,
    openUnpricedOriginalPositions: 7,
    sourceFresh: false,
    paperNewOrdersAllowed: false,
    realOrders: 0,
    fundedAuthority: false,
    releaseSource: body.releaseSource,
  });
}

export async function verifiedLocalStatusTransport({ bearer, ca }) {
  return await new Promise((resolve, reject) => {
    let completed = false;
    const fail = () => {
      if (!completed) {
        completed = true;
        reject(new Error("HOLD_RESTRICTED_PRODUCT_TRANSPORT"));
      }
    };
    const req = httpsRequest({
      hostname: "127.0.0.1",
      port: 9447,
      path: READ_PATH,
      method: "GET",
      ca,
      rejectUnauthorized: true,
      timeout: 2500,
      agent: false,
      headers: {
        Host: PRIVATE_PRODUCT_ORIGIN,
        Accept: "application/json",
        "Cache-Control": "no-store",
        Authorization: "Bearer " + bearer,
      },
    }, (response) => {
      if (response.statusCode !== 200 ||
          !String(response.headers["content-type"] || "").startsWith("application/json")) {
        response.resume();
        fail();
        return;
      }
      let size = 0;
      const buffers = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          fail();
          response.destroy();
          return;
        }
        buffers.push(chunk);
      });
      response.on("end", () => {
        if (completed) return;
        completed = true;
        try {
          resolve(JSON.parse(Buffer.concat(buffers).toString("utf8")));
        } catch {
          reject(new Error("HOLD_INVALID_PRODUCT_RESPONSE"));
        }
      });
      response.on("error", fail);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", fail);
    req.end();
  });
}

export async function readRestrictedPaperStatus({
  authorizedAdmin = false,
  releaseAdmitted = false,
  machineCredentialFile = "",
  productCaFile = "",
  transport = verifiedLocalStatusTransport,
} = {}) {
  // Check CURRENT authenticated App permission BEFORE opening local secret
  // files or a network connection. No anonymous website status route.
  if (authorizedAdmin !== true || releaseAdmitted !== true) {
    return Object.freeze({
      ok: false, status: "HOLD_APP_HANDOFF_OR_ADMIN_AUTH",
      paperNewOrdersAllowed: false, realOrders: 0,
    });
  }
  try {
    const token = safeFile(machineCredentialFile, 200, true)
      .toString("ascii").trim();
    if (!/^[A-Za-z0-9_-]{43,160}$/.test(token)) {
      throw new Error("HOLD_PRODUCT_MACHINE_CREDENTIAL_INVALID");
    }
    const ca = safeFile(productCaFile, 12_000, false);
    if (!ca.toString("utf8").includes("BEGIN CERTIFICATE")) {
      throw new Error("HOLD_PRODUCT_TLS_TRUST_MISSING");
    }
    const candidate = await transport({ bearer: token, ca });
    return Object.freeze({
      ok: true, status: "READ_ONLY_PAPER_HALT",
      model: validateRestrictedStatus(candidate),
    });
  } catch {
    // Never leak exception, token, cert paths or server internals to clients.
    return Object.freeze({
      ok: false, status: "HOLD_PRODUCT_READ_MODEL_UNAVAILABLE",
      paperNewOrdersAllowed: false, realOrders: 0,
    });
  }
}
