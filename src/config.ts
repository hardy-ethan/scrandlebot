import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  token: string;
  clientId: string;
  guildId: string;
  databasePath: string;
}

export function loadConfig(): Config {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
    databasePath: process.env.DATABASE_PATH || './data/scrandle.db',
  };
}
