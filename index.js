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
    GatewayIntentBits.GuildMembers
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
      {
        name: "👤 المستخدم",
        value: `${userName}\n(${userId})`
      },
      {
        name: "⚡ الحدث",
        value: action
      },
      {
        name: "🎯 المستهدف",
        value: `${targetName}\n(${targetId})`
      },
      {
        name: "🏷️ الروم",
        value: room,
        inline: true
      },
      {
        name: "📊 إضافي",
        value: extra.length ? extra.join("\n") : "لا يوجد"
      }
    )
    .setTimestamp();
}

// =====================
// LOG SENDER
// =====================
function sendLog(guild, type, embed) {
  const ch = guild.channels.cache.get(config.logs[type]);
  if (!ch) return;
  ch.send({ embeds: [embed] });
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create Wicks Security System")
].map(c => c.toJSON());

async function register() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

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
      name: "🛡️ WICKS SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const t of [
      "roles-add",
      "roles-remove",
      "roles-delete"
    ]) {
      const ch = await g.channels.create({
        name: t,
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
// ROLE ADD / REMOVE
// =====================
client.on("guildMemberUpdate", async (oldM, newM) => {
  const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
  const removed = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));

  if (!added.size && !removed.size) return;

  const logs = await newM.guild.fetchAuditLogs({ type: 25, limit: 1 });
  const entry = logs.entries.first();
  const executor = entry?.executor;

  // ADD
  if (added.size) {
    const embed = wickLog({
      type: "Role Add",
      userName: executor?.tag || "Unknown",
      userId: executor?.id || "-",
      action: "إعطاء رتبة",
      targetName: newM.user.tag,
      targetId: newM.user.id,
      room: "Role Add",
      extra: [`🎭 ${added.map(r => r.name).join(", ")}`],
      color: "#57F287"
    });

    sendLog(newM.guild, "roles-add", embed);
  }

  // REMOVE
  if (removed.size) {
    const embed = wickLog({
      type: "Role Remove",
      userName: executor?.tag || "Unknown",
      userId: executor?.id || "-",
      action: "إزالة رتبة",
      targetName: newM.user.tag,
      targetId: newM.user.id,
      room: "Role Remove",
      extra: [`❌ ${removed.map(r => r.name).join(", ")}`],
      color: "#ED4245"
    });

    sendLog(newM.guild, "roles-remove", embed);
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

  const embed = wickLog({
    type: "Role Delete",
    userName: user.tag,
    userId: user.id,
    action: "حذف رتبة",
    targetName: role.name,
    targetId: role.id,
    room: "Role Delete",
    extra: [`⚠️ Threat: ${level}`],
    color: level >= 6 ? "#FF0000" : "#FFA500"
  });

  sendLog(role.guild, "roles-delete", embed);

  const member = await role.guild.members.fetch(user.id).catch(() => null);

  if (member) {
    if (level >= 3) member.timeout(60 * 1000);
    if (level >= 6) member.ban({ reason: "Role Delete Protection" });
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
