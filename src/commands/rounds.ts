import { SlashCommandBuilder } from 'discord.js';
import type { RoundBreakdown } from '../db.js';
import type { Command } from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Build the spoilered breakdown of who missed which round on a given day.
export function renderRounds(breakdown: RoundBreakdown): string {
  const { puzzleDate, players, wrongByRound } = breakdown;
  const playerWord = players === 1 ? 'player' : 'players';

  const everyoneMissed: number[] = [];
  const lines = wrongByRound.map((wrong, i) => {
    const round = i + 1;
    if (wrong === players) everyoneMissed.push(round);
    const bar = '█'.repeat(wrong) + '░'.repeat(players - wrong);
    return `\`R${String(round).padStart(2)} ${bar} ${wrong}/${players}\``;
  });

  const callout = everyoneMissed.length
    ? `Everyone missed: ||${everyoneMissed.join(', ')}||`
    : 'No round was missed by every player.';

  return (
    `**Scrandle rounds for ${puzzleDate}** (${players} ${playerWord})\n` +
    `${callout}\n` +
    `||${lines.join('\n')}||`
  );
}

export const rounds: Command = {
  data: new SlashCommandBuilder()
    .setName('rounds')
    .setDescription('Show how many players missed each round on a given day.')
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Puzzle date (YYYY-MM-DD, defaults to the latest day).'),
    ),

  async execute(interaction, { db }) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const requested = interaction.options.getString('date');
    if (requested && !DATE_RE.test(requested)) {
      await interaction.reply({
        content: 'Use a date in the form YYYY-MM-DD.',
        ephemeral: true,
      });
      return;
    }

    const date = requested ?? db.latestRoundDate(interaction.guildId);
    if (!date) {
      await interaction.reply(
        'No Scrandle results recorded yet. Post some scores (or run `/scan`)!',
      );
      return;
    }

    const breakdown = db.roundBreakdown(interaction.guildId, date);
    if (breakdown.players === 0) {
      await interaction.reply({
        content: `No round data recorded for ${date}.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply(renderRounds(breakdown));
  },
};
