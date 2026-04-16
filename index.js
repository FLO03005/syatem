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
// WHITELIST
// =====================
const whitelist = ["YOUR_ID_HERE"];

// =====================
// THREAT SYSTEM
// =====================
const threatData = new Map();

function addThreat(id, amount) {
  const now = Date.now();
  const data = threatData.get(id) || { points: 0, last: now };

  const diff = (now - data.last) / 1000;
  data.points = Math.max(0, data.points - diff * 0.05);

  data.points += amount;
  data.last = now;

  threatData.set(id, data);
  return data.points;
}

// =====================
// EMBED
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
      { name: "👤 المستخدم", value: `${userName}\n(${userId})` },
      { name: "⚡ الحدث", value: action },
      { name: "🎯 المستهدف", value: `${targetName}\n(${targetId})` },
      { name: "🏷️ الروم", value: room, inline: true },
      { name: "📊 إضافي", value: extra.length ? extra.join("\n") : "لا يوجد" }
    )
    .setTimestamp();
}

// =====================
// SEND LOG
// =====================
function sendLog(guild, type, embed) {
  const ch = guild.channels.cache.get(config.logs[type]);
  if (!ch) return;
  ch.send({ embeds: [embed] });
}

// =====================
// PUNISH
// =====================
async function punish(member, level, reason) {
  if (!member) return;

  if (level >= 10) return member.ban({ reason }).catch(() => {});
  if (level >= 7) return member.kick(reason).catch(() => {});
  if (level >= 4) return member.timeout(5 * 60 * 1000).catch(() => {});
}

// =====================
// LOCKDOWN
// =====================
async function checkLockdown(guild, level) {
  if (level < 12) return;

  await guild.roles.everyone.setPermissions([]);

  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🚨 LOCKDOWN")
    .setDescription("تم قفل السيرفر بسبب هجوم");

  sendLog(guild, "security", embed);
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create System")
].map(c => c.toJSON());

// =====================
// REGISTER
// =====================
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
// SETUP
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "setup") {
    const g = i.guild;

    const cat = await g.channels.create({
      name: "🛡️ SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const t of [
      "messages",
      "members",
      "channels",
      "security",
      "roles-add",
      "roles-remove",
      "roles-delete",
      "timeout",
      "kick",
      "ban"
    ]) {
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
      content: "✅ System Ready",
      flags: MessageFlags.Ephemeral
    });
  }
});

// =====================
// MESSAGE CACHE
// =====================
const cache = new Map();

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

  sendLog(
    m.guild,
    "messages",
    wickLog({
      type: "Messages",
      userName: data?.author?.tag || m.author?.tag,
      userId: data?.author?.id || m.author?.id,
      action: "حذف رسالة",
      targetName: m.channel.name,
      targetId: m.channel.id,
      room: "messages",
      extra: [`💬 ${data?.content || "لا يوجد"}`],
      color: "#ED4245"
    })
  );
});

// =====================
// MESSAGE EDIT
// =====================
client.on("messageUpdate", (oldM, newM) => {
  if (!oldM.guild) return;

  sendLog(
    oldM.guild,
    "messages",
    wickLog({
      type: "Messages",
      userName: oldM.author?.tag,
      userId: oldM.author?.id,
      action: "تعديل رسالة",
      targetName: oldM.channel.name,
      targetId: oldM.channel.id,
      room: "messages",
      extra: [
        `قبل: ${oldM.content || "لا يوجد"}`,
        `بعد: ${newM.content || "لا يوجد"}`
      ],
      color: "#FEE75C"
    })
  );
});

// =====================
// ROLE UPDATE
// =====================
client.on("guildMemberUpdate", async (oldM, newM) => {
  const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
  const removed = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));

  if (!added.size && !removed.size) return;

  const logs = await newM.guild.fetchAuditLogs({ type: 25, limit: 1 });
  const entry = logs.entries.first();
  const user = entry?.executor;

  if (added.size) {
    sendLog(
      newM.guild,
      "roles-add",
      wickLog({
        type: "Roles",
        userName: user?.tag,
        userId: user?.id,
        action: "إعطاء رتبة",
        targetName: newM.user.tag,
        targetId: newM.user.id,
        room: "roles-add",
        extra: [`🎭 ${added.map(r => r.name).join(", ")}`]
      })
    );
  }

  if (removed.size) {
    sendLog(
      newM.guild,
      "roles-remove",
      wickLog({
        type: "Roles",
        userName: user?.tag,
        userId: user?.id,
        action: "إزالة رتبة",
        targetName: newM.user.tag,
        targetId: newM.user.id,
        room: "roles-remove",
        extra: [`❌ ${removed.map(r => r.name).join(", ")}`]
      })
    );
  }
});

// =====================
// ROLE DELETE
// =====================
client.on("roleDelete", async (role) => {
  const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 1 });
  const entry = logs.entries.first();

  if (!entry) return;

  const user = entry.executor;
  const level = addThreat(user.id, 3);

  sendLog(
    role.guild,
    "roles-delete",
    wickLog({
      type: "Roles",
      userName: user.tag,
      userId: user.id,
      action: "حذف رتبة",
      targetName: role.name,
      targetId: role.id,
      room: "roles-delete",
      extra: [`⚠️ Threat: ${level}`],
      color: "#FF0000"
    })
  );

  const member = await role.guild.members.fetch(user.id).catch(() => null);

  if (member) {
    if (level >= 3) member.timeout(60000).catch(() => {});
    if (level >= 6) member.ban({ reason: "Role Delete" }).catch(() => {});
  }
});

// =====================
// KICK
// =====================
client.on("guildMemberRemove", async (member) => {
  const logs = await member.guild.fetchAuditLogs({ type: 20, limit: 1 });
  const entry = logs.entries.first();

  if (!entry || entry.target.id !== member.id) return;

  sendLog(
    member.guild,
    "kick",
    wickLog({
      type: "Kick",
      userName: entry.executor.tag,
      userId: entry.executor.id,
      action: "طرد عضو",
      targetName: member.user.tag,
      targetId: member.user.id,
      room: "kick"
    })
  );
});

// =====================
// BAN
// =====================
client.on("guildBanAdd", async (ban) => {
  const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = logs.entries.first();

  sendLog(
    ban.guild,
    "ban",
    wickLog({
      type: "Ban",
      userName: entry?.executor?.tag,
      userId: entry?.executor?.id,
      action: "حظر عضو",
      targetName: ban.user.tag,
      targetId: ban.user.id,
      room: "ban"
    })
  );
});

// =====================
// BOT PROTECTION
// =====================
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({ type: 28, limit: 1 });
  const entry = logs.entries.first();

  if (!entry) return;

  const level = addThreat(entry.executor.id, 6);

  await member.kick().catch(() => {});

  const m = await member.guild.members.fetch(entry.executor.id).catch(() => null);

  if (m) {
    if (level >= 5) m.timeout(60000).catch(() => {});
    if (level >= 8) m.ban({ reason: "Bot Add" }).catch(() => {});
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
