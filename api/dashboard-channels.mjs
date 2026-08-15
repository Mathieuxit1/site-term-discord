import { getManagedGuild, getSession, json } from "./_dashboard.mjs";

const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ ok: false, message: "Méthode non autorisée." }, 405);
    try {
      const session = await getSession(request);
      if (!session) return json({ ok: false, message: "Connecte-toi avec Discord pour continuer." }, 401);
      const guildId = new URL(request.url).searchParams.get("guild") || "";
      if (!getManagedGuild(session, guildId)) return json({ ok: false, message: "Ce serveur n’est pas accessible depuis ton compte." }, 403);
      const botToken = (process.env.DISCORD_BOT_TOKEN || "").trim();
      if (!botToken) throw new Error("Le bot n’est pas configuré sur le site.");
      const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (!response.ok) throw new Error("Sentinel.exe ne peut pas lire les salons de ce serveur.");
      const channels = (await response.json())
        .filter((channel) => channel.type === 0 || channel.type === 5)
        .map((channel) => ({ id: String(channel.id), name: String(channel.name), type: channel.type }))
        .sort((left, right) => left.name.localeCompare(right.name, "fr"));
      return json({ ok: true, channels });
    } catch (error) {
      console.error("Unable to read guild channels", error);
      return json({ ok: false, message: "Impossible de charger les salons pour le moment." }, 400);
    }
  },
};
