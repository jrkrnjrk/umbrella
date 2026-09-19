const SITE = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "") || "/";

export function renderVerifyPage({ state, title, headline, body, detail }) {
  const tone =
    state === "success" ? "ok" : state === "loading" ? "wait" : "bad";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Umbrella Verification</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #07090b;
      --panel: #0c110e;
      --line: rgba(126, 232, 163, 0.16);
      --text: #e7eee8;
      --muted: #8b968e;
      --ok: #6ee7a8;
      --bad: #ff6b6b;
      --wait: #d4e157;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; }
    body {
      font-family: "IBM Plex Sans", system-ui, sans-serif;
      background:
        radial-gradient(900px 500px at 50% -10%, rgba(62, 140, 90, 0.18), transparent 55%),
        linear-gradient(180deg, #0a0e0c 0%, var(--bg) 40%);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 32px 16px;
    }
    .card {
      width: min(520px, 100%);
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #101612 0%, var(--panel) 100%);
      padding: 36px 32px 28px;
      position: relative;
    }
    .card::before {
      content: "";
      position: absolute; inset: 0 auto auto 0;
      width: 100%; height: 2px;
      background: linear-gradient(90deg, transparent, var(--${tone}), transparent);
    }
    .kicker {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--${tone});
      margin-bottom: 14px;
    }
    h1 {
      font-family: "Oswald", sans-serif;
      font-size: 34px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.05;
      margin-bottom: 14px;
    }
    p { color: var(--muted); line-height: 1.6; font-size: 15px; }
    .detail {
      margin-top: 18px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      color: #b7c2b9;
      word-break: break-word;
    }
    .foot {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #6d7870;
    }
    a { color: var(--ok); text-decoration: none; }
    .mark { display: flex; gap: 10px; align-items: center; }
    .mark svg { width: 22px; height: 22px; }
    .spin {
      width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid rgba(212,225,87,.2);
      border-top-color: var(--wait);
      animation: r 0.8s linear infinite;
      display: inline-block; vertical-align: middle; margin-right: 8px;
    }
    @keyframes r { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main class="card">
    <div class="kicker">${state === "loading" ? '<span class="spin"></span>' : ""}UMBRELLA // GATE</div>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(body)}</p>
    ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ""}
    <div class="foot">
      <div class="mark">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M16 3l11 6v8c0 7.2-4.6 12.4-11 14C9.6 29.4 5 24.2 5 17V9l11-6z" stroke="#6ee7a8" stroke-width="1.6"/>
          <path d="M7 14c3-5 6.2-7 9-7s6 2 9 7" stroke="#6ee7a8" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M16 7v16" stroke="#6ee7a8" stroke-width="1.6"/>
        </svg>
        UMBRELLA
      </div>
      <a href="${SITE}">umbrellaverification.com</a>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
