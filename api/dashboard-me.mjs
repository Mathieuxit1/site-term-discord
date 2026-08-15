import { getSession, json } from "./_dashboard.mjs";

export default {
  async fetch(request) {
    try {
      const session = await getSession(request);
      if (!session) return json({ authenticated: false });
      return json({
        authenticated: true,
        user: { id: session.discord_user_id, username: session.username, avatar: session.avatar },
        guilds: Array.isArray(session.guilds) ? session.guilds : [],
      });
    } catch (error) {
      console.error("Unable to read dashboard session", error);
      return json({ authenticated: false }, 503);
    }
  },
};
