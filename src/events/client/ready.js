const { Events } = require("discord.js");
const {
  Guilds,
  Mails,
  Members,
  Suggestions,
  Tickets,
} = require("../../dbObjects.js");
const {
  checkBirthdays,
  muteTimeout,
  removeEmptyVoiceChannel,
  syncRoles,
} = require("../../functions.js");
const {
  initApp,
  initCheckMail,
  checkNewMail,
} = require("../../app/mails/index.js");
const { channel_welcome, channel_tickets, role_verified } = require(process.env
  .CONSTANT);
const cron = require("cron");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    let guildsCount = await client.guilds.fetch();
    let usersCount = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

    await client.user.setPresence({
      activities: [{ name: "se réveiller !", type: 0 }],
      status: "online",
    });

    // Sync the database
    await Guilds.sync({ alter: true });
    await Mails.sync({ alter: true });
    await Members.sync({ alter: true });
    await Suggestions.sync({ alter: true });
    await Tickets.sync({ alter: true });

    // Relaunch the timeout of the mute
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    if (!guild)
      return console.error("ready.js - Le bot n'est pas sur le serveur !");
    if (!guild.available)
      return console.error("ready.js - Le serveur n'est pas disponible !");

    // Check if the bot is synchronized with the server
    // Mail subsystem retired by default: keep code but don't execute it.
    // To re-enable mail checks set environment variable `MAILS_ENABLED=true`.
    if (process.env.MAILS_ENABLED === "true") {
      const userConnect = await initApp();
      console.log(`1/6 : ${userConnect} is correctly connect to the app !`);
      console.log(`2/6 : Start initialize mails...`);
      await initCheckMail(guild);
      // Launch setInterval (js function) for mail checking
      setInterval(() => checkNewMail(guild), 12000); // Check every 12 seconds
    } else {
      console.log("Mail checks are retired/disabled (MAILS_ENABLED !== 'true'). Skipping mail init and periodic checks.");
    }
    console.log("3/6 : Start check birthdays...");
    await checkBirthdays(guild);
    console.log("4/6 : Start check user timeout...");
    await muteTimeout(guild);
    console.log("5/6 : Start remove empty voice channel...");
    await removeEmptyVoiceChannel(guild);
    console.log("6/6 : Start synchronize roles...");
    await syncRoles(guild);

    // Launch cron jobs
    new cron.CronJob(
      "0 */5 * * *",
      () => checkBirthdays(guild),
      null,
      true,
      "Europe/Paris"
    ); // Check 5 time a day

    // NOTE: `checkNewMail` interval moved into conditional above and only runs
    // when `MAILS_ENABLED=true` to keep the mail code present but inactive by default.

    // Set the client user's activity
    await client.user.setPresence({
      activities: [{ name: "vous câliner !", type: 0 }],
      status: "online",
    });

    // Log the bot is ready
    console.log(
      `${client.user.username} est prêt à être utilisé par ${usersCount} utilisateurs sur ${guildsCount.size} serveurs !`
    );

    // FIXME: Clean this thing with a better solution #CleanCode
    // Call the sendDM function one time after 4 hours
    setTimeout(sendDM, 4 * 60 * 60 * 1000, client);
    // Call the sendDM function every 6 days
    setInterval(sendDM, 6 * 24 * 60 * 60 * 1000, client);
  },
};

/**
 * Send a DM to all the members who has not the verified role
 * @param {import(Discord.js).client} client
 * @returns void
 */
async function sendDM(client) {
  const blacklistMP = [];
  const guild = await client.guilds.fetch(process.env.GUILD_ID);

  await guild.members.fetch().then(async function (members) {
    await members.each(async function (member) {
      if (
        !member.roles.cache.find(
          (role) =>
            role.id === role_verified &&
            blacklistMP.find((userId) => userId === member.id) === undefined
        )
      ) {
        // Send MP to the member
        try {
          await member.send(
            `Bonjour ${member.displayName} :wave:\n\n` +
              `Je suis la ${client.user.username}, un bot du serveur \`${guild.name}\`.\n\n` +
              `Je t'envoie ce message pour te rappeler que tu n'as pas encore le rôle 'Verified' sur le serveur. Pour obtenir ce rôle, **tu dois te rendre dans le salon <#${channel_welcome}> et suivre les instructions**.\n` +
              `*Ce rôle est nécessaire pour accéder à l'ensemble des salons du serveur.*\n\n` +
              `Si tu as des questions, n'hésite pas à ouvrir un ticket aux admins via ce salon <#${channel_tickets}>.\n\n` +
              `À bientôt ! :wink:`
          );
        } catch (error) {
          // console.log(`Impossible d'envoyer un message à ${member.displayName}`);
        }
      }
    });
  });
}
