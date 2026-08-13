const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return Response.json({ ok: false, message: "Méthode non autorisée." }, { status: 405, headers: JSON_HEADERS });
    }

    const siteKey = process.env.TURNSTILE_SITE_KEY;
    if (!siteKey) {
      return Response.json({ ok: false, message: "Le formulaire n’est pas configuré." }, { status: 503, headers: JSON_HEADERS });
    }

    return Response.json({ ok: true, turnstileSiteKey: siteKey }, { headers: JSON_HEADERS });
  },
};
