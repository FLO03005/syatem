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
// WICKS STYLE EMBED (FINAL)
// =====================
function wickLog({
  type,
  userName,
  userId,
  action,
  targetName,
  targetId,
  room,
  extra = [],
  color
}) {
  return new EmbedBuilder()
    .setColor(color || "#2f3136")
    .setTitle(`📌 Log • ${type}`)
    .addFields(
      {
        name: "👤 اسم المستخدم",
        value: `${userName}\n(${userId})`,
        inline: false
      },
      {
        name: "⚡ الحدث",
        value: action,
        inline: false
      },
      {
        name: "🎯 المستهدف",
        value: `${targetName || "غير معروف"}\n(${targetId || "-"})`,
        inline: false
      },
      {
        name: "🏷️ الروم",
        value: room || "Unknown",
        inline: true
      },
      {
        name: "📊 معلومات إضافية",
        value: extra.length ? extra.join("\n") : "لا يوجد",
        inline: false
      }
    )
    .setFooter({ text: "Wicks Protection System" })
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
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create Wicks Style Security System")
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
      name: "🛡️ WICKS SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const t of ["messages", "members", "channels", "security"]) {
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
      content: "🛡️ Wicks System Activated",
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// MESSAGE CACHE (FOR FILES)
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

  const embed = wickLog({
    type: "Messages",
    userName: data?.author?.tag || m.author?.tag,
    userId: data?.author?.id || m.author?.id,
    action: "حذف رسالة",
    targetName: m.channel.name,
    targetId: m.channel.id,
    room: "Log • Messages",
    extra: [
      `💬 المحتوى: ${data?.content || "لا يوجد"}`
    ],
    color: "#ED4245"
  });

  sendLog(m.guild, "messages", embed, data?.files);

  addThreat(m.author?.id, 0.5);
  cache.delete(m.id);
});

// =====================
// MESSAGE EDIT
// =====================
client.on("messageUpdate", (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;

  const embed = wickLog({
    type: "Messages",
    userName: oldMsg.author?.tag,
    userId: oldMsg.author?.id,
    action: "تعديل رسالة",
    targetName: oldMsg.channel.name,
    targetId: oldMsg.channel.id,
    room: "Log • Messages",
    extra: [
      `✏️ قبل: ${oldMsg.content || "لا يوجد"}`,
      `📝 بعد: ${newMsg.content || "لا يوجد"}`
    ],
    color: "#FEE75C"
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

  const embed = wickLog({
    type: "Channel",
    userName: user.tag,
    userId: user.id,
    action: "حذف روم",
    targetName: channel.name,
    targetId: channel.id,
    room: "Log • Channel",
    extra: [`⚠️ Threat: ${level}`],
    color: level >= 6 ? "#FF0000" : "#FFA500"
  });

  sendLog(channel.guild, "security", embed);

  if (member) {
    if (level >= 3) member.timeout(60 * 1000);
    if (level >= 6) member.ban({ reason: "Wicks Anti-Nuke" });
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

  const embed = wickLog({
    type: "Ban",
    userName: user.tag,
    userId: user.id,
    action: "حظر جماعي",
    targetName: ban.user.tag,
    targetId: ban.user.id,
    room: "Log • Ban",
    extra: [`🚨 Threat: ${level}`],
    color: "#FF0000"
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
