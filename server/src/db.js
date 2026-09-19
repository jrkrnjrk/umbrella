import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
  max: 10,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      verify_role_id TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pending_verifications (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS verified_ips (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      ip TEXT NOT NULL,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (discord_id, ip)
    );

    CREATE INDEX IF NOT EXISTS idx_verified_ips_ip ON verified_ips (ip);
    CREATE INDEX IF NOT EXISTS idx_verified_ips_discord ON verified_ips (discord_id);

    CREATE TABLE IF NOT EXISTS verification_events (
      id SERIAL PRIMARY KEY,
      discord_id TEXT,
      guild_id TEXT,
      ip TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_events_discord ON verification_events (discord_id);
  `);
}

export async function getGuildSettings(guildId) {
  const { rows } = await pool.query(
    "SELECT * FROM guild_settings WHERE guild_id = $1",
    [guildId]
  );
  return rows[0] || { guild_id: guildId, log_channel_id: null, verify_role_id: null };
}

export async function setLogChannel(guildId, channelId) {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, log_channel_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET log_channel_id = EXCLUDED.log_channel_id, updated_at = NOW()`,
    [guildId, channelId]
  );
}

export async function setVerifyRole(guildId, roleId) {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, verify_role_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET verify_role_id = EXCLUDED.verify_role_id, updated_at = NOW()`,
    [guildId, roleId]
  );
}

export async function createPending({ token, userId, guildId, expiresAt }) {
  await pool.query(
    `INSERT INTO pending_verifications (token, user_id, guild_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, userId, guildId, expiresAt]
  );
}

export async function getPending(token) {
  const { rows } = await pool.query(
    "SELECT * FROM pending_verifications WHERE token = $1",
    [token]
  );
  return rows[0] || null;
}

export async function markPendingUsed(token) {
  await pool.query(
    "UPDATE pending_verifications SET used = TRUE WHERE token = $1",
    [token]
  );
}

export async function findAccountsForIp(ip) {
  const { rows } = await pool.query(
    "SELECT DISTINCT discord_id FROM verified_ips WHERE ip = $1",
    [ip]
  );
  return rows.map((r) => r.discord_id);
}

export async function recordVerifiedIp(discordId, ip) {
  await pool.query(
    `INSERT INTO verified_ips (discord_id, ip, first_seen, last_seen)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (discord_id, ip)
     DO UPDATE SET last_seen = NOW()`,
    [discordId, ip]
  );
}

export async function logEvent({ discordId, guildId, ip, status, reason }) {
  await pool.query(
    `INSERT INTO verification_events (discord_id, guild_id, ip, status, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [discordId || null, guildId || null, ip || null, status, reason || null]
  );
}
