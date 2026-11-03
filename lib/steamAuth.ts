import { type NextRequest } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { PRODUCTION_WEB_ORIGIN, usesNonfinancialProductionAuth } from "@/lib/productionAuth";

const STEAM_OPENID_NS = "http://specs.openid.net/auth/2.0";
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_IDENTITY_PREFIX = "https://steamcommunity.com/openid/id/";
const STEAM_IDENTITY_SELECT = `${STEAM_OPENID_NS}/identifier_select`;
const STEAM_IDENTITY_REGEX = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;
export const STEAM_AUTH_STATE_COOKIE = "__Host-aoe2war_steam_state";
const STATE = /^[A-Za-z0-9_-]{43}$/;

export function newSteamAuthState() {
  return randomBytes(32).toString("base64url");
}

async function boundedSteamText(response: Response, maximum: number) {
  if (!response.body) throw new Error("Steam response was empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw new Error("Steam response exceeded its bound");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

type SteamProfile = {
  steamId: string;
  personaName: string | null;
};

function extractPersonaFromXml(xml: string) {
  const match = xml.match(
    /<steamID>\s*(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))\s*<\/steamID>/i
  );
  const value = match?.[1] || match?.[2] || "";
  return value.trim() || null;
}

async function fetchSteamPersonaFromCommunity(steamId: string) {
  const xmlUrl = new URL(`https://steamcommunity.com/profiles/${steamId}`);
  xmlUrl.searchParams.set("xml", "1");

  const response = await fetch(xmlUrl, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    return null;
  }

  const xml = await boundedSteamText(response, 131072);
  return extractPersonaFromXml(xml);
}

function getProto(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto;
  return request.nextUrl.protocol.replace(":", "") || "https";
}

export function getAppBaseUrl(request: NextRequest) {
  if (usesNonfinancialProductionAuth()) return PRODUCTION_WEB_ORIGIN;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  return `${getProto(request)}://${host}`;
}

export function sanitizeReturnTo(value: string | null | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    if (/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return "/";
    if (new URL(value, PRODUCTION_WEB_ORIGIN).origin !== PRODUCTION_WEB_ORIGIN) return "/";
  } catch { return "/"; }
  return value;
}

export function buildSteamAuthUrl(request: NextRequest, returnTo: string, state: string) {
  if (!STATE.test(state)) throw new Error("Steam browser state is invalid");
  const baseUrl = getAppBaseUrl(request);
  const callbackUrl = new URL("/api/auth/steam", baseUrl);
  callbackUrl.searchParams.set("returnTo", sanitizeReturnTo(returnTo));
  callbackUrl.searchParams.set("state", state);

  const params = new URLSearchParams({
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl.toString(),
    "openid.realm": `${baseUrl}/`,
    "openid.identity": STEAM_IDENTITY_SELECT,
    "openid.claimed_id": STEAM_IDENTITY_SELECT,
  });

  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export function requestLooksLikeSteamCallback(request: NextRequest) {
  return request.nextUrl.searchParams.has("openid.mode");
}

function parseSteamId(request: NextRequest) {
  const claimedId =
    request.nextUrl.searchParams.get("openid.claimed_id") ||
    request.nextUrl.searchParams.get("openid.identity");
  if (!claimedId) return null;

  const match = claimedId.match(STEAM_IDENTITY_REGEX);
  return match?.[1] || null;
}

function assertCallbackLooksValid(request: NextRequest) {
  for (const key of request.nextUrl.searchParams.keys()) {
    if (request.nextUrl.searchParams.getAll(key).length !== 1) throw new Error("Duplicate Steam response field");
  }
  const opEndpoint = request.nextUrl.searchParams.get("openid.op_endpoint");
  const claimedId = request.nextUrl.searchParams.get("openid.claimed_id");
  const identity = request.nextUrl.searchParams.get("openid.identity");
  const namespace = request.nextUrl.searchParams.get("openid.ns");

  if (opEndpoint !== STEAM_OPENID_ENDPOINT) {
    throw new Error("Unexpected Steam OpenID endpoint");
  }
  if (namespace !== STEAM_OPENID_NS) {
    throw new Error("Unexpected Steam OpenID namespace");
  }
  if (!claimedId?.startsWith(STEAM_IDENTITY_PREFIX) || !/^https:\/\/steamcommunity\.com\/openid\/id\/[0-9]{17}$/.test(claimedId)) {
    throw new Error("Unexpected Steam claimed identity");
  }
  if (identity !== claimedId) {
    throw new Error("Unexpected Steam identity");
  }
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const browserState = request.cookies.get(STEAM_AUTH_STATE_COOKIE)?.value ?? "";
  if (!STATE.test(state) || !STATE.test(browserState) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(browserState))) {
    throw new Error("Steam response is not bound to this browser");
  }
  const expectedReturn = new URL("/api/auth/steam", getAppBaseUrl(request));
  expectedReturn.searchParams.set("returnTo", sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo")));
  expectedReturn.searchParams.set("state", state);
  if (request.nextUrl.searchParams.get("openid.return_to") !== expectedReturn.toString()) {
    throw new Error("Steam return URL does not match this login");
  }
  const signed = new Set((request.nextUrl.searchParams.get("openid.signed") ?? "").split(","));
  for (const field of ["op_endpoint", "return_to", "response_nonce", "assoc_handle", "claimed_id", "identity"]) {
    if (!signed.has(field)) throw new Error("Steam response did not sign all identity fields");
  }
  const nonce = request.nextUrl.searchParams.get("openid.response_nonce") ?? "";
  if (nonce.length > 255 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z[!-~]+$/.test(nonce)) {
    throw new Error("Steam response nonce is malformed");
  }
  const timestamp = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(timestamp) || timestamp < Date.now() - 300000 || timestamp > Date.now() + 30000) {
    throw new Error("Steam response nonce expired or is in the future");
  }
  if (!request.nextUrl.searchParams.get("openid.assoc_handle") || !request.nextUrl.searchParams.get("openid.sig")) {
    throw new Error("Steam response signature is missing");
  }
}

export async function verifySteamCallback(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("openid.mode");
  if (mode === "cancel") {
    throw new Error("Steam sign-in was cancelled");
  }
  if (mode !== "id_res") {
    throw new Error("Steam callback is missing a successful OpenID response");
  }

  assertCallbackLooksValid(request);

  const params = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (!key.startsWith("openid.")) continue;
    params.set(key, value);
  }
  params.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Steam verification failed with ${response.status}`);
  }

  const body = await boundedSteamText(response, 8192);
  const valid = body.split(/\r?\n/).filter((line) => line.startsWith("is_valid:"));
  if (valid.length !== 1 || valid[0] !== "is_valid:true") {
    throw new Error("Steam did not validate the OpenID response");
  }

  const steamId = parseSteamId(request);
  if (!steamId) {
    throw new Error("Steam callback did not include a valid Steam ID");
  }

  return steamId;
}

export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  if (!/^[0-9]{17}$/.test(steamId)) throw new Error("Invalid Steam identity");
  const apiKey = process.env.STEAM_API_KEY?.trim();
  if (apiKey && !usesNonfinancialProductionAuth()) {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamids", steamId);

    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const payload = (await boundedSteamText(response, 131072).then((body) => JSON.parse(body)).catch(() => null)) as
        | { response?: { players?: Array<{ personaname?: string }> } }
        | null;

      const personaName = payload?.response?.players?.[0]?.personaname?.trim() || null;
      if (personaName) {
        return { steamId, personaName };
      }
    }
  }

  const personaName = await fetchSteamPersonaFromCommunity(steamId).catch(() => null);
  return { steamId, personaName };
}
