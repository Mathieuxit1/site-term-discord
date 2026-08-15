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
const logChannel = document.querySelector("#log-channel");
const channelNote = document.querySelector("#channel-note");

const fields = {
  antiraid_enabled: document.querySelector("#antiraid-enabled"),
  auto_lockdown_enabled: document.querySelector("#auto-lockdown-enabled"),
  antispam_enabled: document.querySelector("#antispam-enabled"),
  critical_quarantine_all: document.querySelector("#critical-quarantine-all"),
  security_log_channel_id: logChannel,
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

function populateChannels(channels, selectedChannelId) {
  logChannel.innerHTML = '<option value="">Aucun salon sélectionné</option>';
  for (const channel of channels) {
    const option = document.createElement("option");
    option.value = channel.id;
    option.textContent = `#${channel.name}`;
    logChannel.append(option);
  }
  logChannel.value = selectedChannelId || "";
}

function fillSettings(settings) {
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "checkbox") field.checked = settings[key] === true;
    else if (key !== "security_log_channel_id") field.value = String(settings[key] ?? "");
  }
  logChannel.value = settings.security_log_channel_id || "";
}

function settingsFromForm() {
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "checkbox") values[key] = field.checked;
    else if (key === "security_log_channel_id") values[key] = field.value || null;
    else values[key] = Number(field.value);
  }
  return values;
}

async function loadGuild() {
  const guildId = selectedGuildId();
  if (!guildId) return;
  setStatus("Chargement des réglages…");
  try {
    const [settingsData, channelsData] = await Promise.all([
      request(`/api/dashboard-settings?guild=${encodeURIComponent(guildId)}`),
      request(`/api/dashboard-channels?guild=${encodeURIComponent(guildId)}`).catch((error) => ({ channels: [], error })),
    ]);
    populateChannels(channelsData.channels, settingsData.settings.security_log_channel_id);
    fillSettings(settingsData.settings);
    if (channelsData.error) {
      channelNote.textContent = "Le bot ne peut pas lire les salons pour le moment. Vérifie qu’il est bien présent sur ce serveur.";
    } else {
      channelNote.textContent = channelsData.channels.length
        ? "Choisis le salon où Sentinel.exe enverra ses journaux de sécurité."
        : "Aucun salon textuel visible par le bot.";
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
  if (params.get("error") === "connexion") {
    showLogin("La connexion Discord a échoué ou a expiré. Réessaie simplement.");
  }
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const settings = settingsFromForm();
  if (settings.raid_critical_joins <= settings.raid_warning_joins) {
    setStatus("Le seuil critique doit être supérieur au seuil d’alerte.", "error");
    return;
  }
  saveButton.disabled = true;
  setStatus("Enregistrement des réglages…");
  try {
    const data = await request(`/api/dashboard-settings?guild=${encodeURIComponent(selectedGuildId())}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    fillSettings(data.settings);
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
