const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =====================
// SETTINGS
// =====================
const ADMIN_ROLES = ["ROLE_ID_HERE"];
const PROTECTED_CHANNELS = ["CHANNEL_ID"];
const DELETE_PIN = "1234";
const LOG_CHANNEL_ID = "LOG_CHANNEL_ID";

let backup = [];

// =====================
// HELPERS
// =====================
function hasAccess(member) {
  return member.roles.cache.some(r => ADMIN_ROLES.includes(r.id));
}

function log(guild, msg) {
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (ch) ch.send(msg);
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("لوحة التحكم"),
  new SlashCommandBuilder()
    .setName("delete-by-name")
    .setDescription("حذف حسب الاسم")
    .addStringOption(o =>
      o.setName("name").setDescription("جزء من الاسم").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("restore")
    .setDescription("استرجاع الرومات")
].map(c => c.toJSON());

async function register() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

client.once("ready", async () => {
  console.log("READY");
  await register();
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {

  // =====================
  // PANEL
  // =====================
  if (i.isChatInputCommand() && i.commandName === "panel") {

    if (!hasAccess(i.member)) {
      return i.reply({ content: "❌ مافي صلاحية", ephemeral: true });
    }

    const channels = i.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .map(c => ({ label: c.name, value: c.id }))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("delete_select")
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(channels);

    return i.reply({
      content: "اختر الرومات للحذف",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  // =====================
  // SELECT DELETE
  // =====================
  if (i.isStringSelectMenu() && i.customId === "delete_select") {

    const ids = i.values;

    backup = ids.map(id => {
      const ch = i.guild.channels.cache.get(id);
      return ch ? ch.name : null;
    });

    const btn = new ButtonBuilder()
      .setCustomId(`confirm_${ids.join(",")}`)
      .setLabel("تأكيد")
      .setStyle(ButtonStyle.Danger);

    return i.update({
      content: "🔐 اكتب PIN خلال 5 ثواني",
      components: [new ActionRowBuilder().addComponents(btn)]
    });
  }

  // =====================
  // CONFIRM DELETE
  // =====================
  if (i.isButton() && i.customId.startsWith("confirm_")) {

    const filter = m => m.author.id === i.user.id;

    const collected = await i.channel.awaitMessages({
      filter,
      max: 1,
      time: 5000
    }).catch(() => null);

    const pin = collected?.first()?.content;

    if (pin !== DELETE_PIN) {
      return i.reply({ content: "❌ PIN خطأ", ephemeral: true });
    }

    await i.reply({ content: "⏱️ جاري الحذف...", ephemeral: true });

    setTimeout(async () => {

      const ids = i.customId.replace("confirm_", "").split(",");

      for (const id of ids) {
        const ch = i.guild.channels.cache.get(id);
        if (!ch) continue;
        if (PROTECTED_CHANNELS.includes(ch.id)) continue;

        await ch.delete().catch(() => {});
        log(i.guild, `🗑️ تم حذف: ${ch.name}`);
      }

    }, 5000);
  }

  // =====================
  // DELETE BY NAME
  // =====================
  if (i.isChatInputCommand() && i.commandName === "delete-by-name") {

    if (!hasAccess(i.member)) {
      return i.reply({ content: "❌ مافي صلاحية", ephemeral: true });
    }

    const name = i.options.getString("name");

    const targets = i.guild.channels.cache.filter(c =>
      c.name.includes(name)
    );

    backup = targets.map(c => c.name);

    for (const ch of targets.values()) {
      if (PROTECTED_CHANNELS.includes(ch.id)) continue;
      await ch.delete().catch(() => {});
    }

    log(i.guild, `🔥 حذف حسب الاسم: ${name}`);
    return i.reply({ content: "✅ تم الحذف", ephemeral: true });
  }

  // =====================
  // RESTORE
  // =====================
  if (i.isChatInputCommand() && i.commandName === "restore") {

    if (!hasAccess(i.member)) {
      return i.reply({ content: "❌ مافي صلاحية", ephemeral: true });
    }

    for (const name of backup) {
      if (!name) continue;

      await i.guild.channels.create({
        name,
        type: ChannelType.GuildText
      });
    }

    log(i.guild, "🔁 تم استرجاع الرومات");
    return i.reply({ content: "✅ تم الاسترجاع", ephemeral: true });
  }

});

// =====================
client.login(TOKEN);
