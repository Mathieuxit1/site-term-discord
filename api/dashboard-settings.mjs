import {
  DEFAULT_SETTINGS,
  getManagedGuild,
  getSession,
  json,
  readJson,
  supabase,
  validateSettings,
} from "./_dashboard.mjs";

async function authorizedSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json({ ok: false, message: "Connecte-toi avec Discord pour continuer." }, 401) };
  return { session };
}

function selectedGuild(request, session) {
  const guildId = new URL(request.url).searchParams.get("guild") || "";
  return getManagedGuild(session, guildId);
}

export default {
  async fetch(request) {
    try {
      const auth = await authorizedSession(request);
      if (auth.error) return auth.error;
      const guild = selectedGuild(request, auth.session);
      if (!guild) return json({ ok: false, message: "Ce serveur n’est pas accessible depuis ton compte." }, 403);

      if (request.method === "GET") {
        const query = `dashboard_guild_settings?guild_id=eq.${encodeURIComponent(guild.id)}&select=*&limit=1`;
        const rows = await (await supabase(query)).json();
        return json({ ok: true, guild, settings: { ...DEFAULT_SETTINGS, ...(rows[0] || {}) } });
      }

      if (request.method !== "PUT") return json({ ok: false, message: "Méthode non autorisée." }, 405);
      const settings = validateSettings(await readJson(request));
      const payload = { guild_id: guild.id, ...settings, updated_at: new Date().toISOString() };
      const response = await supabase("dashboard_guild_settings?on_conflict=guild_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      const rows = await response.json();
      return json({ ok: true, guild, settings: rows[0] || payload });
    } catch (error) {
      console.error("Dashboard settings request failed", error);
      return json({ ok: false, message: "Impossible d’enregistrer ou de lire les réglages pour le moment." }, 400);
    }
  },
};
