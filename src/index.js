import "dotenv/config";
import { initDb } from "./db.js";
import { createApi } from "./api.js";
import { registerCommands, startBot } from "./bot.js";

function required(name) {
  if (!process.env[name]) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

required("DISCORD_TOKEN");
required("DISCORD_CLIENT_ID");
required("DATABASE_URL");
required("PUBLIC_BASE_URL");

const port = Number(process.env.PORT || 3000);

await initDb();
console.log("Database schema ready.");

await registerCommands();
await startBot();

const app = createApi();
app.listen(port, "0.0.0.0", () => {
  console.log(`Verification node listening on :${port}`);
});
