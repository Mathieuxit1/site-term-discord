const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

const COOKIE_MAX_AGE = 60 * 60 * 8;

export const DEFAULT_SETTINGS = Object.freeze({
  security_log_channel_id: null,
  antiraid_enabled: true,
  auto_lockdown_enabled: true,
  risk_quarantine_threshold: 6,
  warning_risk_threshold: 4,
  critical_quarantine_all: true,
  raid_window_seconds: 60,
  raid_warning_joins: 5,
  raid_critical_joins: 10,
  antispam_enabled: true,
  spam_window_seconds: 8,
  spam_message_limit: 6,
  spam_duplicate_limit: 3,
  spam_mention_limit: 5,
  spam_timeout_minutes: 10,
  verification_enabled: false,
  verification_channel_id: null,
  verification_role_id: null,
});

export function json(body, status = 200) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

export function configuredOrigin() {
  const origin = (process.env.DASHBOARD_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin.startsWith("https://")) throw new Error("DASHBOARD_ORIGIN must be an HTTPS URL.");
  return origin;
}

export function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const item of raw.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function sessionCookie(value, maxAge = COOKIE_MAX_AGE) {
  return `sentinel_dashboard_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function oauthStateCookie(value, maxAge = 600) {
  return `sentinel_dashboard_oauth_state=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function randomToken() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

export function equalTokens(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function supabaseConfiguration() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url, key };
}

export async function supabase(path, options = {}) {
  const { url, key } = supabaseConfiguration();
  const headers = new Headers(options.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${message.slice(0, 300)}`);
  }
  return response;
}

export async function createSession({ user, guilds }) {
  const sessionId = randomToken();
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString();
  await supabase("dashboard_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      session_id: sessionId,
      discord_user_id: String(user.id),
      username: String(user.global_name || user.username || "Utilisateur Discord"),
      avatar: typeof user.avatar === "string" ? user.avatar : null,
      guilds,
      expires_at: expiresAt,
    }),
  });
  return sessionId;
}

export async function getSession(request) {
  const sessionId = readCookie(request, "sentinel_dashboard_session");
  if (!sessionId || !/^[a-f0-9]{64}$/i.test(sessionId)) return null;
  const now = encodeURIComponent(new Date().toISOString());
  const query = `dashboard_sessions?session_id=eq.${encodeURIComponent(sessionId)}&expires_at=gt.${now}&select=session_id,discord_user_id,username,avatar,guilds,expires_at`;
  const rows = await (await supabase(query)).json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

export function getManagedGuild(session, guildId) {
  if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return null;
  const guilds = Array.isArray(session?.guilds) ? session.guilds : [];
  return guilds.find((guild) => guild && guild.id === guildId) || null;
}

export function requireInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} est invalide.`);
  }
  return value;
}

export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Réglages invalides.");
  const channelId = input.security_log_channel_id;
  if (channelId !== null && (typeof channelId !== "string" || !/^\d{17,20}$/.test(channelId))) {
    throw new Error("Le salon de journaux est invalide.");
  }
  const verificationChannelId = input.verification_channel_id;
  const verificationRoleId = input.verification_role_id;
  for (const [value, label] of [[verificationChannelId, "Le salon de vérification"], [verificationRoleId, "Le rôle de vérification"]]) {
    if (value !== null && (typeof value !== "string" || !/^\d{17,20}$/.test(value))) {
      throw new Error(`${label} est invalide.`);
    }
  }
  for (const field of ["antiraid_enabled", "auto_lockdown_enabled", "critical_quarantine_all", "antispam_enabled", "verification_enabled"]) {
    if (typeof input[field] !== "boolean") throw new Error(`${field} est invalide.`);
  }
  const settings = {
    security_log_channel_id: channelId,
    antiraid_enabled: input.antiraid_enabled,
    auto_lockdown_enabled: input.auto_lockdown_enabled,
    risk_quarantine_threshold: requireInteger(input.risk_quarantine_threshold, "Le seuil de risque normal", 1, 20),
    warning_risk_threshold: requireInteger(input.warning_risk_threshold, "Le seuil de risque en alerte", 1, 20),
    critical_quarantine_all: input.critical_quarantine_all,
    raid_window_seconds: requireInteger(input.raid_window_seconds, "La fenêtre de raid", 10, 3600),
    raid_warning_joins: requireInteger(input.raid_warning_joins, "Le seuil d’alerte", 2, 100),
    raid_critical_joins: requireInteger(input.raid_critical_joins, "Le seuil critique", 3, 200),
    antispam_enabled: input.antispam_enabled,
    spam_window_seconds: requireInteger(input.spam_window_seconds, "La fenêtre anti-spam", 3, 120),
    spam_message_limit: requireInteger(input.spam_message_limit, "La limite de messages", 2, 30),
    spam_duplicate_limit: requireInteger(input.spam_duplicate_limit, "La limite de doublons", 2, 20),
    spam_mention_limit: requireInteger(input.spam_mention_limit, "La limite de mentions", 1, 50),
    spam_timeout_minutes: requireInteger(input.spam_timeout_minutes, "Le timeout", 1, 10080),
    verification_enabled: input.verification_enabled,
    verification_channel_id: verificationChannelId,
    verification_role_id: verificationRoleId,
  };
  if (settings.raid_critical_joins <= settings.raid_warning_joins) {
    throw new Error("Le seuil critique doit être supérieur au seuil d’alerte.");
  }
  if (settings.verification_enabled && (!settings.verification_channel_id || !settings.verification_role_id)) {
    throw new Error("Choisis un salon et un rôle avant d’activer la vérification.");
  }
  return settings;
}

export async function readJson(request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 8_000) throw new Error("La demande est trop volumineuse.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 8_000) throw new Error("La demande est trop volumineuse.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La demande est invalide.");
  }
}
