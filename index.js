const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder
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
if (!config.allowedRoles) config.allowedRoles = {};

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
// SEND LOG (FIXED LOGIC)
// =====================
function sendLog(guild, type, embed) {
  const channel = guild.channels.cache.get(config.logs[type]);
  if (!channel) return;

  const allowedRoles = config.allowedRoles[type];

  // لو ما فيه تحديد → عادي يرسل للروم
  if (!allowedRoles || !allowedRoles.length) {
    return channel.send({ embeds: [embed] });
  }

  // نجيب الأعضاء اللي عندهم الرتب المختارة
  const membersToNotify = channel.guild.members.cache.filter(member =>
    member.roles.cache.some(r => allowedRoles.includes(r.id))
  );

  const mentions = membersToNotify.map(m => `<@${m.id}>`).join(" ");

  return channel.send({
    content: mentions || null,
    embeds: [embed]
  });
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create System"),

  new SlashCommandBuilder()
    .setName("logroles")
    .setDescription("تحديد الرتب اللي تستلم تنبيه اللوقات")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("نوع اللوق")
        .setRequired(true)
        .addChoices(
          { name: "messages", value: "messages" },
          { name: "members", value: "members" },
          { name: "channels", value: "channels" },
          { name: "security", value: "security" },
          { name: "roles-add", value: "roles-add" },
          { name: "roles-remove", value: "roles-remove" },
          { name: "roles-delete", value: "roles-delete" },
          { name: "timeout", value: "timeout" },
          { name: "kick", value: "kick" },
          { name: "ban", value: "ban" }
        )
    )
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await register();
});

// =====================
// SETUP + LOGROLES
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  // SETUP
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

  // LOGROLES
  if (i.commandName === "logroles") {
    const type = i.options.getString("type");

    const roles = i.guild.roles.cache
      .filter(r => r.id !== i.guild.id)
      .map(r => ({
        label: r.name.slice(0, 25),
        value: r.id
      }))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`logroles_${type}`)
      .setPlaceholder("اختار الرتب اللي تستلم تنبيه اللوق")
      .setMinValues(0)
      .setMaxValues(roles.length)
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    return i.reply({
      content: `🎛️ اختر الرتب لتنبيه لوق: **${type}**`,
      components: [row],
      ephemeral: true
    });
  }
});

// =====================
// SELECT MENU SAVE
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isStringSelectMenu()) return;
  if (!i.customId.startsWith("logroles_")) return;

  const type = i.customId.split("_")[1];

  config.allowedRoles[type] = i.values;
  saveConfig();

  return i.update({
    content: `✅ تم تحديد الرتب لتنبيه لوق **${type}**`,
    components: []
  });
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
