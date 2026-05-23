const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const { QuickDB } = require("quick.db");

const ms = require("ms");

const fs = require("fs");

const config = require("./config.json");

const db = new QuickDB();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= READY =================

client.once("ready", async () => {

  console.log(`${client.user.tag} جاهز`);

  // حذف الإعلانات المنتهية

  setInterval(async () => {

    const ads = await db.all();

    for (const item of ads) {

      if (!item.id.startsWith("ad_")) continue;

      const data = item.value;

      if (Date.now() >= data.endsAt) {

        try {

          const guild =
            client.guilds.cache.get(config.guildId);

          const channel =
            guild.channels.cache.get(
              data.channelId
            );

          if (channel)
            await channel.delete();

          const log =
            guild.channels.cache.get(
              config.logChannelId
            );

          if (log) {

            log.send(`
🗑️ انتهى إعلان

👤 <@${data.userId}>
📢 ${data.channelName}
            `);
          }

          await db.delete(item.id);

        } catch (err) {
          console.log(err);
        }
      }
    }

  }, 30000);

});

// ================= MESSAGE =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  // ================= PANEL =================

  if (message.content === "!panel") {

    const embed = new EmbedBuilder()

      .setTitle("🛒 متجر الإعلانات")

      .setDescription(`
🥉 برونزي — ${config.prices.bronze}

🥈 فضي — ${config.prices.silver}

🥇 ذهبي — ${config.prices.gold}

💎 ماسي — ${config.prices.diamond}
      `)

      .setColor("Blue");

    const row =
      new ActionRowBuilder()

        .addComponents(

          new StringSelectMenuBuilder()

            .setCustomId("buy_ad")

            .setPlaceholder(
              "اختر نوع الإعلان"
            )

            .addOptions([
              {
                label: "برونزي",
                value: "bronze"
              },
              {
                label: "فضي",
                value: "silver"
              },
              {
                label: "ذهبي",
                value: "gold"
              },
              {
                label: "ماسي",
                value: "diamond"
              }
            ])
        );

    return message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }

  // ================= ADMIN =================

  if (
    message.member.permissions.has(
      "Administrator"
    )
  ) {

    // تغيير سعر

    if (
      message.content.startsWith(
        "!setprice"
      )
    ) {

      const args =
        message.content.split(" ");

      const type = args[1];

      const price =
        Number(args[2]);

      if (!type || !price)
        return message.reply(
          "!setprice gold 100000"
        );

      config.prices[type] =
        price;

      fs.writeFileSync(
        "./config.json",
        JSON.stringify(
          config,
          null,
          2
        )
      );

      return message.reply(
        `✅ تم تغيير سعر ${type}`
      );
    }

    // تغيير ضريبة

    if (
      message.content.startsWith(
        "!settax"
      )
    ) {

      const args =
        message.content.split(" ");

      const tax =
        Number(args[1]);

      if (!tax)
        return message.reply(
          "!settax 1.05"
        );

      config.tax = tax;

      fs.writeFileSync(
        "./config.json",
        JSON.stringify(
          config,
          null,
          2
        )
      );

      return message.reply(
        `✅ تم تغيير الضريبة`
      );
    }

    // إحصائيات

    if (
      message.content === "!stats"
    ) {

      const ads =
        await db.all();

      const active =
        ads.filter(x =>
          x.id.startsWith("ad_")
        ).length;

      return message.reply(`
📊 الإعلانات النشطة: ${active}
      `);
    }

    // تمديد إعلان

    if (
      message.content.startsWith(
        "!extend"
      )
    ) {

      const args =
        message.content.split(" ");

      const channelId =
        args[1];

      const duration =
        args[2];

      const data =
        await db.get(
          `ad_${channelId}`
        );

      if (!data)
        return message.reply(
          "الإعلان غير موجود"
        );

      data.endsAt +=
        ms(duration);

      await db.set(
        `ad_${channelId}`,
        data
      );

      return message.reply(
        `✅ تم تمديد الإعلان`
      );
    }

    // حذف إعلان

    if (
      message.content.startsWith(
        "!removead"
      )
    ) {

      const args =
        message.content.split(" ");

      const channelId =
        args[1];

      const guild =
        client.guilds.cache.get(
          config.guildId
        );

      const channel =
        guild.channels.cache.get(
          channelId
        );

      if (channel)
        await channel.delete();

      await db.delete(
        `ad_${channelId}`
      );

      return message.reply(
        "🗑️ تم حذف الإعلان"
      );
    }
  }

  // ================= PROBOT =================

  if (
    message.author.id ===
    config.probotId
  ) {

    const pending =
      await db.get("pending");

    if (!pending) return;

    const finalPrice =
      Math.floor(
        pending.price *
        config.tax
      ).toLocaleString();

    if (
      message.content.includes(
        finalPrice
      ) &&
      message.content.includes(
        config.creditReceiverId
      )
    ) {

      const guild =
        client.guilds.cache.get(
          config.guildId
        );

      const emojis = {
        bronze: "🥉",
        silver: "🥈",
        gold: "🥇",
        diamond: "💎"
      };

      const channel =
        await guild.channels.create({

          name:
            `${emojis[pending.type]}-${pending.name}`,

          type:
            ChannelType.GuildText,

          parent:
            config.categoryId,

          permissionOverwrites: [

            {
              id:
                guild.roles.everyone,

              deny: [
                PermissionsBitField
                  .Flags
                  .SendMessages
              ]
            },

            {
              id:
                pending.userId,

              allow: [

                PermissionsBitField
                  .Flags
                  .ViewChannel,

                PermissionsBitField
                  .Flags
                  .SendMessages
              ]
            }
          ]
        });

      const embed =
        new EmbedBuilder()

          .setTitle(
            `📢 ${pending.name}`
          )

          .setDescription(
            pending.text
          )

          .setColor("Gold")

          .setFooter({
            text:
              `ينتهي بعد ${pending.duration}`
          });

      await channel.send({
        content:
          `<@${pending.userId}>`,
        embeds: [embed]
      });

      const endsAt =
        Date.now() +
        ms(
          pending.duration
        );

      await db.set(
        `ad_${channel.id}`,
        {
          userId:
            pending.userId,

          channelId:
            channel.id,

          channelName:
            channel.name,

          endsAt
        }
      );

      const log =
        guild.channels.cache.get(
          config.logChannelId
        );

      if (log) {

        log.send(`
✅ إعلان جديد

👤 <@${pending.userId}>

📦 ${pending.type}

💰 ${pending.price}
        `);
      }

      await db.delete(
        "pending"
      );
    }
  }

});

// ================= INTERACTION =================

client.on(
  "interactionCreate",
  async interaction => {

    // ================= SELECT =================

    if (
      interaction.isStringSelectMenu()
    ) {

      if (
        interaction.customId ===
        "buy_ad"
      ) {

        const type =
          interaction.values[0];

        const modal =
          new ModalBuilder()

            .setCustomId(
              `modal_${type}`
            )

            .setTitle(
              "شراء إعلان"
            );

        const name =
          new TextInputBuilder()

            .setCustomId("name")

            .setLabel(
              "اسم الإعلان"
            )

            .setStyle(
              TextInputStyle.Short
            );

        const text =
          new TextInputBuilder()

            .setCustomId("text")

            .setLabel(
              "نص الإعلان"
            )

            .setStyle(
              TextInputStyle.Paragraph
            );

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(name),

          new ActionRowBuilder()
            .addComponents(text)

        );

        return interaction.showModal(
          modal
        );
      }
    }

    // ================= MODAL =================

    if (
      interaction.isModalSubmit()
    ) {

      if (
        interaction.customId.startsWith(
          "modal_"
        )
      ) {

        const type =
          interaction.customId.replace(
            "modal_",
            ""
          );

        const name =
          interaction.fields.getTextInputValue(
            "name"
          );

        const text =
          interaction.fields.getTextInputValue(
            "text"
          );

        const price =
          config.prices[type];

        const duration =
          config.durations[type];

        await db.set(
          "pending",
          {
            userId:
              interaction.user.id,

            type,

            name,

            text,

            duration,

            price
          }
        );

        const finalPrice =
          Math.floor(
            price *
            config.tax
          );

        return interaction.reply({

          content:
`
💰 المطلوب:
${finalPrice}

📤 حول إلى:
<@${config.creditReceiverId}>

⏳ بعد الدفع يتم إنشاء إعلانك تلقائي
          `,

          ephemeral: true
        });
      }
    }
  }
);

client.login(config.token);
