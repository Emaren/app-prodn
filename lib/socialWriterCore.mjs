// P0 social text-only writer. Exact SQL, exact operations. Never financial.
const DIRECT_CHARS = 4000;
const CLAN_CHARS = 1200;
const ALLOWED_AUDIENCES = Object.freeze({clan: 0, users: 1, public: 2});
// Mirror the immutable reserved identities in lib/internalSystemAccounts.ts.
// The detached writer cannot depend on Next.js aliases or TS compilation.
const RESERVED_SOCIAL_UIDS = new Set([
  "aoe2hd_ai_concierge", "aoe2hd_ai_grimer", "aoe2hd_ai_guy",
  "aoe2hd_ai_clan_aoe2war_hall_scribe",
  "aoe2hd_betting_bot_tony", "aoe2hd_betting_bot_paulie",
  "aoe2hd_betting_bot_tommy", "aoe2hd_betting_bot_henry",
  "aoe2hd-moose", "challenge-protocol",
]);
const isInternalIdentity = (value) =>
  RESERVED_SOCIAL_UIDS.has(value) ||
  /^aoe2hd_ai_clan_[a-z0-9_-]+_hall_scribe$/.test(value) ||
  /^aoe2hd_ai_/.test(value);

class SocialHold extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const hold = (status, code) => { throw new SocialHold(status, code); };
const exact = (value, names) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every((k) => names.includes(k)) &&
  Object.keys(value).length <= names.length;
function text(value, max, name) {
  if (typeof value !== "string") hold(400, "INVALID_" + name);
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > max || Buffer.byteLength(normalized, "utf8") > 4 * max)
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
const one = async (db, sql, values) => (await db.query(sql, values)).rows[0] ?? null;
function validateInput(scope, input) {
  if (scope === "clan") {
    if (!exact(input, ["slug", "message", "audience"]) ||
        typeof input.slug !== "string" ||
        !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.slug) ||
        !Object.hasOwn(ALLOWED_AUDIENCES, input.audience)) {
      hold(400, "INVALID_CLAN_TEXT_REQUEST");
    }
    return {slug: input.slug, message: text(input.message, CLAN_CHARS, "MESSAGE"), audience: input.audience};
  }
  if (scope === "direct") {
    if (!exact(input, ["targetUid", "body", "replyToMessageId"])) hold(400, "INVALID_DIRECT_TEXT_REQUEST");
    const targetUid = input.targetUid == null ? null : uid(input.targetUid);
    return {targetUid, body: text(input.body, DIRECT_CHARS, "MESSAGE"), replyToMessageId: id(input.replyToMessageId, true)};
  }
  hold(404, "SOCIAL_ACTION_NOT_FOUND");
}
async function clanText(db, viewer, input) {
  const clan = await one(db,
    "SELECT id, chat_audience_policy AS policy FROM public.clans WHERE slug=$1 AND status='active'",
    [input.slug]);
  if (!clan) hold(404, "CLAN_NOT_FOUND");
  const member = await one(db,
    "SELECT role FROM public.clan_members WHERE clan_id=$1 AND user_id=$2 AND status='active'",
    [clan.id, viewer.id]);
  const policy = Object.hasOwn(ALLOWED_AUDIENCES, clan.policy) ? clan.policy : "public";
  if (ALLOWED_AUDIENCES[input.audience] > ALLOWED_AUDIENCES[policy]) hold(403, "CLAN_POLICY_DENIED");
  if (input.audience === "clan" && !member && !viewer.is_admin) hold(403, "CLAN_MEMBERSHIP_REQUIRED");
  // Serialize author-specific cooldown. Neither client nor SQL caller supplies an author.
  await db.query("SELECT pg_catalog.pg_advisory_xact_lock(84912, $1::integer)", [viewer.id]);
  const recent = await one(db,
    "SELECT id,body,audience,created_at FROM public.clan_messages WHERE clan_id=$1 AND author_user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
    [clan.id, viewer.id]);
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 3000) {
    // An uncertain network acknowledgement must not turn a retry into a duplicate.
    if (recent.body === input.message && recent.audience === input.audience)
      return {messageId: recent.id, clanSlug: input.slug, replayed: true};
    hold(429, "CLAN_SEND_COOLDOWN");
  }
  const row = await one(db,
    "INSERT INTO public.clan_messages(clan_id,author_user_id,body,audience,created_at,updated_at) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()) RETURNING id",
    [clan.id, viewer.id, input.message, input.audience]);
  return {messageId: row.id, clanSlug: input.slug};
}
async function directText(db, viewer, input) {
  let recipient;
  if (input.targetUid) {
    recipient = await one(db,
      "SELECT id,uid,is_admin,verification_method FROM public.users WHERE uid=$1",
      [input.targetUid]);
  } else {
    recipient = await one(db,
      "SELECT id,uid,is_admin,verification_method FROM public.users WHERE is_admin=true ORDER BY CASE WHEN lower(coalesce(in_game_name,''))='emaren' OR lower(coalesce(steam_persona_name,''))='emaren' THEN 0 ELSE 1 END,created_at,id LIMIT 1",
      []);
  }
  if (!recipient) hold(404, "DIRECT_RECIPIENT_NOT_FOUND");
  if (recipient.id === viewer.id) hold(400, "CANNOT_MESSAGE_SELF");
  if (recipient.verification_method === "system" ||
      isInternalIdentity(recipient.uid)) hold(403, "DIRECT_HUMAN_ONLY_V1");
  const pairKey = [Number(viewer.id), Number(recipient.id)].sort((a,b)=>a-b).join(":");
  // User IDs are database-derived. A caller cannot select a conversation by ID.
  await db.query("SELECT pg_catalog.pg_advisory_xact_lock(84913, $1::integer)", [viewer.id]);
  await db.query(
    "INSERT INTO public.direct_conversations(pair_key,created_at,updated_at) VALUES ($1,clock_timestamp(),clock_timestamp()) ON CONFLICT(pair_key) DO NOTHING",
    [pairKey]);
  const conversation = await one(db,
    "SELECT id FROM public.direct_conversations WHERE pair_key=$1", [pairKey]);
  if (!conversation) hold(503, "DIRECT_CONVERSATION_UNAVAILABLE");
  await db.query(
    "INSERT INTO public.direct_conversation_participants(conversation_id,user_id,joined_at) VALUES ($1,$2,clock_timestamp()),($1,$3,clock_timestamp()) ON CONFLICT(conversation_id,user_id) DO NOTHING",
    [conversation.id, viewer.id, recipient.id]);
  if (input.replyToMessageId) {
    const parent = await one(db,
      "SELECT id FROM public.direct_messages WHERE id=$1 AND conversation_id=$2",
      [input.replyToMessageId, conversation.id]);
    if (!parent) hold(400, "REPLY_OUTSIDE_CONVERSATION");
  }
  const recent = await one(db,
    "SELECT id,body,reply_to_message_id,created_at FROM public.direct_messages WHERE conversation_id=$1 AND sender_user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
    [conversation.id, viewer.id]);
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 1000) {
    if (recent.body === input.body &&
        (recent.reply_to_message_id ?? null) === input.replyToMessageId)
      return {messageId:recent.id,targetUid:recipient.uid,replayed:true};
    hold(429, "DIRECT_SEND_COOLDOWN");
  }
  const row = await one(db,
    "INSERT INTO public.direct_messages(conversation_id,sender_user_id,body,reply_to_message_id,created_at) VALUES ($1,$2,$3,$4,clock_timestamp()) RETURNING id",
    [conversation.id, viewer.id, input.body, input.replyToMessageId]);
  await db.query("UPDATE public.direct_conversations SET updated_at=clock_timestamp() WHERE id=$1", [conversation.id]);
  await db.query("UPDATE public.direct_conversation_participants SET last_read_at=clock_timestamp(), typing_updated_at=NULL WHERE conversation_id=$1 AND user_id=$2",
    [conversation.id,viewer.id]);
  await db.query("DELETE FROM public.direct_message_drafts WHERE conversation_id=$1 AND user_id=$2",
    [conversation.id,viewer.id]);
  return {messageId: row.id, targetUid: recipient.uid};
}
export async function executeSocialTextWrite({pool, verifySession, sessionToken, scope, input, onError}) {
  let client, began = false;
  try {
    // Do not open a database connection before the bounded request and JWT pass.
    const action = validateInput(scope, input);
    if (typeof sessionToken !== "string" || sessionToken.length < 32 || sessionToken.length > 4096)
      hold(401, "SIGNED_SESSION_REQUIRED");
    let signedUid;
    try { signedUid = uid(await verifySession(sessionToken)); }
    catch { hold(401, "INVALID_SIGNED_SESSION"); }
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    began = true;
    await client.query("SET LOCAL statement_timeout = '1500ms'");
    await client.query("SET LOCAL lock_timeout = '350ms'");
    const viewer = await one(client,
      "SELECT id,uid,is_admin,verification_method FROM public.users WHERE uid=$1", [signedUid]);
    if (!viewer || viewer.verification_method === "system" ||
        isInternalIdentity(viewer.uid)) hold(401, "SIGNED_IN_HUMAN_REQUIRED");
    const result = scope === "clan" ? await clanText(client, viewer, action) : await directText(client, viewer, action);
    await client.query("COMMIT");
    began = false;
    return {status: 201, body: {ok: true, ...result}};
  } catch (error) {
    if (began) { try { await client.query("ROLLBACK"); } catch { /* best effort */ } }
    if (error instanceof SocialHold) return {status: error.status, body: {detail: error.code}};
    if (error?.code === "40001" || error?.code === "55P03") return {status: 409, body: {detail: "SOCIAL_RETRY_SAFELY"}};
    onError?.(typeof error?.code === "string" ? error.code : "UNEXPECTED_SOCIAL_ERROR");
    return {status: 503, body: {detail: "SOCIAL_WRITER_UNAVAILABLE"}};
  } finally { client?.release(); }
}
