# Umbrella Verification

Military-grade Discord verification. One Railway service runs everything:

- marketing website
- `/v/:token` verification gate
- Discord bot (`/panel`, `/setlogs`, `/setverifyrole`)
- PostgreSQL identity store

## What it does

| Command | Result |
|---|---|
| `/setverifyrole` | Role granted after a clean scan |
| `/setlogs` | Channel that receives pass / deny embeds |
| `/panel` | Posts the verification message + **Verify** button |

When a member clicks **Verify**:

1. Umbrella mints a single-use link bound to that Discord user (15 minutes).
2. They open `https://your-railway-domain/v/<token>`.
3. VPNs, proxies, Tor, and high-risk ranges are denied.
4. If that IP already belongs to a **different** Discord account, verification is denied. The originating server is ignored — the lock is global.
5. If the IP is new, or already bound to **this same** account, the member is verified and receives the role.
6. The log channel is notified.

## Layout

```
server/                 ← Railway root directory
  public/               marketing site
  src/                  bot + API
  package.json
  railway.toml
  .env.example
```

---

## 1. Discord application

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → `Umbrella Verification`.
2. **Bot** → Add Bot → Reset Token → copy `DISCORD_TOKEN`.
3. Enable **Server Members Intent**.
4. Copy **Application ID** → `DISCORD_CLIENT_ID`.

Invite URL (the website also builds this from the client id):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=268520448&scope=bot%20applications.commands
```

Permissions: View Channels, Send Messages, Embed Links, Read Message History, Manage Roles.

Put the bot role **above** the verified role.

---

## 2. Deploy on Railway

1. Push this repo to GitHub.
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Set the service **Root Directory** to `server`.
4. Add a plugin: **PostgreSQL**. Attach it so `DATABASE_URL` is available on the app.
5. Settings → Networking → **Generate Domain**. Copy it, e.g. `https://umbrella-production-xxxx.up.railway.app`.
6. Variables:

| Key | Value |
|---|---|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |
| `DATABASE_URL` | Injected by the Postgres plugin |
| `PUBLIC_BASE_URL` | The Railway HTTPS URL, no trailing slash |
| `PROXYCHECK_API_KEY` | Free key from [proxycheck.io](https://proxycheck.io) |
| `VPN_FAIL_MODE` | `closed` (recommended) or `open` |
| `TOKEN_TTL_MINUTES` | `15` |

7. Deploy. Check `https://YOUR_DOMAIN/health` → `{"ok":true,...}`.
8. Open `https://YOUR_DOMAIN/` — that is the website.

Slash commands register on boot. Global commands can take a few minutes to show up.

### Optional custom domain

Railway → service → Settings → Networking → Custom Domain.

If the domain lives in Cloudflare DNS (no Pages project needed):

- `CNAME` `@` or `www` → `your-app.up.railway.app`
- Proxy can stay on
- SSL mode **Full (strict)**
- Add the same hostname in Railway
- Set `PUBLIC_BASE_URL` to that hostname and redeploy

---

## 3. First-run in Discord

1. Invite the bot.
2. `/setverifyrole role:@Verified`
3. `/setlogs channel:#verification-logs`
4. `/panel` in the gate channel.

---

## Decision table

| Condition | Result |
|---|---|
| VPN / proxy / Tor / high risk | Deny |
| IP already bound to a **different** Discord user | Deny |
| IP unseen, or bound only to **this** user | Allow + assign role |
| Token missing / used / expired | Deny |
| Role cannot be applied | Scan passed, staff alerted |

IPs in Discord logs are masked. Full addresses stay in Postgres so collisions can be enforced.

---

## Local

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

`PUBLIC_BASE_URL` must be reachable from a browser (use a tunnel if you test the gate locally).

---

## Notes

- proxycheck.io free plan: 1,000 lookups/day with a key.
- `VPN_FAIL_MODE=closed` refuses traffic when the scanner is down.
- One Discord account may use several IPs. One IP may not verify two Discord accounts.
- Keep the Railway service always-on. Gateway bots cannot sleep.
