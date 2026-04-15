const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags
} = require("discord.js");

const fs = require("fs");

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

let config = {};
try { config = require("./config.json"); } catch {}

if (!config.logs) config.logs = {};
if (!config.whitelist) config.whitelist = [];

const threat = new Map();

// =====================
// SAVE
// =====================
function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// =====================
// CHECK
// =====================
const isWhite = (id) => config.whitelist.includes(id);

// =====================
// LOG SYSTEM
// =====================
function log(guild, title, desc, color = "#2b2d31") {
  const ch = guild.channels.cache.get(config.logs.main);
  if (!ch) return;

  ch.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp()
    ]
  });
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Setup System")
].map(c => c.toJSON());

async function register() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await register();
});

// =====================
// SETUP (AUTO SYSTEM)
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup") {

    const guild = interaction.guild;

    const category = await guild.channels.create({
      name: "🛡️ SECURITY SYSTEM",
      type: ChannelType.GuildCategory
    });

    const main = await guild.channels.create({
      name: "🚨-logs",
      type: ChannelType.GuildText,
      parent: category.id
    });

    config.logs.main = main.id;
    saveConfig();

    return interaction.reply({
      content: "🛡️ System Activated",
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// THREAT SYSTEM
// =====================
function addThreat(id, amount) {
  threat.set(id, (threat.get(id) || 0) + amount);
  return threat.get(id);
}

function punish(member, level) {
  if (!member || isWhite(member.id)) return;

  if (level >= 3) {
    member.timeout(60 * 1000);
  }

  if (level >= 6) {
    member.ban({ reason: "Ultra Security System" });
  }
}

// =====================
// CHANNEL DELETE (ANTI NUKE CORE)
// =====================
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;
  const member = await channel.guild.members.fetch(user.id).catch(() => null);

  const level = addThreat(user.id, 3);

  log(channel.guild,
    "🗑️ Channel Deleted",
    `${user.tag} deleted ${channel.name}\nThreat: ${level}`,
    "Red"
  );

  punish(member, level);

  if (level >= 6) {
    channel.guild.roles.everyone.setPermissions([]);
    log(channel.guild, "🚨 LOCKDOWN", "Server locked due to attack", "DarkRed");
  }
});

// =====================
// MESSAGE DELETE
// =====================
client.on("messageDelete", (message) => {
  if (!message.guild) return;

  log(
    message.guild,
    "🗑️ Message Deleted",
    `${message.author?.tag || "Unknown"}\n${message.content || "No Content"}`
  );

  addThreat(message.author?.id, 0.5);
});

// =====================
// MASS BAN DETECT
// =====================
client.on("guildBanAdd", async (ban) => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;
  const member = await ban.guild.members.fetch(user.id).catch(() => null);

  const level = addThreat(user.id, 4);

  log(ban.guild,
    "🚨 Mass Ban",
    `${user.tag} banned a user\nThreat: ${level}`,
    "Orange"
  );

  punish(member, level);
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
