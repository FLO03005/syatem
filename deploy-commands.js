const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1493799788888719462";

if (!TOKEN) {
  console.log("❌ TOKEN not found in environment variables!");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("اختيار رتبة الأدمن"),
  new SlashCommandBuilder().setName("setup-control").setDescription("اختيار روم الكنترول"),
  new SlashCommandBuilder().setName("panel").setDescription("إرسال لوحة التحكم")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🔄 Registering commands...");

    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Registered ${data.length} commands`);
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
