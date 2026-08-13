const DISCORD_API = "https://discord.com/api/v10";
const MAX_REQUEST_BYTES = 8_000;
const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function response(body, status = 200) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

function requiredText(value, name, min, max) {
  if (typeof value !== "string") throw new Error(`Le champ ${name} est invalide.`);
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < min || clean.length > max) {
    throw new Error(`Le champ ${name} doit contenir entre ${min} et ${max} caractères.`);
  }
  return clean;
}

function messageText(value) {
  if (typeof value !== "string") throw new Error("Le message est invalide.");
  const clean = value.replace(/\r\n/g, "\n").trim();
  if (clean.length < 10 || clean.length > 1_000) {
    throw new Error("Le message doit contenir entre 10 et 1 000 caractères.");
  }
  return clean;
}

function discordUserId(value) {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) {
    throw new Error("L’identifiant Discord doit contenir entre 17 et 20 chiffres.");
  }
  return value;
}

async function verifyTurnstile(token, remoteIp) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2_048) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const payload = new URLSearchParams({ secret, response: token });
  if (remoteIp) payload.set("remoteip", remoteIp);
  const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: payload,
  });
  if (!check.ok) return false;
  const result = await check.json();
  return result.success === true && result.action === "sentinel_contact";
}

async function discordRequest(path, token, payload) {
  const result = await fetch(`${DISCORD_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Sentinel.exe Contact Form (https://site-term-discord.vercel.app)",
    },
    body: JSON.stringify(payload),
  });
  if (!result.ok) throw new Error(`Discord error ${result.status}`);
  return result.json();
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "";
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return response({ ok: false, message: "Méthode non autorisée." }, 405);
    }

    const configuredOrigin = process.env.SITE_ORIGIN;
    const origin = request.headers.get("origin");
    if (configuredOrigin && origin && origin !== configuredOrigin) {
      return response({ ok: false, message: "Origine non autorisée." }, 403);
    }

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_REQUEST_BYTES) {
      return response({ ok: false, message: "La demande est trop volumineuse." }, 413);
    }

    let data;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return response({ ok: false, message: "La demande est trop volumineuse." }, 413);
      }
      data = JSON.parse(rawBody);
    } catch {
      return response({ ok: false, message: "Formulaire invalide." }, 400);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return response({ ok: false, message: "Formulaire invalide." }, 400);
    }

    // The hidden field deters basic bots without revealing whether a request was discarded.
    if (typeof data.website === "string" && data.website.trim()) {
      return response({ ok: true, message: "Demande envoyée." }, 201);
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const ownerId = process.env.CONTACT_OWNER_ID;
    if (!botToken || !ownerId || !process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
      return response({ ok: false, message: "Le formulaire est momentanément indisponible." }, 503);
    }

    let contact;
    try {
      contact = {
        name: requiredText(data.name, "nom", 2, 80),
        discordUsername: requiredText(data.discordUsername, "pseudo Discord", 2, 64),
        discordUserId: discordUserId(data.discordUserId),
        subject: requiredText(data.subject, "sujet", 3, 100),
        message: messageText(data.message),
      };
    } catch (error) {
      return response({ ok: false, message: error.message }, 400);
    }

    try {
      const verified = await verifyTurnstile(data.turnstileToken, clientIp(request));
      if (!verified) {
        return response({ ok: false, message: "La vérification anti-spam est invalide ou expirée." }, 400);
      }
    } catch {
      return response({ ok: false, message: "La vérification anti-spam est indisponible. Réessaie plus tard." }, 503);
    }

    try {
      const dm = await discordRequest("/users/@me/channels", botToken, { recipient_id: ownerId });
      await discordRequest(`/channels/${dm.id}/messages`, botToken, {
        allowed_mentions: { parse: [] },
        embeds: [{
          title: "Nouvelle demande depuis le site",
          color: 0xF4B942,
          fields: [
            { name: "Nom", value: contact.name, inline: true },
            { name: "Pseudo Discord", value: contact.discordUsername, inline: true },
            { name: "Identifiant utilisateur", value: `\`${contact.discordUserId}\``, inline: false },
            { name: "Sujet", value: contact.subject, inline: false },
            { name: "Message", value: contact.message, inline: false },
          ],
          footer: { text: `Répondre : /contact reply utilisateur:${contact.discordUserId}` },
        }],
      });
    } catch (error) {
      console.error("Unable to deliver contact request", error);
      return response({ ok: false, message: "Impossible d’envoyer la demande pour le moment. Réessaie plus tard." }, 503);
    }

    return response({ ok: true, message: "Demande envoyée." }, 201);
  },
};
