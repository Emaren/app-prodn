import { type NextRequest } from "next/server";

const STEAM_OPENID_NS = "http://specs.openid.net/auth/2.0";
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_IDENTITY_PREFIX = "https://steamcommunity.com/openid/id/";
const STEAM_IDENTITY_SELECT = `${STEAM_OPENID_NS}/identifier_select`;
const STEAM_IDENTITY_REGEX = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

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

  const response = await fetch(xmlUrl, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const xml = await response.text().catch(() => "");
  return extractPersonaFromXml(xml);
}

function getProto(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto;
  return request.nextUrl.protocol.replace(":", "") || "https";
}

export function getAppBaseUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  return `${getProto(request)}://${host}`;
}

export function sanitizeReturnTo(value: string | null | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export function buildSteamAuthUrl(request: NextRequest, returnTo: string) {
  const baseUrl = getAppBaseUrl(request);
  const callbackUrl = new URL("/api/auth/steam", baseUrl);
  callbackUrl.searchParams.set("returnTo", sanitizeReturnTo(returnTo));

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
  if (!claimedId?.startsWith(STEAM_IDENTITY_PREFIX)) {
    throw new Error("Unexpected Steam claimed identity");
  }
  if (!identity?.startsWith(STEAM_IDENTITY_PREFIX)) {
    throw new Error("Unexpected Steam identity");
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
  });

  if (!response.ok) {
    throw new Error(`Steam verification failed with ${response.status}`);
  }

  const body = await response.text();
  if (!/\bis_valid\s*:\s*true\b/i.test(body)) {
    throw new Error("Steam did not validate the OpenID response");
  }

  const steamId = parseSteamId(request);
  if (!steamId) {
    throw new Error("Steam callback did not include a valid Steam ID");
  }

  return steamId;
}

export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const apiKey = process.env.STEAM_API_KEY?.trim();
  if (apiKey) {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamids", steamId);

    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as
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
