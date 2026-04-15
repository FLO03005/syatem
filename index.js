const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
// ✏️ rename system
// =====================
const renameMap = new Map();

// =====================
// 🚀 تسجيل الأوامر
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("تحديد رتبة الإدارة"),
  new SlashCommandBuilder().setName("setup-control").setDescription("تحديد روم الكنترول"),
  new SlashCommandBuilder().setName("panel").setDescription("إرسال لوحة التحكم")
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log("🚀 تسجيل الأوامر...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ تم تسجيل الأوامر");
  } catch (err) {
    console.error(err);
  }
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

      if (interaction.commandName === "setup-control") {
        if (!isAdmin(interaction.member))
          return interaction.reply({
            content: "❌ ما عندك صلاحية",
            flags: MessageFlags.Ephemeral
          });

        const menu = new ChannelSelectMenuBuilder()
          .setCustomId("set_control_channel")
          .setChannelTypes([ChannelType.GuildText]);

        return interaction.reply({
          content: "🎛️ اختر روم الكنترول",
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.commandName === "panel") {
        if (!isAdmin(interaction.member))
          return interaction.reply({
            content: "❌ ما عندك صلاحية",
            flags: MessageFlags.Ephemeral
          });

        const channel = interaction.guild.channels.cache.get(config.channels.control);

        if (!channel)
          return interaction.reply({
            content: "❌ حدد روم الكنترول أول",
            flags: MessageFlags.Ephemeral
          });

        const embed = new EmbedBuilder()
          .setTitle("🎛️ Control Panel")
          .setColor("Blue");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("create").setLabel("🏗️ إنشاء روم").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("delete").setLabel("🗑️ حذف روم").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("rename").setLabel("✏️ تعديل اسم").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("lock").setLabel("🔒 قفل").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("unlock").setLabel("🔓 فتح").setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({
          content: "✅ تم إرسال اللوحة",
          flags: MessageFlags.Ephemeral
        });
      }
    }

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

    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId === "set_control_channel") {
        config.channels.control = interaction.values[0];
        saveConfig();

        return interaction.reply({
          content: "✅ تم حفظ روم الكنترول",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (interaction.isButton()) {

      if (!isAdmin(interaction.member))
        return interaction.reply({
          content: "❌ ما عندك صلاحية",
          flags: MessageFlags.Ephemeral
        });

      const channel = interaction.channel;

      if (interaction.customId === "create") {
        await interaction.guild.channels.create({
          name: `room-${Date.now()}`,
          type: ChannelType.GuildText,
          parent: channel.parent
        });

        return interaction.reply({
          content: "✅ تم إنشاء روم",
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === "delete") {
        await channel.delete().catch(() => {});
      }

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { [PermissionsBitField.Flags.SendMessages]: false }
        );

        return interaction.reply({
          content: "🔒 تم القفل",
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { [PermissionsBitField.Flags.SendMessages]: true }
        );

        return interaction.reply({
          content: "🔓 تم الفتح",
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === "rename") {
        renameMap.set(interaction.user.id, channel.id);

        return interaction.reply({
          content: "✏️ اكتب الاسم الجديد",
          flags: MessageFlags.Ephemeral
        });
      }
    }

  } catch (err) {
    console.error(err);
  }
});

// =====================
// rename message
// =====================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (!renameMap.has(message.author.id)) return;

  const channelId = renameMap.get(message.author.id);
  const channel = message.guild.channels.cache.get(channelId);

  if (!channel) return;

  await channel.setName(message.content);
  renameMap.delete(message.author.id);

  message.reply("✅ تم تغيير الاسم");
});

// =====================
// 🔥 login
// =====================
client.login(TOKEN);
