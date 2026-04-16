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
// 🔥 حط آيديك هنا
// =====================
const whitelist = ["PUT_YOUR_ID_HERE"];

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
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    console.log("⏳ Registering commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.error("❌ Error registering:", err);
  }
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await register();
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  try {

    // =====================
    // COMMANDS
    // =====================
    if (i.isChatInputCommand()) {
      console.log("📌 Command:", i.commandName);

      // SETUP
      if (i.commandName === "setup") {
        return i.reply({
          content: "✅ System Ready",
          flags: MessageFlags.Ephemeral
        });
      }

      // DELETE ROOMS
      if (i.commandName === "delete-rooms") {

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
          content: "اختر الرومات",
          components: [row],
          ephemeral: true
        });
      }
    }

    // =====================
    // SELECT MENU
    // =====================
    if (i.isStringSelectMenu()) {
      console.log("📌 Select Used");

      if (i.customId === "select_delete_rooms") {
        const selected = i.values;

        const confirmBtn = new ButtonBuilder()
          .setCustomId(`confirm_delete_${selected.join(",")}`)
          .setLabel("تأكيد الحذف")
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(confirmBtn);

        return i.update({
          content: `⚠️ حذف ${selected.length} روم`,
          components: [row]
        });
      }
    }

    // =====================
    // BUTTON
    // =====================
    if (i.isButton()) {
      console.log("📌 Button Click");

      if (i.customId.startsWith("confirm_delete_")) {

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
          content: "✅ تم الحذف",
          components: []
        });
      }
    }

  } catch (err) {
    console.error("❌ Interaction Error:", err);

    if (i.replied || i.deferred) {
      i.followUp({ content: "❌ صار خطأ", ephemeral: true }).catch(() => {});
    } else {
      i.reply({ content: "❌ صار خطأ", ephemeral: true }).catch(() => {});
    }
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
