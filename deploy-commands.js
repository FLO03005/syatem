const { REST, Routes, SlashCommandBuilder } = require("discord.js");

// =====================
// 🔴 بياناتك جاهزة
// =====================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1493799788888719462";

// =====================
// 📌 الأوامر
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("اختيار رتبة الأدمن"),

  new SlashCommandBuilder()
    .setName("setup-control")
    .setDescription("اختيار روم الكنترول"),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("إرسال لوحة التحكم")
].map(cmd => cmd.toJSON());

// =====================
// 🚀 تسجيل الأوامر
// =====================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Commands registered successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
})();
