import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { renderDayOfWeekChart } from '../chart.js';
import type { Command } from './types.js';

export const chart: Command = {
  data: new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Chart the score distribution for each day of the week.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Chart a single player (defaults to the whole server).'),
    ),

  async execute(interaction, { db }) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser('user');
    await interaction.deferReply();

    const scores = db.dayScores(interaction.guildId, target?.id);
    if (scores.length === 0) {
      await interaction.editReply(
        target
          ? `${target.username} has no recorded Scrandle results yet.`
          : 'No Scrandle results recorded yet. Post some scores (or run `/scan`)!',
      );
      return;
    }

    const title = target
      ? `${target.username}'s Scrandle scores`
      : 'Server Scrandle scores';

    const png = await renderDayOfWeekChart(scores, title);
    const attachment = new AttachmentBuilder(png, { name: 'scrandle-days.png' });

    await interaction.editReply({ files: [attachment] });
  },
};
