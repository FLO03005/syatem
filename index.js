const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
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
// ENV
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =====================
// BOT
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
// CONFIG
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
// ADMIN CHECK
// =====================
function isAdmin(member) {
  return config.adminRole && member.roles.cache.has(config.adminRole);
}

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("إنشاء نظام اللوق كامل"),
].map(c => c.toJSON());

// =====================
// REGISTER COMMANDS
// =====================
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands registered");
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// =====================
// SETUP SYSTEM
// =====================
client.on("interactionCreate", async (interaction) => {
  try {

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "setup") {

      if (!isAdmin(interaction.member))
        return interaction.reply({
          content: "❌ ما عندك صلاحية",
          flags: MessageFlags.Ephemeral
        });

      const guild = interaction.guild;

      // CATEGORY
      const category = await guild.channels.create({
        name: "📁・LOG SYSTEM",
        type: ChannelType.GuildCategory
      });

      // CHANNELS
      const messages = await guild.channels.create({
        name: "💬・message-logs",
        type: ChannelType.GuildText,
        parent: category.id
      });

      const members = await guild.channels.create({
        name: "👤・member-logs",
        type: ChannelType.GuildText,
        parent: category.id
      });

      const channels = await guild.channels.create({
        name: "📁・channel-logs",
        type: ChannelType.GuildText,
        parent: category.id
      });

      const edits = await guild.channels.create({
        name: "✏️・edit-logs",
        type: ChannelType.GuildText,
        parent: category.id
      });

      // SAVE CONFIG
      config.channels.logs = {
        messages: messages.id,
        members: members.id,
        channels: channels.id,
        edits: edits.id
      };

      saveConfig();

      return interaction.reply({
        content: "✅ تم إنشاء نظام اللوق كامل",
        flags: MessageFlags.Ephemeral
      });
    }

  } catch (err) {
    console.error(err);
  }
});

// =====================
// MESSAGE DELETE
// =====================
client.on("messageDelete", async (message) => {
  if (!message.guild) return;

  const log = message.guild.channels.cache.get(config.channels.logs.messages);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🗑️ Delete Message")
    .addFields(
      { name: "User", value: `${message.author || "Unknown"}` },
      { name: "Channel", value: `${message.channel}` },
      { name: "Content", value: message.content || "No Message" }
    )
    .setTimestamp();

  log.send({ embeds: [embed] });
});

// =====================
// MESSAGE EDIT
// =====================
client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;
  if (oldMsg.content === newMsg.content) return;

  const log = oldMsg.guild.channels.cache.get(config.channels.logs.edits);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("✏️ Edit Message")
    .addFields(
      { name: "Before", value: oldMsg.content || "—" },
      { name: "After", value: newMsg.content || "—" }
    )
    .setTimestamp();

  log.send({ embeds: [embed] });
});

// =====================
// MEMBER JOIN
// =====================
client.on("guildMemberAdd", (member) => {
  const log = member.guild.channels.cache.get(config.channels.logs.members);
  if (!log) return;

  log.send(`📥 Join: ${member.user.tag}`);
});

// =====================
// MEMBER LEAVE
// =====================
client.on("guildMemberRemove", (member) => {
  const log = member.guild.channels.cache.get(config.channels.logs.members);
  if (!log) return;

  log.send(`📤 Leave: ${member.user.tag}`);
});

// =====================
// CHANNEL CREATE
// =====================
client.on("channelCreate", (channel) => {
  if (!channel.guild) return;

  const log = channel.guild.channels.cache.get(config.channels.logs.channels);
  if (!log) return;

  log.send(`📁 Created: ${channel.name}`);
});

// =====================
// CHANNEL DELETE
// =====================
client.on("channelDelete", (channel) => {
  if (!channel.guild) return;

  const log = channel.guild.channels.cache.get(config.channels.logs.channels);
  if (!log) return;

  log.send(`🗑️ Deleted: ${channel.name}`);
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
