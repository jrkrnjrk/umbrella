import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import crypto from "node:crypto";
import {
  createPending,
  getGuildSettings,
  setLogChannel,
  setVerifyRole,
} from "./db.js";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the Umbrella verification panel in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setlogs")
    .setDescription("Set the channel where verification logs are sent")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Log channel")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("setverifyrole")
    .setDescription("Set the role granted after a successful verification")
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("Verified role").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

export async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
    body: commands,
  });
  console.log("Slash commands registered globally.");
}

export function startBot() {
  client.on("ready", () => {
    console.log(`Bot online as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: "umbrella gate" }],
      status: "online",
    });
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "panel") return handlePanel(interaction);
        if (interaction.commandName === "setlogs") return handleSetLogs(interaction);
        if (interaction.commandName === "setverifyrole") return handleSetRole(interaction);
      }
      if (interaction.isButton() && interaction.customId === "umbrella_verify") {
        return handleVerifyButton(interaction);
      }
    } catch (err) {
      console.error("interaction error", err);
      const payload = {
        content: "Umbrella failed to process that request. Try again.",
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  return client.login(process.env.DISCORD_TOKEN);
}

async function handlePanel(interaction) {
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings.verify_role_id) {
    return interaction.reply({
      content: "Set a verified role first with `/setverifyrole`.",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x6ee7a8)
    .setTitle("UMBRELLA  //  ACCESS GATE")
    .setDescription(
      [
        "This server is protected by **Umbrella Verification**.",
        "",
        "Military-grade gate. One identity. No VPNs. No alternate accounts on the same network.",
        "",
        "Press **Verify** and open the private link. The scan takes a few seconds.",
      ].join("\n")
    )
    .setFooter({ text: "Umbrella Verification · do not share your link" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("umbrella_verify")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "Panel deployed.", ephemeral: true });
}

async function handleSetLogs(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
    return interaction.reply({
      content: "I need **Send Messages** and **Embed Links** in that channel.",
      ephemeral: true,
    });
  }
  await setLogChannel(interaction.guildId, channel.id);
  await interaction.reply({
    content: `Verification logs will be sent to ${channel}.`,
    ephemeral: true,
  });
}

async function handleSetRole(interaction) {
  const role = interaction.options.getRole("role", true);
  if (role.managed) {
    return interaction.reply({
      content: "That role is managed by an integration and cannot be assigned.",
      ephemeral: true,
    });
  }
  if (role.id === interaction.guild.id) {
    return interaction.reply({
      content: "The @everyone role cannot be used as the verified role.",
      ephemeral: true,
    });
  }
  const me = interaction.guild.members.me;
  if (role.position >= me.roles.highest.position) {
    return interaction.reply({
      content: "Move my highest role above the verified role so I can assign it.",
      ephemeral: true,
    });
  }
  await setVerifyRole(interaction.guildId, role.id);
  await interaction.reply({
    content: `Verified members will receive ${role}.`,
    ephemeral: true,
  });
}

async function handleVerifyButton(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: "Use this inside a server.", ephemeral: true });
  }

  const settings = await getGuildSettings(interaction.guildId);
  if (!settings.verify_role_id) {
    return interaction.reply({
      content: "This server has not configured a verified role yet.",
      ephemeral: true,
    });
  }

  const minutes = Number(process.env.TOKEN_TTL_MINUTES || 15);
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  await createPending({
    token,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    expiresAt,
  });

  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const url = `${base}/v/${token}`;

  const embed = new EmbedBuilder()
    .setColor(0x6ee7a8)
    .setTitle("Your personal gate")
    .setDescription(
      [
        "Open the link below on the same device. Do not share it.",
        "",
        `[Continue verification](${url})`,
        "",
        `Link expires in **${minutes} minutes**. VPNs, proxies, and Tor are blocked.`,
      ].join("\n")
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function sendLog(guildId, embed) {
  try {
    const settings = await getGuildSettings(guildId);
    if (!settings.log_channel_id) return;
    const channel = await client.channels.fetch(settings.log_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("log send failed", err);
  }
}

export async function grantVerifiedRole(guildId, userId) {
  const settings = await getGuildSettings(guildId);
  if (!settings.verify_role_id) {
    return { ok: false, error: "Verified role is not configured." };
  }
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(userId);
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: "Bot is missing Manage Roles." };
  }
  const role = await guild.roles.fetch(settings.verify_role_id);
  if (!role) return { ok: false, error: "Verified role no longer exists." };
  if (role.position >= me.roles.highest.position) {
    return { ok: false, error: "Bot role is below the verified role." };
  }
  await member.roles.add(role, "Umbrella Verification");
  return { ok: true, role };
}
