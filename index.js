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
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
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
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create System"),

  new SlashCommandBuilder()
    .setName("delete-rooms")
    .setDescription("حذف رومات عن طريق قائمة")

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
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() && !i.isStringSelectMenu() && !i.isButton()) return;

  // =====================
  // SETUP
  // =====================
  if (i.isChatInputCommand() && i.commandName === "setup") {
    const g = i.guild;

    const cat = await g.channels.create({
      name: "🛡️ SYSTEM",
      type: ChannelType.GuildCategory
    });

    const logs = {};

    for (const t of [
      "messages","members","channels","security",
      "roles-add","roles-remove","roles-delete",
      "timeout","kick","ban"
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

  // =====================
  // DELETE ROOMS COMMAND
  // =====================
  if (i.isChatInputCommand() && i.commandName === "delete-rooms") {

    if (!whitelist.includes(i.user.id)) {
      return i.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
    }

    const channels = i.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .map(c => ({
        label: c.name,
        value: c.id
      }))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("select_delete_rooms")
      .setPlaceholder("اختر الرومات")
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(channels);

    const row = new ActionRowBuilder().addComponents(menu);

    return i.reply({
      content: "اختر الرومات اللي تبي تحذفها",
      components: [row],
      ephemeral: true
    });
  }

  // =====================
  // SELECT MENU
  // =====================
  if (i.isStringSelectMenu() && i.customId === "select_delete_rooms") {

    const selected = i.values;

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm_delete_${selected.join(",")}`)
      .setLabel("تأكيد الحذف")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(confirmBtn);

    return i.update({
      content: `⚠️ بتسوي حذف لـ ${selected.length} روم`,
      components: [row]
    });
  }

  // =====================
  // CONFIRM DELETE
  // =====================
  if (i.isButton() && i.customId.startsWith("confirm_delete_")) {

    if (!whitelist.includes(i.user.id)) {
      return i.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
    }

    const ids = i.customId.replace("confirm_delete_", "").split(",");

    for (const id of ids) {
      const ch = i.guild.channels.cache.get(id);
      if (!ch) continue;

      if (Object.values(config.logs).includes(ch.id)) continue;
      if (ch.id === i.channel.id) continue;

      await ch.delete().catch(() => {});
    }

    return i.update({
      content: "✅ تم حذف الرومات",
      components: []
    });
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
