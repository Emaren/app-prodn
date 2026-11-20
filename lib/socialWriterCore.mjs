// P0 HD-only restricted v2 social writer adapter.
// JWT/session ownership is verified in the private AF_UNIX sidecar.
// This code never receives a caller-supplied actor ID or raw DB credential.
const DIRECT_CHARS = 1000;
const LOBBY_CHARS = 280;
const CLAN_CHARS = 1200;
const ALLOWED_AUDIENCES = Object.freeze({clan: 0, users: 1, public: 2});

class SocialHold extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const hold = (status, code) => { throw new SocialHold(status, code); };
const exact = (value, names) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every(k => names.includes(k)) &&
  Object.keys(value).length <= names.length;
function text(value, max, name) {
  if (typeof value !== "string") hold(400, "INVALID_" + name);
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > max ||
      Buffer.byteLength(normalized, "utf8") > 4 * max)
    hold(400, "INVALID_" + name);
  return normalized;
}
function id(value, nullable = false) {
  if ((value === null || value === undefined) && nullable) return null;
  if (!Number.isSafeInteger(value) || value <= 0) hold(400, "INVALID_MESSAGE_ID");
  return value;
}
function uid(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 100 ||
      !/^[a-zA-Z0-9_.:-]+$/.test(value)) hold(400, "INVALID_TARGET");
  return value;
}
function validateInput(scope, input) {
  if (scope === "clan") {
    if (!exact(input, ["slug", "message", "audience"]) ||
        typeof input.slug !== "string" ||
        !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.slug) ||
        !Object.hasOwn(ALLOWED_AUDIENCES, input.audience))
      hold(400, "INVALID_CLAN_TEXT_REQUEST");
    return {slug: input.slug, message: text(input.message, CLAN_CHARS, "MESSAGE"), audience: input.audience};
  }
  if (scope === "lobby") {
    if (!exact(input, ["message", "requestKey"]) ||
        typeof input.requestKey !== "string" ||
        !/^[0-9a-f]{32}$/.test(input.requestKey))
      hold(400, "INVALID_LOBBY_TEXT_REQUEST");
    return {
      message: text(input.message, LOBBY_CHARS, "LOBBY_MESSAGE"),
      requestKey: input.requestKey,
    };
  }
  if (scope === "direct") {
    if (!exact(input, ["targetUid", "body", "replyToMessageId"]))
      hold(400, "INVALID_DIRECT_TEXT_REQUEST");
    return {
      targetUid: input.targetUid == null ? null : uid(input.targetUid),
      body: text(input.body, DIRECT_CHARS, "MESSAGE"),
      replyToMessageId: id(input.replyToMessageId, true),
    };
  }
  hold(404, "SOCIAL_ACTION_NOT_FOUND");
}

// Only two high-level SECURITY DEFINER operations are accessible to the
// socket's DB role. The NOLOGIN executor owns them; only fixed, privileged
// legacy leaves (owned by the old table owner) perform minimal approved DML.
// No legacy table, sequence, broad view or direct arbitrary SQL access here.
const CLAN_CALL = "SELECT aoe2war_social_hd_v2.clan_text($1::text,$2::text,$3::text,$4::text) AS decision";
const DIRECT_CALL = "SELECT aoe2war_social_hd_v2.direct_text($1::text,$2::text,$3::text,$4::integer) AS decision";
// Separately admitted Lobby V1 function, same isolated social role,
// no raw chat-message INSERT/sequence grant or caller-selected UID.
const LOBBY_CALL = "SELECT aoe2war_lobby_hd_v1.post_text($1::text,$2::text,$3::text) AS decision";
const ALLOWED_DENIALS = new Set([400, 401, 403, 404, 429, 503]);

function validateDecision(result, scope) {
  const decision = result?.rows?.[0]?.decision;
  if (!exact(decision, ["status", "body"]) ||
      !Number.isInteger(decision.status) || !exact(decision.body,
        scope === "clan"
          ? ["ok", "messageId", "clanSlug", "replayed", "detail"]
          : ["ok", "messageId", "targetUid", "replayed", "detail"]))
    hold(503, "SOCIAL_V2_INVALID_DATABASE_RESULT");
  const {status, body} = decision;
  if (status === 201) {
    if (body.ok !== true || !Number.isSafeInteger(body.messageId) ||
        body.messageId < 1 || typeof (scope === "clan" ? body.clanSlug : body.targetUid) !== "string" ||
        (body.replayed !== undefined && body.replayed !== true))
      hold(503, "SOCIAL_V2_INVALID_DATABASE_RESULT");
    return {status, body};
  }
  if (ALLOWED_DENIALS.has(status) && typeof body.detail === "string" &&
      /^[A-Z0-9_]{2,80}$/.test(body.detail))
    return {status, body: {detail: body.detail}};
  hold(503, "SOCIAL_V2_INVALID_DATABASE_RESULT");
}

function validateLobbyDecision(result) {
  const decision = result?.rows?.[0]?.decision;
  if (!exact(decision, ["status", "ok", "messageId", "replayed", "detail"]) ||
      !Number.isInteger(decision.status))
    hold(503, "LOBBY_V1_INVALID_DATABASE_RESULT");
  if (decision.status === 201) {
    if (decision.ok !== true || !Number.isSafeInteger(decision.messageId) ||
        decision.messageId < 1 || typeof decision.replayed !== "boolean")
      hold(503, "LOBBY_V1_INVALID_DATABASE_RESULT");
    return {status:201,body:{ok:true,messageId:decision.messageId,replayed:decision.replayed}};
  }
  if (new Set([400, 401, 403, 404, 409, 429, 503]).has(decision.status) &&
      typeof decision.detail === "string" &&
      /^[A-Z0-9_]{2,80}$/.test(decision.detail))
    return {status:decision.status,body:{detail:decision.detail}};
  hold(503, "LOBBY_V1_INVALID_DATABASE_RESULT");
}

export async function executeSocialTextWrite({
  pool, verifySession, sessionToken, scope, input, onError,
}) {
  let client, began = false;
  try {
    // Invalid request and unsigned identity fail BEFORE DB open. Never accept
    // any user-provided sender, author, caller role or conversation ID.
    const action = validateInput(scope, input);
    if (typeof sessionToken !== "string" ||
        sessionToken.length < 32 || sessionToken.length > 4096)
      hold(401, "SIGNED_SESSION_REQUIRED");
    let verifiedUid;
    try { verifiedUid = uid(await verifySession(sessionToken)); }
    catch { hold(401, "INVALID_SIGNED_SESSION"); }

    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    began = true;
    await client.query("SET LOCAL statement_timeout = '1500ms'");
    await client.query("SET LOCAL lock_timeout = '350ms'");
    const decision = scope === "clan"
      ? await client.query(CLAN_CALL, [verifiedUid, action.slug, action.message, action.audience])
      : scope === "direct"
        ? await client.query(DIRECT_CALL, [
            verifiedUid, action.targetUid, action.body, action.replyToMessageId,
          ])
        : await client.query(LOBBY_CALL, [
            verifiedUid, action.message, action.requestKey,
          ]);
    const response = scope === "lobby"
      ? validateLobbyDecision(decision)
      : validateDecision(decision, scope);
    if (response.status === 201) {
      await client.query("COMMIT");
      began = false;
      return response;
    }
    // Always rollback even an SQL-reported business denial, guaranteeing
    // no incidental conversation/participant writes survive a denied request.
    await client.query("ROLLBACK");
    began = false;
    return response;
  } catch (error) {
    if (began) { try { await client.query("ROLLBACK"); } catch { /* best effort */ } }
    if (error instanceof SocialHold) return {status: error.status, body: {detail: error.code}};
    if (error?.code === "40001" || error?.code === "55P03")
      return {status: 409, body: {detail: "SOCIAL_RETRY_SAFELY"}};
    onError?.(typeof error?.code === "string" ? error.code : "UNEXPECTED_SOCIAL_ERROR");
    return {status: 503, body: {detail: "SOCIAL_WRITER_UNAVAILABLE"}};
  } finally { client?.release(); }
}
