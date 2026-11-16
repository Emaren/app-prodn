// Source-only C03 boundary: standalone, nonfinancial appearance writer domain.
// The production Next.js process must never import the privileged DB pool.
export const APPEARANCE_CAMPAIGN = Object.freeze({
  previousKey: "october-black-2026",
  campaignKey: "november-crimson-2026",
  label: "November Ember Reign 2026",
  themeKey: "crimson",
  startsAt: "2026-11-01T06:00:00.000Z",
  endsAt: "2026-12-01T07:00:00.000Z",
});
export const THEME_KEYS = Object.freeze([
  "black", "grey", "white", "sepia", "walnut", "crimson", "midnight",
]);
const themeSet = new Set(THEME_KEYS);
const forbiddenKeys = new Set(["userId", "uid", "isAdmin", "actorId", "updatedByUserId", "sql"]);
const exactKeys = (obj, allowed) => Object.keys(obj).every(k => allowed.includes(k) && !forbiddenKeys.has(k));
export function parseAppearanceAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.action === "activateNovember" && exactKeys(value, ["action"])) {
    return { action: "activateNovember" };
  }
  if (value.action === "setNovemberEnabled" &&
      exactKeys(value, ["action", "enabled"]) && typeof value.enabled === "boolean") {
    return { action: "setNovemberEnabled", enabled: value.enabled };
  }
  if (value.action === "setPersonalOverride" &&
      exactKeys(value, ["action", "campaignKey", "themeKey"]) &&
      value.campaignKey === APPEARANCE_CAMPAIGN.campaignKey &&
      themeSet.has(value.themeKey)) {
    return { action: "setPersonalOverride", campaignKey: value.campaignKey, themeKey: value.themeKey };
  }
  return null;
}
const deny = (status, code) => ({ status, body: { detail: code } });
const dateString = x => x instanceof Date ? x.toISOString() : new Date(x).toISOString();
const authoritativeCampaign = row => ({
  campaignKey: row.campaign_key, label: row.label, themeKey: row.theme_key,
  enabled: row.enabled, startsAt: dateString(row.starts_at),
  endsAt: dateString(row.ends_at), updatedAt: dateString(row.updated_at),
  active: !!row.enabled && Date.now() >= new Date(row.starts_at).getTime() &&
    Date.now() < new Date(row.ends_at).getTime(),
  excludedPaths: ["/academy", "/statistics", "/traffic", "/speed"],
});
const campaignColumns =
  "campaign_key, label, enabled, theme_key, starts_at, ends_at, updated_at";
function requirePgRow(result) {
  if (!result || result.rowCount !== 1 || !result.rows?.[0]) throw new Error("WRITER_DB_INVARIANT");
  return result.rows[0];
}
export async function executeAppearanceAction({ pool, verifySignedSession, token, action, now = () => new Date() }) {
  const parsed = parseAppearanceAction(action);
  if (!parsed) return deny(400, "INVALID_APPEARANCE_ACTION");
  if (typeof token !== "string" || token.length < 32 || token.length > 4096) {
    return deny(401, "SIGNED_SESSION_REQUIRED");
  }
  let uid;
  try {
    uid = await verifySignedSession(token);
  } catch { return deny(401, "SIGNED_SESSION_REQUIRED"); }
  if (typeof uid !== "string" || !uid || uid.length > 100) {
    return deny(401, "SIGNED_SESSION_REQUIRED");
  }
  let client;
  let began = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    began = true;
    // Never trust actor UID, admin flag, user ID, or campaign dates from HTTP JSON.
    const actor = await client.query(
      "SELECT id, uid, is_admin FROM public.users WHERE uid = $1", [uid]);
    if (actor.rowCount !== 1 || actor.rows[0].uid !== uid) {
      await client.query("ROLLBACK"); began = false; return deny(403, "SUBJECT_NOT_FOUND");
    }
    const userId = actor.rows[0].id;
    const isAdmin = actor.rows[0].is_admin === true;
    if (parsed.action !== "setPersonalOverride" && !isAdmin) {
      await client.query("ROLLBACK"); began = false; return deny(403, "ADMINISTRATOR_REQUIRED");
    }
    // Single row lock + compare-and-swap; never allow a second campaign slot.
    const state = await client.query(
      "SELECT " + campaignColumns + " FROM public.site_theme_campaign WHERE slot = 1 FOR UPDATE");
    if (state.rowCount !== 1) {
      await client.query("ROLLBACK"); began = false; return deny(409, "CAMPAIGN_SINGLETON_UNAVAILABLE");
    }
    const campaign = state.rows[0];
    if (parsed.action === "activateNovember") {
      if (![APPEARANCE_CAMPAIGN.previousKey, APPEARANCE_CAMPAIGN.campaignKey].includes(campaign.campaign_key)) {
        await client.query("ROLLBACK"); began = false; return deny(409, "CAMPAIGN_TRANSITION_DENIED");
      }
      const updated = requirePgRow(await client.query(
        "UPDATE public.site_theme_campaign SET campaign_key = $1, label = $2, theme_key = $3, enabled = TRUE, " +
          "starts_at = $4, ends_at = $5, updated_by_user_id = $6, updated_at = NOW() " +
          "WHERE slot = 1 AND campaign_key = $7 RETURNING " + campaignColumns,
        [APPEARANCE_CAMPAIGN.campaignKey, APPEARANCE_CAMPAIGN.label, APPEARANCE_CAMPAIGN.themeKey,
         APPEARANCE_CAMPAIGN.startsAt, APPEARANCE_CAMPAIGN.endsAt, userId, campaign.campaign_key]
      ));
      await client.query("COMMIT"); began = false;
      return { status: 200, body: { campaign: authoritativeCampaign(updated), stats: null, overrides: [] } };
    }
    if (parsed.action === "setNovemberEnabled") {
      if (campaign.campaign_key !== APPEARANCE_CAMPAIGN.campaignKey) {
        await client.query("ROLLBACK"); began = false; return deny(409, "NOVEMBER_NOT_ACTIVE_CAMPAIGN");
      }
      const updated = requirePgRow(await client.query(
        "UPDATE public.site_theme_campaign SET enabled = $1, updated_by_user_id = $2, updated_at = NOW() " +
          "WHERE slot = 1 AND campaign_key = $3 RETURNING " + campaignColumns,
        [parsed.enabled, userId, APPEARANCE_CAMPAIGN.campaignKey]
      ));
      await client.query("COMMIT"); began = false;
      return { status: 200, body: { campaign: authoritativeCampaign(updated), stats: null, overrides: [] } };
    }
    if (campaign.campaign_key !== APPEARANCE_CAMPAIGN.campaignKey ||
        campaign.enabled !== true ||
        now().getTime() < new Date(campaign.starts_at).getTime() ||
        now().getTime() >= new Date(campaign.ends_at).getTime()) {
      await client.query("ROLLBACK"); began = false; return deny(409, "CAMPAIGN_NOT_ACTIVE");
    }
    // Current authenticated DB subject only; no actor or subject ID parameter.
    const saved = requirePgRow(await client.query(
      "INSERT INTO public.user_theme_campaign_overrides " +
      "(campaign_key, user_id, theme_key, created_at, updated_at) " +
      "VALUES ($1, $2, $3, NOW(), NOW()) " +
      "ON CONFLICT (campaign_key, user_id) DO UPDATE " +
      "SET theme_key = EXCLUDED.theme_key, updated_at = NOW() " +
      "RETURNING campaign_key, user_id, theme_key, updated_at",
      [parsed.campaignKey, userId, parsed.themeKey]
    ));
    // Mandatory audit is in the SAME PostgreSQL transaction. Any failure must
    // rollback the preference even if the upsert itself succeeded.
    await client.query(
      "INSERT INTO public.user_activity_events " +
      "(user_id, type, path, label, metadata, created_at) " +
      "VALUES ($1, 'theme_campaign_override', '/api/user/theme-campaign-override', $2, $3::jsonb, NOW())",
      [userId, parsed.campaignKey + "/" + parsed.themeKey,
        JSON.stringify({ campaignKey: parsed.campaignKey, themeKey: parsed.themeKey,
          campaignThemeKey: campaign.theme_key })]
    );
    await client.query("COMMIT"); began = false;
    return { status: 200, body: {
      campaignKey: saved.campaign_key, themeKey: saved.theme_key,
      updatedAt: dateString(saved.updated_at),
    }};
  } catch (error) {
    if (began && client) {
      try { await client.query("ROLLBACK"); } catch { /* DB outage: return HOLD. */ }
    }
    // 40001 and 40P01 are expected fail-closed concurrent races; the caller
    // may explicitly retry with a fresh authenticated request.
    if (error?.code === "40001" || error?.code === "40P01") {
      return deny(409, "CONCURRENT_CAMPAIGN_CHANGE");
    }
    return deny(503, "APPEARANCE_WRITER_UNAVAILABLE");
  } finally {
    if (client) client.release();
  }
}
