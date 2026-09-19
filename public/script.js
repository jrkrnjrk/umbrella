(function () {
  const cfg = window.UMBRELLA_CONFIG || {};
  const clientId = cfg.clientId && cfg.clientId !== "YOUR_DISCORD_CLIENT_ID" ? cfg.clientId : null;
  const permissions = cfg.permissions || "268520448";

  const url = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${permissions}&integration_type=0&scope=bot%20applications.commands`
    : "#commands";

  for (const id of ["nav-invite", "hero-invite", "cta-invite"]) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("href", url);
  }
})();
