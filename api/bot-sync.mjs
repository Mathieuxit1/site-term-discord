import { equalTokens, json, supabase } from "./_dashboard.mjs";

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ ok: false, message: "Méthode non autorisée." }, 405);
    const configuredSecret = (process.env.BOT_DASHBOARD_SYNC_SECRET || "").trim();
    const authorization = request.headers.get("authorization") || "";
    const receivedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!configuredSecret || !equalTokens(receivedSecret, configuredSecret)) {
      return json({ ok: false, message: "Non autorisé." }, 401);
    }
    try {
      const settings = await (await supabase("dashboard_guild_settings?select=*&order=updated_at.asc")).json();
      return json({ ok: true, settings });
    } catch (error) {
      console.error("Unable to provide bot dashboard settings", error);
      return json({ ok: false, message: "Synchronisation indisponible." }, 503);
    }
  },
};
