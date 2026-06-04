import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';

export interface CommandContext {
  db: Db;
  config: Config;
}

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute(
    interaction: ChatInputCommandInteraction,
    ctx: CommandContext,
  ): Promise<void>;
}
