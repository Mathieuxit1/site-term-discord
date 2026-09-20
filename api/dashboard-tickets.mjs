import { getManagedGuild, getSession, json, readJson, supabase } from "./_dashboard.mjs";

const ID = /^[A-Za-z0-9_-]{8,32}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const BUTTON_STYLES = new Set(["primary", "secondary", "success", "danger"]);
const QUESTION_STYLES = new Set(["short", "paragraph"]);

function cleanText(value, label, minimum, maximum) {
  if (typeof value !== "string") throw new Error(`${label} est invalide.`);
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) throw new Error(`${label} doit contenir entre ${minimum} et ${maximum} caractères.`);
  return text;
}

function optionalSnowflake(value, label) {
  if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new Error(`${label} est invalide.`);
  return value;
}

function validateQuestion(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) throw new Error("Une question est invalide.");
  const style = question.style;
  if (!QUESTION_STYLES.has(style)) throw new Error("Le format d’une question est invalide.");
  if (typeof question.required !== "boolean") throw new Error("Le caractère obligatoire d’une question est invalide.");
  return {
    label: cleanText(question.label, "Le titre d’une question", 1, 45),
    placeholder: cleanText(question.placeholder || "Décris ta réponse", "L’exemple de réponse", 1, 100),
    required: question.required,
    style,
  };
}

function validateType(type, panelId, index) {
  if (!type || typeof type !== "object" || Array.isArray(type)) throw new Error("Un type de ticket est invalide.");
  if (typeof type.id !== "string" || !ID.test(type.id)) throw new Error("L’identifiant d’un type de ticket est invalide.");
  if (!Array.isArray(type.questions) || type.questions.length > 5) throw new Error("Un type de ticket peut contenir entre 0 et 5 questions.");
  const questions = type.questions.map(validateQuestion);
  return {
    id: type.id,
    panel_id: panelId,
    name: cleanText(type.name, "Le nom d’un type de ticket", 1, 80),
    button_label: cleanText(type.button_label, "Le texte d’un bouton", 1, 80),
    emoji: cleanText(type.emoji, "L’emoji d’un bouton", 1, 80),
    button_style: BUTTON_STYLES.has(type.button_style) ? type.button_style : (() => { throw new Error("La couleur d’un bouton est invalide."); })(),
    staff_role_id: optionalSnowflake(type.staff_role_id, "Le rôle d’équipe"),
    category_id: optionalSnowflake(type.category_id, "La catégorie de tickets"),
    opening_message: cleanText(type.opening_message, "Le message d’ouverture", 1, 3500),
    questions,
    position: index,
  };
}

function validatePanels(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.panels)) {
    throw new Error("La configuration des tickets est invalide.");
  }
  if (input.panels.length > 10) throw new Error("Tu peux créer jusqu’à 10 panneaux de tickets.");
  const panelIds = new Set();
  return input.panels.map((panel) => {
    if (!panel || typeof panel !== "object" || Array.isArray(panel)) throw new Error("Un panneau est invalide.");
    if (typeof panel.id !== "string" || !ID.test(panel.id) || panelIds.has(panel.id)) throw new Error("Un identifiant de panneau est invalide.");
    panelIds.add(panel.id);
    if (!Array.isArray(panel.types) || panel.types.length < 1 || panel.types.length > 5) {
      throw new Error("Chaque panneau doit contenir entre 1 et 5 types de tickets.");
    }
    const typeIds = new Set();
    const types = panel.types.map((type, index) => {
      const checked = validateType(type, panel.id, index);
      if (typeIds.has(checked.id)) throw new Error("Deux types de tickets ne peuvent pas avoir le même identifiant.");
      typeIds.add(checked.id);
      return checked;
    });
    const colour = cleanText(panel.colour, "La couleur du panneau", 7, 7);
    if (!COLOUR.test(colour)) throw new Error("La couleur du panneau doit être au format #RRGGBB.");
    return {
      id: panel.id,
      channel_id: optionalSnowflake(panel.channel_id, "Le salon du panneau"),
      title: cleanText(panel.title, "Le titre du panneau", 1, 256),
      description: cleanText(panel.description, "La description du panneau", 1, 4096),
      colour,
      footer: cleanText(panel.footer || "", "Le pied de page", 0, 2048),
      types,
    };
  });
}

async function authorizedGuild(request) {
  const session = await getSession(request);
  if (!session) return { error: json({ ok: false, message: "Connecte-toi avec Discord pour continuer." }, 401) };
  const guildId = new URL(request.url).searchParams.get("guild") || "";
  const guild = getManagedGuild(session, guildId);
  if (!guild) return { error: json({ ok: false, message: "Ce serveur n’est pas accessible depuis ton compte." }, 403) };
  return { guild };
}

export default {
  async fetch(request) {
    try {
      const auth = await authorizedGuild(request);
      if (auth.error) return auth.error;

      if (request.method === "GET") {
        const query = `dashboard_ticket_settings?guild_id=eq.${encodeURIComponent(auth.guild.id)}&select=panels,updated_at&limit=1`;
        const rows = await (await supabase(query)).json();
        const settings = rows[0] || { panels: [], updated_at: null };
        return json({ ok: true, guild: auth.guild, settings });
      }

      if (request.method !== "PUT") return json({ ok: false, message: "Méthode non autorisée." }, 405);
      const panels = validatePanels(await readJson(request, 60_000));
      const payload = { guild_id: auth.guild.id, panels, updated_at: new Date().toISOString() };
      const response = await supabase("dashboard_ticket_settings?on_conflict=guild_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      const rows = await response.json();
      return json({ ok: true, guild: auth.guild, settings: rows[0] || payload });
    } catch (error) {
      console.error("Dashboard ticket settings request failed", error);
      return json({ ok: false, message: error instanceof Error ? error.message : "Impossible d’enregistrer les tickets pour le moment." }, 400);
    }
  },
};
