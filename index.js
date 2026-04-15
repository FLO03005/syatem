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
  StringSelectMenuBuilder
} = require("discord.js");

const fs = require("fs");
const config = require("./config.json");

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
// 💾 حفظ الكونفق
// =====================
function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// تأكد من القيم
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
// 🚀 تشغيل
// =====================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =====================
// 🎛️ interactions
// =====================
client.on("interactionCreate", async (interaction) => {
  try {

    // =====================
    // 🧾 commands
    // =====================
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
          ephemeral: true
        });
      }

      // setup control channel
      if (interaction.commandName === "setup-control") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

        const menu = new ChannelSelectMenuBuilder()
          .setCustomId("set_control_channel")
          .setChannelTypes([ChannelType.GuildText]);

        return interaction.reply({
          content: "🎛️ اختر روم الكنترول",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }

      // panel
      if (interaction.commandName === "panel") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

        const channel = interaction.guild.channels.cache.get(config.channels.control);

        if (!channel)
          return interaction.reply({ content: "❌ حدد روم الكنترول أول", ephemeral: true });

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

        return interaction.reply({ content: "✅ تم إرسال اللوحة", ephemeral: true });
      }
    }

    // =====================
    // select menu admin role
    // =====================
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "set_admin_role") {
        config.adminRole = interaction.values[0];
        saveConfig();

        return interaction.reply({ content: "✅ تم حفظ رتبة الإدارة", ephemeral: true });
      }
    }

    // =====================
    // select menu channel
    // =====================
    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId === "set_control_channel") {
        config.channels.control = interaction.values[0];
        saveConfig();

        return interaction.reply({ content: "✅ تم حفظ روم الكنترول", ephemeral: true });
      }
    }

    // =====================
    // buttons
    // =====================
    if (interaction.isButton()) {

      if (!isAdmin(interaction.member))
        return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

      const channel = interaction.channel;

      // create
      if (interaction.customId === "create") {
        await interaction.guild.channels.create({
          name: `room-${Date.now()}`,
          type: ChannelType.GuildText,
          parent: channel.parent
        });

        return interaction.reply({ content: "✅ تم إنشاء روم", ephemeral: true });
      }

      // delete
      if (interaction.customId === "delete") {
        await channel.delete().catch(() => {});
      }

      // lock
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { [PermissionsBitField.Flags.SendMessages]: false }
        );

        return interaction.reply({ content: "🔒 تم القفل", ephemeral: true });
      }

      // unlock
      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { [PermissionsBitField.Flags.SendMessages]: true }
        );

        return interaction.reply({ content: "🔓 تم الفتح", ephemeral: true });
      }

      // rename
      if (interaction.customId === "rename") {
        renameMap.set(interaction.user.id, channel.id);

        return interaction.reply({
          content: "✏️ اكتب الاسم الجديد",
          ephemeral: true
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
// message delete log
// =====================
client.on("messageDelete", async (message) => {
  if (!message.guild) return;

  const log = message.guild.channels.cache.get(config.channels.logs.messageDelete);
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
// 🔥 login (IMPORTANT FIX)
// =====================
console.log("TOKEN LOADED:", process.env.TOKEN ? "YES" : "NO");

client.login(process.env.TOKEN);
