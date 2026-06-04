import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { LeaderboardMetric } from '../db.js';
import type { Command } from './types.js';

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the Scrandle leaderboard for this server.')
    .addStringOption((option) =>
      option
        .setName('metric')
        .setDescription('How to rank players (default: total greens).')
        .addChoices(
          { name: 'Total greens', value: 'total' },
          { name: 'Average score', value: 'average' },
          { name: 'Perfect games', value: 'perfects' },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('How many players to show (1-25, default 10).')
        .setMinValue(1)
        .setMaxValue(25),
    ),

  async execute(interaction, { db }) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const metric = (interaction.options.getString('metric') ??
      'total') as LeaderboardMetric;
    const limit = interaction.options.getInteger('limit') ?? 10;

    const entries = db.leaderboard(interaction.guildId, metric, limit);

    if (entries.length === 0) {
      await interaction.reply(
        'No Scrandle results recorded yet. Post some scores (or run `/scan`)!',
      );
      return;
    }

    const metricLabel =
      metric === 'average'
        ? 'Average score'
        : metric === 'perfects'
          ? 'Perfect games'
          : 'Total greens';

    const lines = entries.map((entry, index) => {
      const rank = `**${index + 1}.**`;
      const highlight =
        metric === 'average'
          ? `${entry.average.toFixed(2)} avg`
          : metric === 'perfects'
            ? `${entry.perfects} perfect`
            : `${entry.total} green`;
      return (
        `${rank} **${entry.username}** - ${highlight}\n` +
        ` ${entry.games} games, ${entry.average.toFixed(2)} avg, ` +
        `${entry.perfects} perfect, best ${entry.best}/10`
      );
    });

    const embed = new EmbedBuilder()
      .setTitle('Scrandle Leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Ranked by: ${metricLabel}` })
      .setColor(0xf1c40f);

    await interaction.reply({ embeds: [embed] });
  },
};
