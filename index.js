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
// ENV
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =====================
// BOT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// =====================
// CONFIG
// =====================
let config = {};
try {
  config = require("./config.json");
} catch {
  config = {};
}

function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

if (!config.channels) config.channels = {};
if (!config.channels.logs) config.channels.logs = {};
if (!config.whitelist) config.whitelist = [];

// =====================
// SECURITY MAPS
// =====================
const raidMap = new Map();
const deleteMap = new Map();

// =====================
// CHECKS
// =====================
function isWhitelisted(id) {
  return config.whitelist.includes(id);
}

function isLogChannel(id) {
  return Object.values(config.channels.logs).includes(id);
}

// =====================
// LOG SYSTEM
// =====================
function sendLog(guild, type, embed) {
  const id = config.channels.logs[type];
  if (!id) return;

  const ch = guild.channels.cache.get(id);
  if (!ch) return;

  ch.send({ embeds: [embed] });
}

// =====================
// REGISTER COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("إنشاء نظام الحماية الكامل"),
  new SlashCommandBuilder().setName("whitelist-add").setDescription("إضافة شخص للحماية")
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands ready");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// =====================
// SETUP
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guild = interaction.guild;

  // =====================
  // SETUP SYSTEM
  // =====================
  if (interaction.commandName === "setup") {

    const category = await guild.channels.create({
      name: "🛡️ SECURITY SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const name of ["messages", "members", "channels", "security"]) {
      const ch = await guild.channels.create({
        name: `log-${name}`,
        type: ChannelType.GuildText,
        parent: category.id
      });
      logs[name] = ch.id;
    }

    config.channels.logs = logs;
    saveConfig();

    return interaction.reply({
      content: "🛡️ Ultra Security System Ready",
      flags: MessageFlags.Ephemeral
    });
  }

  // =====================
  // WHITELIST ADD
  // =====================
  if (interaction.commandName === "whitelist-add") {
    const user = interaction.options.getUser("user");

    if (!user) return;

    config.whitelist.push(user.id);
    saveConfig();

    return interaction.reply({
      content: `✅ Added to whitelist: ${user.tag}`,
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// RAID DETECTION (MEMBER JOIN SPAM)
// =====================
client.on("guildMemberAdd", (member) => {
  const id = member.guild.id;

  raidMap.set(id, (raidMap.get(id) || 0) + 1);

  setTimeout(() => raidMap.delete(id), 10000);

  if (raidMap.get(id) >= 5) {
    member.guild.roles.everyone.setPermissions([]);

    const log = member.guild.channels.cache.get(config.channels.logs.security);
    if (log) {
      log.send("🚨 RAID DETECTED → Server Locked");
    }
  }

  sendLog(member.guild, "members",
    new EmbedBuilder()
      .setColor("Green")
      .setTitle("📥 Join")
      .setDescription(member.user.tag)
  );
});

// =====================
// MEMBER REMOVE LOG
// =====================
client.on("guildMemberRemove", (member) => {
  sendLog(member.guild, "members",
    new EmbedBuilder()
      .setColor("Red")
      .setTitle("📤 Leave")
      .setDescription(member.user.tag)
  );
});

// =====================
// MESSAGE DELETE + TRACKER
// =====================
client.on("messageDelete", async (message) => {
  if (!message.guild) return;

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🗑️ Deleted Message")
    .addFields(
      { name: "User", value: `${message.author?.tag || "Unknown"}` },
      { name: "Content", value: message.content || "No Content" }
    )
    .setTimestamp();

  sendLog(message.guild, "messages", embed);

  deleteMap.set(message.author?.id, (deleteMap.get(message.author?.id) || 0) + 1);

  if (deleteMap.get(message.author?.id) >= 6) {
    const member = message.guild.members.cache.get(message.author.id);
    if (member && !isWhitelisted(member.id)) {
      member.timeout(60 * 1000);
    }
  }

  setTimeout(() => deleteMap.delete(message.author?.id), 15000);
});

// =====================
// CHANNEL DELETE (ANTI NUKE CORE)
// =====================
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  if (isLogChannel(channel.id)) {
    const newCh = await channel.guild.channels.create({
      name: channel.name,
      type: ChannelType.GuildText,
      parent: channel.parentId
    });

    config.channels.logs[channel.name.split("-")[1]] = newCh.id;
    saveConfig();
  }

  const logs = await channel.guild.fetchAuditLogs({
    type: 12,
    limit: 1
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;

  const member = await channel.guild.members.fetch(user.id).catch(() => null);

  if (!member || isWhitelisted(member.id)) return;

  raidMap.set(user.id, (raidMap.get(user.id) || 0) + 1);

  if (raidMap.get(user.id) >= 3) {
    await member.timeout(10 * 60 * 1000);

    const log = channel.guild.channels.cache.get(config.channels.logs.security);
    if (log) {
      log.send(`🚨 Anti-Nuke: ${user.tag} punished`);
    }
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
