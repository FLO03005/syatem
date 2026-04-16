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

// أضف أيديات الملاك هنا ليتجاهلهم البوت تماماً
const whitelist = ["YOUR_ID_HERE"]; 

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

// نظام تخزين الإعدادات مع معالجة الأخطاء
let config = { logs: {}, limits: { maxActions: 3, timeWindow: 10000 } };
try {
  if (fs.existsSync("./config.json")) {
    config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
  }
} catch (err) {
  console.log("Creating new config file...");
}

function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// =====================
// SECURITY ENGINE
// =====================
const actionTracker = new Map();

async function checkThreat(userId, guild) {
  if (whitelist.includes(userId) || userId === client.user.id) return false;

  const now = Date.now();
  const userActions = actionTracker.get(userId) || [];
  const recentActions = userActions.filter(timestamp => now - timestamp < config.limits.timeWindow);
  
  recentActions.push(now);
  actionTracker.set(userId, recentActions);

  if (recentActions.length >= config.limits.maxActions) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await punish(member, "Anti-Nuke: تكرار أفعال تخريبية في وقت قصير");
    return true;
  }
  return false;
}

async function punish(member, reason) {
  if (whitelist.includes(member.id)) return;
  try {
    await member.roles.set([]).catch(() => {}); // سحب الرتب فوراً
    await member.ban({ reason: `[SHIELD ACTIVE] ${reason}` }).catch(() => {});
    
    const logChannel = member.guild.channels.cache.get(config.logs?.security);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🚨 تم رصد محاولة تخريب")
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: "المستخدم", value: `${member.user.tag} (${member.id})` },
          { name: "الإجراء", value: "طرد نهائي (Ban) + سحب رتب" },
          { name: "السبب", value: reason }
        )
        .setTimestamp();
      logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Punish Error:", err);
  }
}

// =====================
// EVENTS
// =====================

// حماية القنوات
client.on("channelDelete", async (channel) => {
  const audit = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry) return;
  await checkThreat(entry.executor.id, channel.guild);
});

// حماية الرتب
client.on("roleDelete", async (role) => {
  const audit = await role.guild.fetchAuditLogs({ type: 32, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry) return;
  await checkThreat(entry.executor.id, role.guild);
});
