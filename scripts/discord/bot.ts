import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import dotenv from 'dotenv';
import { DISCORD_SERVER_CONFIG, ROLE_COLORS } from './config.ts';

const SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName('youniverse')
    .setDescription('Learn about ItsYouOnline, Portals OS, and claiming your Youniverse.'),
  new SlashCommandBuilder()
    .setName('tiers')
    .setDescription('View Citizen, Founding tiers, and Genesis 001 roles.'),
  new SlashCommandBuilder()
    .setName('club')
    .setDescription('Check the status of Club Youniverse radio and live stage.'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check live server stats for ItsYouOnline.'),
];

async function main(): Promise<void> {
  dotenv.config();

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (!token || !guildId) {
    console.error(
      'Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID in your .env file.',
    );
    process.exitCode = 1;
    return;
  }

  // Uses Guilds intent only — zero privileged intents required.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    const guild = await readyClient.guilds.fetch(guildId);
    await guild.commands.set(SLASH_COMMANDS.map((cmd) => cmd.toJSON()));
    console.log(
      `ItsYouOnline Companion Bot is online as ${readyClient.user.tag} in "${guild.name}".`,
    );
    console.log('Slash commands ready: /youniverse, /tiers, /club, /status');
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'youniverse') {
      const embed = new EmbedBuilder()
        .setTitle('Portals OS & The Youniverse')
        .setDescription(
          '*“Hey. I’m Atom. First friend, till the end.”*\n\n' +
            'Every person gets a persistent corner of the internet at `<handle>.itsyouonline.com` — your identity, apps, memory, and personal intelligence built for an 80-year arc.',
        )
        .setColor(ROLE_COLORS.genesis001)
        .addFields(
          {
            name: 'Homeverse (Free)',
            value: 'Claim your `<handle>.itsyouonline.com` sovereign desktop.',
            inline: true,
          },
          {
            name: 'Discord Linking',
            value: 'Automated linking in **#link-your-youniverse** is **coming soon**.',
            inline: true,
          },
        )
        .setFooter({ text: 'ItsYouOnline · Portals OS' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Visit ItsYouOnline')
          .setStyle(ButtonStyle.Link)
          .setURL('https://itsyouonline.com'),
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.commandName === 'tiers') {
      const embed = new EmbedBuilder()
        .setTitle('Youniverse Ranks & Badges')
        .setDescription(
          'Automated Discord role linking is **coming soon**. Watch **#announcements** for launch.',
        )
        .setColor(ROLE_COLORS.archangel)
        .addFields(
          {
            name: 'Citizen',
            value: 'Unlocked when you link your Youniverse — opens **COMMUNITY** & **CLUB YOUNIVERSE**.',
          },
          {
            name: 'Genesis 001',
            value: 'Commemorative badge for the earliest founding artifact holders + **#founders-lounge**.',
          },
          {
            name: 'Founding Angel · Archangel · Cherubim',
            value: 'Founding tiers unlocking **#founders-lounge** and their progressive tier lounges.',
          },
        )
        .setFooter({ text: 'ItsYouOnline · Ranks' });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.commandName === 'club') {
      const embed = new EmbedBuilder()
        .setTitle('Club Youniverse — Coming Soon')
        .setDescription(
          'Sovereign radio, live stage sessions, and creator showcases across The Youniverse.\n\n' +
            'Keep an eye on **#club-announcements** — live programming is **coming soon**.',
        )
        .setColor(ROLE_COLORS.dominions)
        .setFooter({ text: 'Club Youniverse · Coming Soon' });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.commandName === 'status') {
      const guild = interaction.guild;
      const roleCount = DISCORD_SERVER_CONFIG.roles.length;
      const channelCount = DISCORD_SERVER_CONFIG.categories.reduce(
        (sum, cat) => sum + cat.channels.length,
        0,
      );

      const embed = new EmbedBuilder()
        .setTitle('ItsYouOnline Server Status')
        .setColor(ROLE_COLORS.virtues)
        .addFields(
          { name: 'Server', value: guild?.name ?? 'ItsYouOnline', inline: true },
          {
            name: 'Members',
            value: String(guild?.memberCount ?? '—'),
            inline: true,
          },
          {
            name: 'Blueprint',
            value: `${roleCount} roles · ${DISCORD_SERVER_CONFIG.categories.length} categories · ${channelCount} channels`,
            inline: false,
          },
          {
            name: 'AutoMod & Identity Bridge',
            value: 'AutoMod Shield: Active · Automated Youniverse Linking: Coming Soon',
          },
        )
        .setFooter({ text: 'ItsYouOnline Companion' });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  await client.login(token);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Bot error: ${message}`);
  process.exitCode = 1;
});
