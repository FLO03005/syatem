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

function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// =====================
// THREAT SYSTEM
// =====================
const threat = new Map();

function addThreat(id, amount) {
  threat.set(id, (threat.get(id) || 0) + amount);
  return threat.get(id);
}

// =====================
// MESSAGE CACHE (FOR IMAGES)
// =====================
const messageCache = new Map();

// =====================
// LOG SYSTEM
// =====================
function sendLog(guild, title, desc, color = "#2b2d31") {
  const ch = guild.channels.cache.get(config.logs?.main);
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
// SETUP COMMAND
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup Wick Style Security System")
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
// SETUP SYSTEM
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "setup") {
    const g = i.guild;

    const cat = await g.channels.create({
      name: "🛡️ WICK SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const t of ["main", "messages", "members", "channels", "security"]) {
      const ch = await g.channels.create({
        name: `log-${t}`,
        type: ChannelType.GuildText,
        parent: cat.id
      });

      logs[t] = ch.id;
    }

    config.logs = logs;
    saveConfig();

    return i.reply({
      content: "🛡️ Wick System Activated",
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// MESSAGE CACHE (SAVE BEFORE DELETE)
// =====================
client.on("messageCreate", (m) => {
  if (!m.guild) return;

  messageCache.set(m.id, {
    content: m.content,
    files: [...m.attachments.values()].map(a => a.url),
    author: m.author.tag
  });
});

// =====================
// MESSAGE DELETE LOG
// =====================
client.on("messageDelete", (m) => {
  const data = messageCache.get(m.id);

  const embed = new EmbedBuilder()
    .setTitle("🗑️ Message Deleted")
    .setColor("Red")
    .addFields(
      { name: "User", value: data?.author || "Unknown" },
      { name: "Content", value: data?.content || "No Content" }
    )
    .setTimestamp();

  const ch = m.guild.channels.cache.get(config.logs?.messages);
  if (ch) {
    ch.send({ embeds: [embed] });

    if (data?.files?.length) {
      ch.send({ files: data.files });
    }
  }

  addThreat(m.author?.id, 0.5);
  messageCache.delete(m.id);
});

// =====================
// CHANNEL DELETE (ANTI NUKE)
// =====================
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;
  const member = await channel.guild.members.fetch(user.id).catch(() => null);

  const level = addThreat(user.id, 3);

  const ch = channel.guild.channels.cache.get(config.logs?.security);

  if (ch) {
    ch.send(`🚨 ${user.tag} deleted channel ${channel.name} | Threat: ${level}`);
  }

  if (!member) return;

  if (level >= 3) member.timeout(60 * 1000);
  if (level >= 6) member.ban({ reason: "Wick Style Anti-Nuke" });

  if (level >= 6) {
    channel.guild.roles.everyone.setPermissions([]);
  }
});

// =====================
// MASS BAN DETECT
// =====================
client.on("guildBanAdd", async (ban) => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;

  const level = addThreat(user.id, 4);

  const ch = ban.guild.channels.cache.get(config.logs?.security);

  if (ch) {
    ch.send(`🚨 Mass Ban by ${user.tag} | Threat: ${level}`);
  }

  if (level >= 6) {
    const member = await ban.guild.members.fetch(user.id).catch(() => null);
    if (member) member.ban({ reason: "Mass Ban Protection" });
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
