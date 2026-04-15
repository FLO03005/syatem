const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
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
const cache = new Map();

function addThreat(id, amount) {
  threat.set(id, (threat.get(id) || 0) + amount);
  return threat.get(id);
}

// =====================
// EMBED BUILDER (ALL LOGS)
// =====================
function buildEmbed({ user, action, target, level = 0 }) {
  return new EmbedBuilder()
    .setColor(level >= 6 ? "#ff0000" : level >= 3 ? "#ffa500" : "#2b2d31")
    .setTitle("🚨 SECURITY LOG")
    .setThumbnail(user?.displayAvatarURL?.({ dynamic: true }) || null)
    .addFields(
      {
        name: "👤 User",
        value: `${user?.tag || "Unknown"}\n\`${user?.id || "N/A"}\``,
        inline: true
      },
      {
        name: "⚡ Action",
        value: action,
        inline: true
      },
      {
        name: "📌 Target",
        value: target || "None",
        inline: true
      },
      {
        name: "⚠️ Threat",
        value: `\`${level}\``,
        inline: true
      },
      {
        name: "🛡️ Status",
        value:
          level >= 6 ? "🔴 CRITICAL" :
          level >= 3 ? "🟠 WARNING" :
          "🟢 SAFE",
        inline: true
      }
    )
    .setFooter({ text: "Ultra Security System" })
    .setTimestamp();
}

// =====================
// LOG SENDER
// =====================
function sendLog(guild, type, embed, files = null) {
  const ch = guild.channels.cache.get(config.logs[type]);
  if (!ch) return;

  if (files) ch.send({ embeds: [embed], files });
  else ch.send({ embeds: [embed] });
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Create full security system")
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
      name: "🛡️ SECURITY SYSTEM",
      type: ChannelType.GuildCategory
    });

    const types = ["messages", "members", "channels", "security"];

    const logs = {};

    for (const t of types) {
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
      content: "🛡️ System Activated",
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// MESSAGE CACHE (FOR IMAGES)
// =====================
client.on("messageCreate", (m) => {
  if (!m.guild) return;

  cache.set(m.id, {
    content: m.content,
    files: [...m.attachments.values()].map(a => a.url),
    author: m.author
  });
});

// =====================
// MESSAGE DELETE
// =====================
client.on("messageDelete", (m) => {
  const data = cache.get(m.id);

  const embed = buildEmbed({
    user: data?.author || m.author,
    action: "Message Deleted",
    target: m.channel.name,
    level: 1
  });

  const files = data?.files?.length ? data.files : null;

  sendLog(m.guild, "messages", embed, files);

  addThreat(m.author?.id, 0.5);
  cache.delete(m.id);
});

// =====================
// MESSAGE EDIT
// =====================
client.on("messageUpdate", (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;

  const embed = buildEmbed({
    user: oldMsg.author,
    action: "Message Edited",
    target: oldMsg.channel.name,
    level: 1
  });

  sendLog(oldMsg.guild, "messages", embed);
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

  const embed = buildEmbed({
    user,
    action: "Channel Deleted",
    target: channel.name,
    level
  });

  sendLog(channel.guild, "security", embed);

  if (member) {
    if (level >= 3) member.timeout(60 * 1000);
    if (level >= 6) member.ban({ reason: "Anti-Nuke System" });
  }

  if (level >= 6) {
    channel.guild.roles.everyone.setPermissions([]);
  }
});

// =====================
// MASS BAN
// =====================
client.on("guildBanAdd", async (ban) => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;

  const user = entry.executor;

  const level = addThreat(user.id, 4);

  const embed = buildEmbed({
    user,
    action: "Mass Ban",
    target: ban.user.tag,
    level
  });

  sendLog(ban.guild, "security", embed);

  if (level >= 6) {
    const member = await ban.guild.members.fetch(user.id).catch(() => null);
    if (member) member.ban({ reason: "Mass Ban Protection" });
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
