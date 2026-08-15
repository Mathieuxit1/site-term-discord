import { json, readCookie, sessionCookie, supabase } from "./_dashboard.mjs";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, message: "Méthode non autorisée." }, 405);
    const sessionId = readCookie(request, "sentinel_dashboard_session");
    if (sessionId && /^[a-f0-9]{64}$/i.test(sessionId)) {
      try {
        await supabase(`dashboard_sessions?session_id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      } catch (error) {
        console.error("Unable to remove dashboard session", error);
      }
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie("", 0) } });
  },
};
