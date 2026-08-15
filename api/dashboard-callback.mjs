import {
  configuredOrigin,
  createSession,
  equalTokens,
  oauthStateCookie,
  readCookie,
  redirect,
  sessionCookie,
} from "./_dashboard.mjs";

const DISCORD_API = "https://discord.com/api/v10";
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

function canManageGuild(guild) {
  if (guild.owner === true) return true;
  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR || (permissions & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

async function discordJson(path, accessToken) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Discord request failed (${response.status}).`);
  return response.json();
}

export default {
  async fetch(request) {
    const origin = configuredOrigin();
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const expectedState = readCookie(request, "sentinel_dashboard_oauth_state");
    const code = url.searchParams.get("code");
    const clearState = oauthStateCookie("", 0);
    if (!code || !state || !expectedState || !equalTokens(state, expectedState)) {
      return redirect(`${origin}/panel?error=connexion`, [clearState]);
    }

    try {
      const clientId = (process.env.DISCORD_OAUTH_CLIENT_ID || "").trim();
      const clientSecret = (process.env.DISCORD_OAUTH_CLIENT_SECRET || "").trim();
      if (!clientId || !clientSecret) throw new Error("Discord OAuth is not configured.");
      const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${origin}/api/dashboard-callback`,
        }),
      });
      if (!tokenResponse.ok) throw new Error(`Discord token exchange failed (${tokenResponse.status}).`);
      const tokens = await tokenResponse.json();
      const [user, guilds] = await Promise.all([
        discordJson("/users/@me", tokens.access_token),
        discordJson("/users/@me/guilds", tokens.access_token),
      ]);
      const manageableGuilds = guilds
        .filter(canManageGuild)
        .map((guild) => ({ id: String(guild.id), name: String(guild.name), icon: typeof guild.icon === "string" ? guild.icon : null }))
        .slice(0, 100);
      const sessionId = await createSession({ user, guilds: manageableGuilds });
      return redirect(`${origin}/panel`, [sessionCookie(sessionId), clearState]);
    } catch (error) {
      console.error("Discord dashboard sign-in failed", error);
      return redirect(`${origin}/panel?error=connexion`, [clearState]);
    }
  },
};
