const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Setup admin role"),
  new SlashCommandBuilder().setName("setup-control").setDescription("Setup control channel"),
  new SlashCommandBuilder().setName("panel").setDescription("Send control panel")
].map(cmd => cmd.toJSON());

// 🔴 حط بياناتك هنا
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "PUT_CLIENT_ID_HERE";

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🔄 Registering commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Commands registered successfully!");
  } catch (error) {
    console.error(error);
  }
})();
