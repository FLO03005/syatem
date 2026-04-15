const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags
} = require("discord.js");

const fs = require("fs");

// =====================
// 🔐 ENV
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =====================
// 🤖 البوت
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
// 💾 config
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

// =====================
// 🔐 أدمن
// =====================
function isAdmin(member) {
  return config.adminRole && member.roles.cache.has(config.adminRole);
}

// =====================
// 🚀 تسجيل الأوامر
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("تحديد رتبة الإدارة"),
  new SlashCommandBuilder().setName("set-logs").setDescription("تحديد روم اللوق")
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ تم تسجيل الأوامر");
}

// =====================
// تشغيل
// =====================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// =====================
// 🎛️ interactions
// =====================
client.on("interactionCreate", async (interaction) => {
  try {

    if (interaction.isChatInputCommand()) {

      // setup admin role
      if (interaction.commandName === "setup") {
        const roles = interaction.guild.roles.cache
          .filter(r => r.name !== "@everyone")
          .map(r => ({ label: r.name, value: r.id }))
          .slice(0, 25);

        const menu = new StringSelectMenuBuilder()
          .setCustomId("set_admin_role")
          .setPlaceholder("اختار رتبة الإدارة")
          .addOptions(roles);

        return interaction.reply({
          content: "🎛️ اختر رتبة الإدارة",
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: MessageFlags.Ephemeral
        });
      }

      // set logs
      if (interaction.commandName === "set-logs") {
        if (!isAdmin(interaction.member))
          return interaction.reply({
            content: "❌ ما عندك صلاحية",
            flags: MessageFlags.Ephemeral
          });

        const menu = new ChannelSelectMenuBuilder()
          .setCustomId("set_logs_channel")
          .setChannelTypes([ChannelType.GuildText]);

        return interaction.reply({
          content: "📁 اختر روم اللوق",
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // select admin role
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "set_admin_role") {
        config.adminRole = interaction.values[0];
        saveConfig();

        return interaction.reply({
          content: "✅ تم حفظ رتبة الإدارة",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // select logs channel
    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId === "set_logs_channel") {
        config.channels.logs.all = interaction.values[0];
        saveConfig();

        return interaction.reply({
          content: "✅ تم تحديد روم اللوق",
          flags: MessageFlags.Ephemeral
        });
      }
    }

  } catch (err) {
    console.error(err);
  }
});

// =====================
// 🗑️ حذف رسالة
// =====================
client.on("messageDelete", async (message) => {
  if (!message.guild) return;

  const log = message.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🗑️ حذف رسالة")
        .addFields(
          { name: "العضو", value: message.author?.tag || "غير معروف" },
          { name: "الروم", value: `${message.channel}` },
          { name: "المحتوى", value: message.content || "مرفق" }
        )
        .setColor("Red")
    ]
  });
});

// =====================
// ✏️ تعديل رسالة
// =====================
client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;
  if (oldMsg.content === newMsg.content) return;

  const log = oldMsg.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("✏️ تعديل رسالة")
        .addFields(
          { name: "قبل", value: oldMsg.content || "—" },
          { name: "بعد", value: newMsg.content || "—" }
        )
        .setColor("Yellow")
    ]
  });
});

// =====================
// 👤 دخول عضو
// =====================
client.on("guildMemberAdd", (member) => {
  const log = member.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send(`📥 دخول عضو: ${member.user.tag}`);
});

// =====================
// 🚪 خروج عضو
// =====================
client.on("guildMemberRemove", (member) => {
  const log = member.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send(`📤 خروج عضو: ${member.user.tag}`);
});

// =====================
// 📁 إنشاء روم
// =====================
client.on("channelCreate", (channel) => {
  const log = channel.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send(`📁 تم إنشاء روم: ${channel.name}`);
});

// =====================
// 🗑️ حذف روم
// =====================
client.on("channelDelete", (channel) => {
  const log = channel.guild.channels.cache.get(config.channels.logs.all);
  if (!log) return;

  log.send(`🗑️ تم حذف روم: ${channel.name}`);
});

// =====================
// 🔥 login
// =====================
client.login(TOKEN);
