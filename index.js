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
// SEND LOG (ROLE FILTER FIXED)
// =====================
function sendLog(guild, type, embed) {
  const ch = guild.channels.cache.get(config.logs[type]);
  if (!ch) return;

  const allowed = config.allowedRoles[type];

  if (!allowed || !allowed.length) {
    return ch.send({ embeds: [embed] });
  }

  const membersToNotify = ch.guild.members.cache.filter(member =>
    member.roles.cache.some(r => allowed.includes(r.id))
  );

  const mentions = membersToNotify.map(m => `<@${m.id}>`).join(" ");

  return ch.send({
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

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await register();
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  // =====================
  // SETUP FIXED
  // =====================
  if (i.commandName === "setup") {
    await i.deferReply({ flags: MessageFlags.Ephemeral });

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

    return i.editReply({
      content: "✅ System Ready"
    });
  }

  // =====================
  // LOG ROLES MENU
  // =====================
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
      .setPlaceholder("اختار الرتب")
      .setMinValues(0)
      .setMaxValues(roles.length)
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    return i.reply({
      content: `🎛️ اختر الرتب لتنبيه: **${type}**`,
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
    content: `✅ تم حفظ الرتب للوق **${type}**`,
    components: []
  });
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
