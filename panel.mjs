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

async function loadGuild() {
  const guildId = selectedGuildId();
  if (!guildId) return;
  setStatus("Chargement des réglages…");
  try {
    const [settingsData, channelsData, rolesData] = await Promise.all([
      request(`/api/dashboard-settings?guild=${encodeURIComponent(guildId)}`),
      request(`/api/dashboard-channels?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ channels: [], error })),
      request(`/api/dashboard-roles?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ roles: [], error })),
    ]);
    loadedSettings = completeSettings(settingsData.settings);
    latestLastSyncAt = settingsData.last_sync_at || null;
    populateChannels(channelsData.channels, loadedSettings.security_log_channel_id);
    populateVerificationChannels(channelsData.channels, loadedSettings.verification_channel_id);
    populateRoles(rolesData.roles, loadedSettings.verification_role_id);
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
