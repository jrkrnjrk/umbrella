import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { EmbedBuilder } from "discord.js";
import {
  findAccountsForIp,
  getPending,
  logEvent,
  markPendingUsed,
  recordVerifiedIp,
} from "./db.js";
import { inspectIp, vpnFailClosed } from "./vpn.js";
import { grantVerifiedRole, sendLog } from "./bot.js";
import { renderVerifyPage } from "./pages.js";

export function createApi() {
  const app = express();
  app.set("trust proxy", true);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'"],
        },
      },
    })
  );
  app.use(express.json({ limit: "16kb" }));

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/v/", limiter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "umbrella-verification" });
  });

  app.get("/config.js", (_req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    res
      .type("application/javascript")
      .send(
        `window.UMBRELLA_CONFIG = { clientId: ${JSON.stringify(clientId)}, permissions: "268520448" };`
      );
  });

  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
  app.use(express.static(publicDir));

  app.get("/v/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const ip = clientIp(req);

    const fail = (status, headline, body, detail, http = 400) =>
      res.status(http).type("html").send(
        renderVerifyPage({ state: "bad", title: "Denied", headline, body, detail })
      );

    if (!/^[a-f0-9]{48}$/.test(token)) {
      return fail("invalid", "Invalid gate", "That link is not a valid Umbrella session.");
    }

    const pending = await getPending(token);
    if (!pending) {
      return fail("missing", "Unknown session", "This link does not match an active verification.");
    }
    if (pending.used) {
      return fail("used", "Link already used", "Generate a new link with the Verify button.");
    }
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await logEvent({
        discordId: pending.user_id,
        guildId: pending.guild_id,
        ip,
        status: "expired",
        reason: "token expired",
      });
      return fail("expired", "Link expired", "Go back to Discord and press Verify again.");
    }
    if (!ip) {
      return fail("noip", "Address hidden", "Umbrella could not read your network address.");
    }

    const vpn = await inspectIp(ip);
    if (!vpn.ok) {
      await logEvent({
        discordId: pending.user_id,
        guildId: pending.guild_id,
        ip,
        status: "vpn_unavailable",
        reason: vpn.error,
      });
      if (vpnFailClosed()) {
        await notify(pending, {
          color: 0xf5c542,
          title: "Verification blocked — scanner offline",
          userId: pending.user_id,
          lines: [`IP \`${maskIp(ip)}\``, `Scanner: ${vpn.error}`],
        });
        return fail(
          "scanner",
          "Scanner unavailable",
          "The threat scanner could not complete. Try again in a moment.",
          vpn.error
        );
      }
    } else if (vpn.isVpnOrProxy) {
      await markPendingUsed(token);
      await logEvent({
        discordId: pending.user_id,
        guildId: pending.guild_id,
        ip,
        status: "denied_vpn",
        reason: `${vpn.type} risk=${vpn.risk}`,
      });
      await notify(pending, {
        color: 0xff8a3d,
        title: "Verification denied — VPN / proxy",
        userId: pending.user_id,
        lines: [
          `IP \`${maskIp(ip)}\``,
          `Type **${vpn.type}** · risk ${vpn.risk}`,
          vpn.provider ? `Provider ${vpn.provider}` : null,
          vpn.country ? `Country ${vpn.country}` : null,
        ],
      });
      return fail(
        "vpn",
        "VPN blocked",
        "Umbrella does not allow VPNs, proxies, Tor, or hosting ranges. Disable them and retry from a residential connection."
      );
    }

    const owners = await findAccountsForIp(ip);
    const foreign = owners.filter((id) => id !== pending.user_id);
    if (foreign.length > 0) {
      await markPendingUsed(token);
      await logEvent({
        discordId: pending.user_id,
        guildId: pending.guild_id,
        ip,
        status: "denied_alt",
        reason: `ip bound to ${foreign.join(",")}`,
      });
      await notify(pending, {
        color: 0xff4d4d,
        title: "Verification denied — identity collision",
        userId: pending.user_id,
        lines: [
          `IP \`${maskIp(ip)}\` is already bound to another Discord account.`,
          `Bound account(s): ${foreign.map((id) => `<@${id}> \`${id}\``).join(", ")}`,
        ],
      });
      return fail(
        "alt",
        "Account rejected",
        "This network address is already tied to a different Discord account. Umbrella will not verify a second identity on the same IP."
      );
    }

    const granted = await grantVerifiedRole(pending.guild_id, pending.user_id);
    if (!granted.ok) {
      await logEvent({
        discordId: pending.user_id,
        guildId: pending.guild_id,
        ip,
        status: "role_error",
        reason: granted.error,
      });
      await notify(pending, {
        color: 0x889188,
        title: "Verification passed scan, role failed",
        userId: pending.user_id,
        lines: [`IP \`${maskIp(ip)}\``, granted.error],
      });
      return fail(
        "role",
        "Role not applied",
        "Your identity passed, but the server role could not be assigned. Ask a staff member to check bot permissions.",
        granted.error,
        500
      );
    }

    await recordVerifiedIp(pending.user_id, ip);
    await markPendingUsed(token);
    await logEvent({
      discordId: pending.user_id,
      guildId: pending.guild_id,
      ip,
      status: "success",
      reason: owners.includes(pending.user_id) ? "returning" : "new",
    });
    await notify(pending, {
      color: 0x6ee7a8,
      title: "Verification passed",
      userId: pending.user_id,
      lines: [
        `IP \`${maskIp(ip)}\``,
        vpn.ok ? `Network **${vpn.type}** · risk ${vpn.risk}` : "Network scan skipped",
        `Role <@&${granted.role.id}> granted`,
      ],
    });

    return res.type("html").send(
      renderVerifyPage({
        state: "success",
        title: "Verified",
        headline: "Access granted",
        body: "Identity confirmed. Your verified role has been applied. You can close this tab and return to Discord.",
      })
    );
  });

  return app;
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf && typeof cf === "string") return normalizeIp(cf);
  const real = req.headers["x-real-ip"];
  if (real && typeof real === "string") return normalizeIp(real.split(",")[0]);
  const fwd = req.headers["x-forwarded-for"];
  if (fwd && typeof fwd === "string") return normalizeIp(fwd.split(",")[0]);
  return normalizeIp(req.ip);
}

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip || null;
}

function maskIp(ip) {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + ":****";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip;
}

async function notify(pending, { color, title, userId, lines }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      [`User <@${userId}> \`${userId}\``, "", ...lines.filter(Boolean)].join("\n")
    )
    .setTimestamp(new Date());
  await sendLog(pending.guild_id, embed);
}
