const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

// =====================
// CONFIGURATION
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// قائمة الملاك (الذين لا يطبق عليهم النظام)
const whitelist = ["YOUR_ID_HERE", "ANOTHER_ID"];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

let config = { logs: {}, limits: { maxActions: 3, timeWindow: 10000 } };
try { config = require("./config.json"); } catch {}

function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// =====================
// SECURITY ENGINE (ADVANCED)
// =====================
const actionTracker = new Map(); // لرصد التكرار السريع

async function checkThreat(userId, guild, actionType) {
  if (whitelist.includes(userId) || userId === client.user.id) return false;

  const now = Date.now();
  const userActions = actionTracker.get(userId) || [];
  
  // تصفية الأفعال القديمة (خارج النطاق الزمني)
  const recentActions = userActions.filter(timestamp => now - timestamp < config.limits.timeWindow);
  recentActions.push(now);
  actionTracker.set(userId, recentActions);

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  // إذا تجاوز الحد المسموح (مثلاً 3 أفعال في 10 ثوانٍ)
  if (recentActions.length >= config.limits.maxActions) {
    await punish(member, "Anti-Nuke: تجاوز حد الأفعال المسموحة (محاولة تخريب)");
    return true;
  }
  return false;
}

async function punish(member, reason) {
  try {
    // تجريد العضو من جميع رتبه فوراً كإجراء احترازي
    await member.roles.set([]).catch(() => {});
    // حظر العضو
    await member.ban({ reason }).catch(() => {});
    
    const logEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🚨 تم صد محاولة تخريب")
      .setDescription(`**المستخدم:** ${member.user.tag}\n**السبب:** ${reason}\n**الإجراء:** نفيه من السيرفر وسحب الرتب.`)
      .setTimestamp();
      
    const logChannel = member.guild.channels.cache.get(config.logs.security);
    if (logChannel) logChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error("Punishment Error:", err);
  }
}

// =====================
// LOGGING SYSTEM
// =====================
function createLogEmbed(title, executor, target, action, color = "#2f3136") {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: title })
    .addFields(
      { name: "👤 المنفذ", value: `${executor.tag} (\`${executor.id}\`)`, inline: true },
      { name: "🎯 المستهدف", value: `${target}`, inline: true },
      { name: "📝 الحدث", value: action }
    )
    .setTimestamp();
}

// =====================
// EVENTS (PROTECTION LAYER)
// =====================

// 1. حماية القنوات (إنشاء/حذف)
client.on("channelDelete", async (channel) => {
  const audit = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry) return;

  const isNuke = await checkThreat(entry.executor.id, channel.guild, "channel_delete");
  if (isNuke) return;

  const logCh = channel.guild.channels.cache.get(config.logs.channels);
  if (logCh) logCh.send({ embeds: [createLogEmbed("حذف قناة", entry.executor, channel.name, "قام بحذف قناة", "#ff4d4d")] });
});

// 2. حماية الرتب الحساسة
client.on("roleDelete", async (role) => {
  const audit = await role.guild.fetchAuditLogs({ type: 32, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry) return;

  await checkThreat(entry.executor.id, role.guild, "role_delete");
});

// 3. حماية البوتات (Anti-Bot)
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;

  const audit = await member.guild.fetchAuditLogs({ type: 28, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry || whitelist.includes(entry.executor.id)) return;

  // طرد البوت المضاف
  await member.kick("بوت غير مصرح به").catch(() => {});
  // معاقبة من أضافه
  const executor = await member.guild.members.fetch(entry.executor.id);
  if (executor) await punish(executor, "محاولة إدخال بوت تخريبي");
});

// 4. حماية الويب هوك (Anti-Webhook)
client.on("webhookUpdate", async (channel) => {
  const audit = await channel.guild.fetchAuditLogs({ type: 50, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry || whitelist.includes(entry.executor.id)) return;

  const webhooks = await channel.fetchWebhooks();
  for (const wh of webhooks.values()) {
    await wh.delete("حماية تلقائية ضد الويب هوك").catch(() => {});
  }
  
  const executor = await channel.guild.members.fetch(entry.executor.id);
  if (executor) await punish(executor, "محاولة إنشاء Webhook تخريبي");
});

// =====================
// COMMANDS SETUP
// =====================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "setup") {
    if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.reply("للإدمن فقط");
    
    const category = await i.guild.channels.create({ name: "🛡️ نظام الحماية", type: ChannelType.GuildCategory });
    const logTypes = ["security", "channels", "roles", "members", "messages"];
    
    for (const type of logTypes) {
      const ch = await i.guild.channels.create({
        name: `log-${type}`,
        parent: category.id,
        type: ChannelType.GuildText
      });
      config.logs[type] = ch.id;
    }
    
    saveConfig();
    i.reply("✅ تم تفعيل أقوى نظام حماية وتجهيز السجلات.");
  }
});

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("تجهيز نظام الحماية والسجلات")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} Online & Shield Active`);
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
});

client.login(TOKEN);
