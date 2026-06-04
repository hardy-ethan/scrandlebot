import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from 'discord.js';
import { loadConfig } from './config.js';
import { Db } from './db.js';
import { commandMap, commands } from './commands/index.js';
import { processMessage } from './processor.js';

async function main() {
  const config = loadConfig();
  const db = new Db(config.databasePath);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    // Needed so we can process uncached messages from gateway events.
    partials: [Partials.Message, Partials.Channel],
  });

  client.once(Events.ClientReady, async (ready) => {
    console.log(`Logged in as ${ready.user.tag}`);
    await registerCommands(config);
  });

  // Automatically track new result messages as they are posted.
  client.on(Events.MessageCreate, async (message) => {
    try {
      await processMessage(db, message);
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  });

  // Slash command dispatch.
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, { db, config });
    } catch (error) {
      console.error(`Error in /${interaction.commandName}:`, error);
      const payload = {
        content: 'Something went wrong running that command.',
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  });

  const shutdown = () => {
    console.log('Shutting down...');
    client.destroy();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await client.login(config.token);
}

async function registerCommands(config: ReturnType<typeof loadConfig>) {
  const rest = new REST().setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());

  try {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body },
    );
    console.log(`Registered ${body.length} guild commands.`);
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
