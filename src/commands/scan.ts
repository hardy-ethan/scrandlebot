import {
  ChannelType,
  SlashCommandBuilder,
  TextChannel,
  type Collection,
  type Message,
} from 'discord.js';
import { processMessage } from '../processor.js';
import { isBotOwner } from '../owner.js';
import type { Command } from './types.js';

const FETCH_BATCH = 100;

// The scan never looks at messages older than this one (smaller snowflake id).
// The cutoff message itself is still in range.
const SCAN_CUTOFF_ID = 1431418444972036357n;

export const scan: Command = {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('(Owner only) Scan a channel\'s history for past Scrandle results.')
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to scan (defaults to the current channel).')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Max messages to scan (default: everything down to the cutoff).')
        .setMinValue(1)
        .setMaxValue(1000000),
    ),

  async execute(interaction, ctx) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    if (!(await isBotOwner(interaction))) {
      await interaction.reply({
        content: 'Only the bot owner can run this command.',
        ephemeral: true,
      });
      return;
    }

    const channelOption = interaction.options.getChannel('channel');
    const channel = (channelOption ?? interaction.channel) as TextChannel | null;

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({
        content: 'Please choose a text channel to scan.',
        ephemeral: true,
      });
      return;
    }

    // With no limit the scan runs all the way down to the cutoff.
    const limit = interaction.options.getInteger('limit') ?? Infinity;

    await interaction.deferReply({ ephemeral: true });

    let scanned = 0;
    let recognized = 0;
    let recorded = 0;
    let duplicates = 0;
    let invalid = 0;
    let alreadyProcessed = 0;
    let before: string | undefined;
    let lastProgress = Date.now();
    let reachedCutoff = false;

    try {
      while (scanned < limit) {
        const batchSize = Math.min(FETCH_BATCH, limit - scanned);
        const batch: Collection<string, Message> = await channel.messages.fetch({
          limit: batchSize,
          before,
        });
        if (batch.size === 0) break;

        for (const message of batch.values()) {
          // Messages arrive newest-first, so once we cross the cutoff every
          // remaining message is older; stop here.
          if (BigInt(message.id) < SCAN_CUTOFF_ID) {
            reachedCutoff = true;
            break;
          }
          scanned++;
          const outcome = await processMessage(ctx.db, message, { react: false });
          if (!outcome.recognized) continue;
          recognized++;
          if (outcome.alreadyProcessed) alreadyProcessed++;
          else if (outcome.recorded) recorded++;
          else if (outcome.duplicateDay) duplicates++;
          else invalid++;
        }

        if (reachedCutoff) break;
        // A short batch means there is no older history left to fetch.
        if (batch.size < batchSize) break;

        before = batch.last()?.id;
        if (!before) break;

        // Periodically update the user so a long scan doesn't look stalled.
        if (Date.now() - lastProgress > 4000) {
          lastProgress = Date.now();
          await interaction.editReply(
            `Scanning #${channel.name}... ${scanned} messages, ` +
              `${recorded} new results so far.`,
          );
        }
      }
    } catch (error) {
      await interaction.editReply(
        `Scan stopped early after ${scanned} messages: ` +
          `${error instanceof Error ? error.message : 'unknown error'}\n` +
          summary({ recognized, recorded, duplicates, invalid, alreadyProcessed }),
      );
      return;
    }

    await interaction.editReply(
      `Scanned ${scanned} messages in #${channel.name}.\n` +
        summary({ recognized, recorded, duplicates, invalid, alreadyProcessed }),
    );
  },
};

function summary(s: {
  recognized: number;
  recorded: number;
  duplicates: number;
  invalid: number;
  alreadyProcessed: number;
}): string {
  return (
    `Recognised results: ${s.recognized}\n` +
    `Newly recorded: ${s.recorded}\n` +
    `Already processed: ${s.alreadyProcessed}\n` +
    `Duplicate-day (skipped): ${s.duplicates}\n` +
    `Invalid/malformed: ${s.invalid}`
  );
}
