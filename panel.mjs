const loginScreen = document.querySelector("#login-screen");
const dashboardApp = document.querySelector("#dashboard-app");
const logoutButton = document.querySelector("#logout-button");
const loginMessage = document.querySelector("#login-message");
const guildSelect = document.querySelector("#guild-select");
const accountName = document.querySelector("#account-name");
const accountAvatar = document.querySelector("#account-avatar");
const status = document.querySelector("#dashboard-status");
const form = document.querySelector("#settings-form");
const saveButton = document.querySelector("#save-button");
const resetButton = document.querySelector("#reset-settings");
const logChannel = document.querySelector("#log-channel");
const channelNote = document.querySelector("#channel-note");
const verificationChannel = document.querySelector("#verification-channel");
const verificationRole = document.querySelector("#verification-role");
const verificationNote = document.querySelector("#verification-note");
const selectedGuildName = document.querySelector("#selected-guild-name");
const syncDot = document.querySelector("#sync-dot");
const syncLabel = document.querySelector("#sync-label");
const syncDetails = document.querySelector("#sync-details");
const presetButtons = [...document.querySelectorAll("[data-preset]")];
const ticketPanelsElement = document.querySelector("#ticket-panels");
const ticketEmpty = document.querySelector("#ticket-empty");
const addTicketPanelButton = document.querySelector("#add-ticket-panel");
const saveTicketsButton = document.querySelector("#save-tickets");
const ticketStatus = document.querySelector("#ticket-status");

const DEFAULT_SETTINGS = Object.freeze({
  security_log_channel_id: null,
  antiraid_enabled: true,
  auto_lockdown_enabled: true,
  risk_quarantine_threshold: 6,
  warning_risk_threshold: 4,
  critical_quarantine_all: true,
  raid_window_seconds: 60,
  raid_warning_joins: 5,
  raid_critical_joins: 10,
  antispam_enabled: true,
  spam_window_seconds: 8,
  spam_message_limit: 6,
  spam_duplicate_limit: 3,
  spam_mention_limit: 5,
  spam_timeout_minutes: 10,
  verification_enabled: false,
  verification_channel_id: null,
  verification_role_id: null,
});

const PRESETS = Object.freeze({
  relaxed: {
    ...DEFAULT_SETTINGS,
    critical_quarantine_all: false,
    risk_quarantine_threshold: 8,
    warning_risk_threshold: 6,
    raid_warning_joins: 8,
    raid_critical_joins: 15,
    spam_window_seconds: 10,
    spam_message_limit: 8,
    spam_duplicate_limit: 4,
    spam_mention_limit: 8,
    spam_timeout_minutes: 5,
  },
  balanced: { ...DEFAULT_SETTINGS },
  strict: {
    ...DEFAULT_SETTINGS,
    risk_quarantine_threshold: 5,
    warning_risk_threshold: 3,
    raid_window_seconds: 45,
    raid_warning_joins: 4,
    raid_critical_joins: 8,
    spam_window_seconds: 6,
    spam_message_limit: 4,
    spam_duplicate_limit: 2,
    spam_mention_limit: 3,
    spam_timeout_minutes: 20,
  },
});

let loadedSettings = { ...DEFAULT_SETTINGS };
let latestLastSyncAt = null;
let ticketPanels = [];
let ticketChannels = [];
let ticketCategories = [];
let ticketRoles = [];

const fields = {
  antiraid_enabled: document.querySelector("#antiraid-enabled"),
  auto_lockdown_enabled: document.querySelector("#auto-lockdown-enabled"),
  antispam_enabled: document.querySelector("#antispam-enabled"),
  critical_quarantine_all: document.querySelector("#critical-quarantine-all"),
  security_log_channel_id: logChannel,
  verification_enabled: document.querySelector("#verification-enabled"),
  verification_channel_id: verificationChannel,
  verification_role_id: verificationRole,
  raid_window_seconds: document.querySelector("#raid-window"),
  raid_warning_joins: document.querySelector("#raid-warning"),
  raid_critical_joins: document.querySelector("#raid-critical"),
  spam_window_seconds: document.querySelector("#spam-window"),
  spam_message_limit: document.querySelector("#spam-messages"),
  spam_duplicate_limit: document.querySelector("#spam-duplicates"),
  spam_mention_limit: document.querySelector("#spam-mentions"),
  spam_timeout_minutes: document.querySelector("#spam-timeout"),
  risk_quarantine_threshold: document.querySelector("#risk-normal"),
  warning_risk_threshold: document.querySelector("#risk-warning"),
};

function setStatus(message, type = "") {
  status.className = `dashboard-status ${type}`;
  status.textContent = message;
}

async function request(path, options) {
  const response = await fetch(path, { headers: { Accept: "application/json", ...(options?.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || "Une erreur est survenue.");
  return data;
}

function selectedGuildId() {
  return guildSelect.value;
}

function currentGuildName() {
  return guildSelect.options[guildSelect.selectedIndex]?.textContent || "Serveur Discord";
}

function completeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function populateSelect(select, items, selectedId, emptyLabel, labelFor, unavailableLabel) {
  select.innerHTML = `<option value="">${emptyLabel}</option>`;
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = labelFor(item);
    select.append(option);
  }
  if (selectedId && !items.some((item) => item.id === selectedId)) {
    const savedOption = document.createElement("option");
    savedOption.value = selectedId;
    savedOption.textContent = unavailableLabel;
    select.append(savedOption);
  }
  select.value = selectedId || "";
}

function populateChannels(channels, selectedChannelId) {
  populateSelect(logChannel, channels, selectedChannelId, "Aucun salon sélectionné", (channel) => `#${channel.name}`, "Salon enregistré (inaccessible pour le moment)");
}

function populateVerificationChannels(channels, selectedChannelId) {
  populateSelect(verificationChannel, channels, selectedChannelId, "Choisir un salon", (channel) => `#${channel.name}`, "Salon enregistré (inaccessible pour le moment)");
}

function populateRoles(roles, selectedRoleId) {
  populateSelect(verificationRole, roles, selectedRoleId, "Choisir un rôle", (role) => `@${role.name}`, "Rôle enregistré (inaccessible pour le moment)");
}

function fillSettings(settings) {
  const complete = completeSettings(settings);
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "checkbox") field.checked = complete[key] === true;
    else if (!["security_log_channel_id", "verification_channel_id", "verification_role_id"].includes(key)) field.value = String(complete[key] ?? "");
  }
  logChannel.value = complete.security_log_channel_id || "";
  verificationChannel.value = complete.verification_channel_id || "";
  verificationRole.value = complete.verification_role_id || "";
}

function settingsFromForm() {
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "checkbox") values[key] = field.checked;
    else if (["security_log_channel_id", "verification_channel_id", "verification_role_id"].includes(key)) values[key] = field.value || null;
    else values[key] = Number(field.value);
  }
  return values;
}

function setPill(id, label, enabled) {
  const pill = document.querySelector(id);
  pill.className = `status-pill ${enabled ? "is-active" : "is-inactive"}`;
  pill.textContent = `${label} : ${enabled ? "actif" : "désactivé"}`;
}

function syncAge(timestamp) {
  const parsed = Date.parse(timestamp || "");
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

function syncAgeLabel(seconds) {
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  return `il y a ${Math.floor(seconds / 3600)} h`;
}

function renderSync(lastSyncAt) {
  const age = syncAge(lastSyncAt);
  if (age === null) {
    syncDot.className = "sync-dot is-pending";
    syncLabel.textContent = "En attente du bot";
    syncDetails.textContent = "Le bot confirmera sa synchronisation ici après son prochain passage.";
    return;
  }
  if (age <= 90) {
    syncDot.className = "sync-dot is-healthy";
    syncLabel.textContent = "Synchronisation active";
    syncDetails.textContent = `Dernier passage du bot : ${syncAgeLabel(age)}.`;
    return;
  }
  syncDot.className = "sync-dot is-stale";
  syncLabel.textContent = "Synchronisation à vérifier";
  syncDetails.textContent = `Dernier passage du bot : ${syncAgeLabel(age)}. Vérifie qu’il est bien en ligne.`;
}

function updateOverview(settings, lastSyncAt = latestLastSyncAt) {
  const complete = completeSettings(settings);
  selectedGuildName.textContent = currentGuildName();
  setPill("#overview-antiraid", "Anti-raid", complete.antiraid_enabled);
  setPill("#overview-antispam", "Anti-spam", complete.antispam_enabled);
  setPill("#overview-lockdown", "Lockdown", complete.auto_lockdown_enabled);
  setPill("#overview-logs", "Journaux", Boolean(complete.security_log_channel_id));
  setPill("#overview-verification", "Vérification", complete.verification_enabled);
  renderSync(lastSyncAt);
}

function selectPreset(name = "") {
  for (const button of presetButtons) {
    button.classList.toggle("is-selected", button.dataset.preset === name);
  }
}

function applyPreset(name, message) {
  const preset = PRESETS[name];
  if (!preset) return;
  const settings = {
    ...preset,
    security_log_channel_id: logChannel.value || null,
    verification_channel_id: verificationChannel.value || null,
    verification_role_id: verificationRole.value || null,
  };
  fillSettings(settings);
  updateOverview(settings);
  selectPreset(name);
  setStatus(message, "success");
}

function setTicketStatus(message = "", type = "") {
  ticketStatus.className = `ticket-status ${type}`;
  ticketStatus.textContent = message;
}

function newTicketId(prefix) {
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value.slice(0, 20)}`;
}

function newTicketType() {
  return {
    id: newTicketId("t"),
    name: "Assistance",
    button_label: "Ouvrir un ticket",
    emoji: "🎫",
    button_style: "primary",
    staff_role_id: "",
    category_id: "",
    opening_message: "Bonjour ! Décris ta demande avec le plus de détails possible. L’équipe te répondra dès que possible.",
    questions: [],
  };
}

function newTicketPanel() {
  return {
    id: newTicketId("p"),
    channel_id: "",
    title: "Besoin d’aide ?",
    description: "Choisis la catégorie qui correspond à ta demande. Un salon privé sera créé pour échanger avec l’équipe.",
    colour: "#5865F2",
    footer: "Sentinel.exe • Support privé",
    types: [newTicketType()],
  };
}

function newTicketQuestion() {
  return { label: "Ta demande", placeholder: "Décris ta demande…", required: true, style: "paragraph" };
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function createInput(label, value, dataset, { textarea = false, type = "text", maxLength = 0 } = {}) {
  const container = element("label");
  container.textContent = label;
  const control = document.createElement(textarea ? "textarea" : "input");
  if (textarea) control.className = "ticket-textarea";
  if (!textarea) control.type = type;
  control.value = value || "";
  if (maxLength) control.maxLength = maxLength;
  Object.assign(control.dataset, dataset);
  container.append(control);
  return container;
}

function createSelect(label, selected, choices, dataset, emptyLabel) {
  const container = element("label");
  container.textContent = label;
  const control = document.createElement("select");
  Object.assign(control.dataset, dataset);
  const empty = new Option(emptyLabel, "");
  control.add(empty);
  for (const choice of choices) control.add(new Option(choice.label, choice.id));
  if (selected && !choices.some((choice) => choice.id === selected)) {
    control.add(new Option("Élément enregistré (inaccessible)", selected));
  }
  control.value = selected || "";
  container.append(control);
  return container;
}

function createButton(label, className, action, panelIndex, typeIndex = null, questionIndex = null) {
  const button = element("button", className, label);
  button.type = "button";
  button.dataset.ticketAction = action;
  button.dataset.panelIndex = String(panelIndex);
  if (typeIndex !== null) button.dataset.typeIndex = String(typeIndex);
  if (questionIndex !== null) button.dataset.questionIndex = String(questionIndex);
  return button;
}

function ticketDataset(panelIndex, typeIndex = null, questionIndex = null, field = "") {
  const dataset = { ticketField: field, panelIndex: String(panelIndex) };
  if (typeIndex !== null) dataset.typeIndex = String(typeIndex);
  if (questionIndex !== null) dataset.questionIndex = String(questionIndex);
  return dataset;
}

function ticketTextChoices(items, prefix = "") {
  return items.map((item) => ({ id: item.id, label: `${prefix}${item.name}` }));
}

function renderTicketQuestion(question, panelIndex, typeIndex, questionIndex) {
  const row = element("div", "ticket-question");
  row.append(
    createInput("Question", question.label, ticketDataset(panelIndex, typeIndex, questionIndex, "label"), { maxLength: 45 }),
    createInput("Exemple de réponse", question.placeholder, ticketDataset(panelIndex, typeIndex, questionIndex, "placeholder"), { maxLength: 100 }),
    createSelect("Format", question.style, [
      { id: "short", label: "Réponse courte" },
      { id: "paragraph", label: "Paragraphe" },
    ], ticketDataset(panelIndex, typeIndex, questionIndex, "style"), "Choisir")
  );
  const options = element("div", "ticket-question-options");
  const required = element("label", "ticket-checkbox");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = question.required === true;
  Object.assign(checkbox.dataset, ticketDataset(panelIndex, typeIndex, questionIndex, "required"));
  required.append(checkbox, document.createTextNode("Obligatoire"));
  options.append(required);
  row.append(options, createButton("Supprimer", "button-danger", "remove-question", panelIndex, typeIndex, questionIndex));
  return row;
}

function renderTicketType(ticketType, panelIndex, typeIndex) {
  const card = element("div", "ticket-type");
  const top = element("div", "ticket-type-top");
  top.append(element("strong", "", `Type de ticket ${typeIndex + 1}`), createButton("Supprimer le type", "button-danger", "remove-type", panelIndex, typeIndex));
  const fields = element("div", "ticket-type-grid");
  fields.append(
    createInput("Nom interne", ticketType.name, ticketDataset(panelIndex, typeIndex, null, "name"), { maxLength: 80 }),
    createInput("Emoji", ticketType.emoji, ticketDataset(panelIndex, typeIndex, null, "emoji"), { maxLength: 80 }),
    createInput("Texte du bouton", ticketType.button_label, ticketDataset(panelIndex, typeIndex, null, "button_label"), { maxLength: 80 }),
    createSelect("Couleur", ticketType.button_style, [
      { id: "primary", label: "Bleu" },
      { id: "secondary", label: "Gris" },
      { id: "success", label: "Vert" },
      { id: "danger", label: "Rouge" },
    ], ticketDataset(panelIndex, typeIndex, null, "button_style"), "Choisir")
  );
  const permissions = element("div", "ticket-type-grid-secondary");
  permissions.append(
    createSelect("Rôle qui répondra", ticketType.staff_role_id, ticketTextChoices(ticketRoles, "@"), ticketDataset(panelIndex, typeIndex, null, "staff_role_id"), "Choisir un rôle"),
    createSelect("Catégorie où créer le ticket", ticketType.category_id, ticketTextChoices(ticketCategories, "#"), ticketDataset(panelIndex, typeIndex, null, "category_id"), "Choisir une catégorie")
  );
  const opening = createInput("Message d’ouverture", ticketType.opening_message, ticketDataset(panelIndex, typeIndex, null, "opening_message"), { textarea: true, maxLength: 3500 });
  const questionHeading = element("div", "ticket-question-heading");
  questionHeading.append(element("strong", "", `Questions avant l’ouverture (${ticketType.questions.length}/5)`));
  const addQuestion = createButton("+ Ajouter une question", "button-small", "add-question", panelIndex, typeIndex);
  addQuestion.disabled = ticketType.questions.length >= 5;
  questionHeading.append(addQuestion);
  const questions = element("div", "ticket-question-list");
  ticketType.questions.forEach((question, questionIndex) => questions.append(renderTicketQuestion(question, panelIndex, typeIndex, questionIndex)));
  card.append(top, fields, permissions, opening, questionHeading, questions);
  return card;
}

function renderTicketPanels() {
  ticketPanelsElement.replaceChildren();
  ticketEmpty.classList.toggle("hidden", ticketPanels.length > 0);
  ticketPanels.forEach((panel, panelIndex) => {
    const card = element("article", "ticket-panel");
    const top = element("div", "ticket-panel-top");
    const label = element("div");
    label.append(element("strong", "", `Panneau ${panelIndex + 1}`), element("span", "", "Le bot le publiera après la synchronisation."));
    top.append(label, createButton("Supprimer le panneau", "button-danger", "remove-panel", panelIndex));
    const body = element("div", "ticket-panel-body");
    const fields = element("div", "ticket-panel-fields");
    fields.append(
      createSelect("Salon du panneau", panel.channel_id, ticketTextChoices(ticketChannels, "#"), ticketDataset(panelIndex, null, null, "channel_id"), "Choisir un salon"),
      createInput("Titre", panel.title, ticketDataset(panelIndex, null, null, "title"), { maxLength: 256 }),
      createInput("Couleur de l’embed", panel.colour, ticketDataset(panelIndex, null, null, "colour"), { type: "color" }),
      createInput("Pied de page", panel.footer, ticketDataset(panelIndex, null, null, "footer"), { maxLength: 2048 })
    );
    const description = createInput("Description du panneau", panel.description, ticketDataset(panelIndex, null, null, "description"), { textarea: true, maxLength: 4096 });
    description.classList.add("ticket-panel-description");
    const typesHeading = element("div", "ticket-types-heading");
    typesHeading.append(element("strong", "", `Boutons et types (${panel.types.length}/5)`));
    const addType = createButton("+ Ajouter un type", "button-small", "add-type", panelIndex);
    addType.disabled = panel.types.length >= 5;
    typesHeading.append(addType);
    const types = element("div", "ticket-types");
    panel.types.forEach((ticketType, typeIndex) => types.append(renderTicketType(ticketType, panelIndex, typeIndex)));
    body.append(fields, description, typesHeading, types);
    card.append(top, body);
    ticketPanelsElement.append(card);
  });
}

function ticketLocation(target) {
  const panel = ticketPanels[Number(target.dataset.panelIndex)];
  if (!panel) return {};
  const type = target.dataset.typeIndex === undefined ? null : panel.types[Number(target.dataset.typeIndex)];
  const question = type && target.dataset.questionIndex !== undefined ? type.questions[Number(target.dataset.questionIndex)] : null;
  return { panel, type, question };
}

function updateTicketField(target) {
  const { panel, type, question } = ticketLocation(target);
  const destination = question || type || panel;
  const field = target.dataset.ticketField;
  if (!destination || !field) return;
  destination[field] = target.type === "checkbox" ? target.checked : target.value;
}

function validateTicketsInBrowser() {
  for (const panel of ticketPanels) {
    if (!panel.channel_id || !panel.title.trim() || !panel.description.trim()) return "Complète le salon, le titre et la description de chaque panneau.";
    if (!/^#[0-9a-fA-F]{6}$/.test(panel.colour || "")) return "Choisis une couleur valide pour chaque panneau.";
    if (!Array.isArray(panel.types) || panel.types.length === 0) return "Chaque panneau doit avoir au moins un type de ticket.";
    for (const ticketType of panel.types) {
      if (!ticketType.name.trim() || !ticketType.button_label.trim() || !ticketType.emoji.trim()) return "Complète le nom, l’emoji et le bouton de chaque type.";
      if (!ticketType.staff_role_id || !ticketType.category_id) return "Choisis un rôle d’équipe et une catégorie pour chaque type.";
      if (!ticketType.opening_message.trim()) return "Ajoute le message d’ouverture de chaque type.";
      for (const question of ticketType.questions) {
        if (!question.label.trim() || !question.placeholder.trim()) return "Complète ou retire les questions incomplètes.";
      }
    }
  }
  return "";
}

async function loadGuild() {
  const guildId = selectedGuildId();
  if (!guildId) return;
  setStatus("Chargement des réglages…");
  try {
    const [settingsData, channelsData, rolesData, ticketsData] = await Promise.all([
      request(`/api/dashboard-settings?guild=${encodeURIComponent(guildId)}`),
      request(`/api/dashboard-channels?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ channels: [], categories: [], error })),
      request(`/api/dashboard-roles?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ roles: [], error })),
      request(`/api/dashboard-tickets?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ settings: { panels: [] }, error })),
    ]);
    loadedSettings = completeSettings(settingsData.settings);
    latestLastSyncAt = settingsData.last_sync_at || null;
    populateChannels(channelsData.channels, loadedSettings.security_log_channel_id);
    populateVerificationChannels(channelsData.channels, loadedSettings.verification_channel_id);
    populateRoles(rolesData.roles, loadedSettings.verification_role_id);
    ticketChannels = Array.isArray(channelsData.channels) ? channelsData.channels : [];
    ticketCategories = Array.isArray(channelsData.categories) ? channelsData.categories : [];
    ticketRoles = Array.isArray(rolesData.roles) ? rolesData.roles : [];
    ticketPanels = Array.isArray(ticketsData.settings?.panels) ? ticketsData.settings.panels : [];
    renderTicketPanels();
    fillSettings(loadedSettings);
    updateOverview(loadedSettings, latestLastSyncAt);
    selectPreset("");
    if (channelsData.error) {
      channelNote.textContent = "Le bot ne peut pas lire les salons pour le moment. Vérifie qu’il est bien présent sur ce serveur.";
    } else {
      channelNote.textContent = channelsData.channels.length
        ? "Choisis le salon où Sentinel.exe enverra ses journaux de sécurité."
        : "Aucun salon textuel visible par le bot.";
    }
    if (rolesData.error) {
      verificationNote.textContent = "Les rôles ne peuvent pas être chargés pour le moment. Vérifie que Sentinel.exe est présent sur ce serveur.";
    } else if (!rolesData.roles.length) {
      verificationNote.textContent = "Aucun rôle attribuable n’a été trouvé. Crée un rôle « Vérifié » sous le rôle de Sentinel.exe, puis recharge cette page.";
    } else {
      verificationNote.textContent = "Crée un rôle « Vérifié » sous le rôle de Sentinel.exe, puis choisis-le ici. Pour rendre ce passage obligatoire, règle ensuite les permissions de tes salons dans Discord.";
    }
    if (ticketsData.error) {
      setTicketStatus("Le module de tickets n’est pas encore disponible. Vérifie que la mise à jour du site et la migration Supabase sont bien en place.", "error");
    } else if (ticketPanels.length) {
      setTicketStatus("Configuration des tickets chargée. Enregistre après tes modifications : le bot publiera ou actualisera les panneaux en moins d’une minute.");
    } else {
      setTicketStatus("Crée ton premier panneau de tickets pour commencer.");
    }
    setStatus("Réglages chargés.");
  } catch (error) {
    setStatus(error.message || "Impossible de charger les réglages.", "error");
  }
}

function showLogin(message = "Aucun mot de passe Discord ne passe par Sentinel.exe.") {
  dashboardApp.classList.add("hidden");
  logoutButton.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginMessage.textContent = message;
}

async function initialize() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error") === "connexion") showLogin("La connexion Discord a échoué ou a expiré. Réessaie simplement.");
  try {
    const data = await request("/api/dashboard-me");
    if (!data.authenticated) return;
    if (!Array.isArray(data.guilds) || data.guilds.length === 0) {
      showLogin("Aucun serveur administrable n’a été trouvé sur ce compte Discord.");
      return;
    }
    loginScreen.classList.add("hidden");
    dashboardApp.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    accountName.textContent = data.user.username;
    accountAvatar.textContent = data.user.username.slice(0, 1).toUpperCase();
    guildSelect.innerHTML = "";
    for (const guild of data.guilds) {
      const option = document.createElement("option");
      option.value = guild.id;
      option.textContent = guild.name;
      guildSelect.append(option);
    }
    const requestedGuild = params.get("guild");
    if (requestedGuild && data.guilds.some((guild) => guild.id === requestedGuild)) guildSelect.value = requestedGuild;
    await loadGuild();
  } catch {
    showLogin("Le tableau de bord est momentanément indisponible. Réessaie dans un instant.");
  }
}

guildSelect.addEventListener("change", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("guild", selectedGuildId());
  window.history.replaceState({}, "", url);
  await loadGuild();
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const names = { relaxed: "Souple", balanced: "Équilibré", strict: "Strict" };
    applyPreset(button.dataset.preset, `Profil ${names[button.dataset.preset]} appliqué. Enregistre pour l’envoyer au bot.`);
  });
});

resetButton.addEventListener("click", () => {
  applyPreset("balanced", "Réglages équilibrés restaurés. Enregistre pour confirmer ce choix.");
});

addTicketPanelButton.addEventListener("click", () => {
  if (ticketPanels.length >= 10) {
    setTicketStatus("Tu peux créer jusqu’à 10 panneaux de tickets.", "error");
    return;
  }
  ticketPanels.push(newTicketPanel());
  renderTicketPanels();
  setTicketStatus("Nouveau panneau créé. Complète ses réglages, puis enregistre.", "success");
});

ticketPanelsElement.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (!target.dataset.ticketField) return;
  updateTicketField(target);
});

ticketPanelsElement.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (!target.dataset.ticketField) return;
  updateTicketField(target);
});

ticketPanelsElement.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("button[data-ticket-action]") : null;
  if (!target) return;
  const panelIndex = Number(target.dataset.panelIndex);
  const panel = ticketPanels[panelIndex];
  if (!panel) return;
  const typeIndex = target.dataset.typeIndex === undefined ? -1 : Number(target.dataset.typeIndex);
  const ticketType = typeIndex >= 0 ? panel.types[typeIndex] : null;
  const questionIndex = target.dataset.questionIndex === undefined ? -1 : Number(target.dataset.questionIndex);

  switch (target.dataset.ticketAction) {
    case "remove-panel":
      if (!window.confirm("Supprimer ce panneau ? Le bot retirera aussi le message Discord publié lors de sa prochaine synchronisation.")) return;
      ticketPanels.splice(panelIndex, 1);
      break;
    case "add-type":
      if (panel.types.length >= 5) return;
      panel.types.push(newTicketType());
      break;
    case "remove-type":
      if (!ticketType || panel.types.length <= 1) {
        setTicketStatus("Un panneau doit toujours garder au moins un type de ticket.", "error");
        return;
      }
      panel.types.splice(typeIndex, 1);
      break;
    case "add-question":
      if (!ticketType || ticketType.questions.length >= 5) return;
      ticketType.questions.push(newTicketQuestion());
      break;
    case "remove-question":
      if (!ticketType || questionIndex < 0) return;
      ticketType.questions.splice(questionIndex, 1);
      break;
    default:
      return;
  }
  renderTicketPanels();
  setTicketStatus("Modification en attente. Enregistre pour l’envoyer au bot.");
});

saveTicketsButton.addEventListener("click", async () => {
  const error = validateTicketsInBrowser();
  if (error) {
    setTicketStatus(error, "error");
    return;
  }
  if (!ticketPanels.length && !window.confirm("Cela supprimera tous les panneaux de tickets publiés par Sentinel.exe. Continuer ?")) return;
  saveTicketsButton.disabled = true;
  setTicketStatus("Enregistrement de la configuration des tickets…");
  try {
    const data = await request(`/api/dashboard-tickets?guild=${encodeURIComponent(selectedGuildId())}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ panels: ticketPanels }),
    });
    ticketPanels = Array.isArray(data.settings?.panels) ? data.settings.panels : [];
    renderTicketPanels();
    setTicketStatus("Tickets enregistrés. Sentinel.exe publiera ou actualisera les panneaux en moins d’une minute.", "success");
  } catch (requestError) {
    setTicketStatus(requestError.message || "Impossible d’enregistrer les tickets.", "error");
  } finally {
    saveTicketsButton.disabled = false;
  }
});

form.addEventListener("change", () => {
  updateOverview(settingsFromForm());
  selectPreset("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const settings = settingsFromForm();
  if (settings.raid_critical_joins <= settings.raid_warning_joins) {
    setStatus("Le seuil critique doit être supérieur au seuil d’alerte.", "error");
    return;
  }
  if (settings.verification_enabled && (!settings.verification_channel_id || !settings.verification_role_id)) {
    setStatus("Choisis un salon et un rôle avant d’activer la vérification.", "error");
    return;
  }
  const disabledProtections = [];
  if (loadedSettings.antiraid_enabled && !settings.antiraid_enabled) disabledProtections.push("l’anti-raid");
  if (loadedSettings.antispam_enabled && !settings.antispam_enabled) disabledProtections.push("l’anti-spam");
  if (loadedSettings.auto_lockdown_enabled && !settings.auto_lockdown_enabled) disabledProtections.push("le lockdown automatique");
  if (loadedSettings.verification_enabled && !settings.verification_enabled) disabledProtections.push("la vérification des membres");
  if (disabledProtections.length && !window.confirm(`Tu vas désactiver ${disabledProtections.join(", ")}. Ton serveur sera moins protégé. Continuer ?`)) return;

  saveButton.disabled = true;
  setStatus("Enregistrement des réglages…");
  try {
    const data = await request(`/api/dashboard-settings?guild=${encodeURIComponent(selectedGuildId())}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    loadedSettings = completeSettings(data.settings);
    fillSettings(loadedSettings);
    updateOverview(loadedSettings);
    selectPreset("");
    setStatus("Réglages enregistrés. Le bot les appliquera en moins d’une minute.", "success");
  } catch (error) {
    setStatus(error.message || "Impossible d’enregistrer les réglages.", "error");
  } finally {
    saveButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try { await request("/api/dashboard-logout", { method: "POST" }); } catch { /* The local session still gets cleared below. */ }
  window.location.assign("/panel");
});

initialize();
window.setInterval(() => renderSync(latestLastSyncAt), 15000);
