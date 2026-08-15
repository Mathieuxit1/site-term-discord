import { configuredOrigin, oauthStateCookie, randomToken, redirect } from "./_dashboard.mjs";

export default {
  async fetch() {
    try {
      const clientId = (process.env.DISCORD_OAUTH_CLIENT_ID || "").trim();
      if (!clientId) throw new Error("Discord OAuth is not configured.");
      const origin = configuredOrigin();
      const state = randomToken();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${origin}/api/dashboard-callback`,
        response_type: "code",
        scope: "identify guilds",
        state,
        prompt: "consent",
      });
      return redirect(`https://discord.com/oauth2/authorize?${params}`, [oauthStateCookie(state)]);
    } catch (error) {
      console.error("Dashboard login setup failed", error);
      return new Response("Le tableau de bord n’est pas encore configuré.", { status: 503 });
    }
  },
};
