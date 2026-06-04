import { Team, type ChatInputCommandInteraction } from 'discord.js';

// True only for the user (or team member) that owns the bot application.
export async function isBotOwner(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const application = await interaction.client.application?.fetch();
  if (!application?.owner) return false;
  if (application.owner instanceof Team) {
    return application.owner.members.has(interaction.user.id);
  }
  return application.owner.id === interaction.user.id;
}
