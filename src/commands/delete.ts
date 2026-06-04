import {
  ChannelType,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { isBotOwner } from '../owner.js';
import type { Command } from './types.js';

const LINK_RE = /channels\/\d+\/(\d+)\/(\d+)/;

// Accepts either a raw message id or a Discord message link. When a link is
// given the channel id comes from the link.
export function parseMessageRef(
  input: string,
): { channelId?: string; messageId: string } | null {
  const trimmed = input.trim();
  const link = LINK_RE.exec(trimmed);
  if (link) return { channelId: link[1], messageId: link[2] };
  if (/^\d+$/.test(trimmed)) return { messageId: trimmed };
  return null;
}

export const deleteMessage: Command = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('(Owner only) Delete a message posted by the bot.')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Message id or link of the bot message to delete.')
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel the message is in (defaults to the current one).')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  async execute(interaction) {
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

    const ref = parseMessageRef(interaction.options.getString('message', true));
    if (!ref) {
      await interaction.reply({
        content: 'Give me a message id or a message link.',
        ephemeral: true,
      });
      return;
    }

    const channelOption = interaction.options.getChannel('channel');
    let channel: TextChannel | null = null;
    try {
      const resolved = ref.channelId
        ? await interaction.client.channels.fetch(ref.channelId)
        : (channelOption ?? interaction.channel);
      if (resolved && resolved.type === ChannelType.GuildText) {
        channel = resolved as TextChannel;
      } else if (channelOption) {
        channel = channelOption as TextChannel;
      } else if (interaction.channel?.type === ChannelType.GuildText) {
        channel = interaction.channel as TextChannel;
      }
    } catch {
      channel = null;
    }

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({
        content: 'I could not find that channel.',
        ephemeral: true,
      });
      return;
    }

    let message;
    try {
      message = await channel.messages.fetch(ref.messageId);
    } catch {
      await interaction.reply({
        content: 'I could not find that message in that channel.',
        ephemeral: true,
      });
      return;
    }

    if (message.author.id !== interaction.client.user?.id) {
      await interaction.reply({
        content: 'I can only delete my own messages.',
        ephemeral: true,
      });
      return;
    }

    try {
      await message.delete();
    } catch {
      await interaction.reply({
        content: 'I was not able to delete that message.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: 'Deleted that message.', ephemeral: true });
  },
};
