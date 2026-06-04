import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { UserStats } from '../db.js';
import type { Command } from './types.js';

function distributionBars(stats: UserStats): string {
  const max = Math.max(1, ...Object.values(stats.distribution));
  const lines: string[] = [];
  for (let green = 10; green >= 0; green--) {
    const count = stats.distribution[green] ?? 0;
    if (count === 0 && green !== 10 && green !== 0) continue;
    const barLength = Math.round((count / max) * 12);
    const bar = '█'.repeat(barLength) || '.';
    lines.push(`\`${String(green).padStart(2)}/10\` ${bar} ${count}`);
  }
  return lines.join('\n');
}

export const stats: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show Scrandle stats for yourself or another player.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The player to look up (defaults to you).'),
    ),

  async execute(interaction, { db }) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const data = db.userStats(interaction.guildId, target.id);

    if (!data) {
      const who = target.id === interaction.user.id ? 'You have' : `${target.username} has`;
      await interaction.reply({
        content: `${who} no recorded Scrandle results yet.`,
        ephemeral: target.id === interaction.user.id,
      });
      return;
    }

    const perfectRate = ((data.perfects / data.games) * 100).toFixed(0);

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Scrandle stats`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x5865f2)
      .addFields(
        { name: 'Games', value: String(data.games), inline: true },
        { name: 'Average', value: data.average.toFixed(2), inline: true },
        { name: 'Total greens', value: String(data.total), inline: true },
        { name: 'Best', value: `${data.best}/10`, inline: true },
        { name: 'Worst', value: `${data.worst}/10`, inline: true },
        {
          name: 'Perfect games',
          value: `${data.perfects} (${perfectRate}%)`,
          inline: true,
        },
        { name: 'Distribution', value: distributionBars(data) || 'none' },
      );

    if (data.lastDate) {
      embed.setFooter({ text: `Last result: ${data.lastDate}` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
