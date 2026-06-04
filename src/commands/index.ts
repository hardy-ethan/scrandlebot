import type { Command } from './types.js';
import { leaderboard } from './leaderboard.js';
import { stats } from './stats.js';
import { chart } from './chart.js';
import { rounds } from './rounds.js';
import { scan } from './scan.js';
import { deleteMessage } from './delete.js';

export const commands: Command[] = [leaderboard, stats, chart, rounds, scan, deleteMessage];

export const commandMap = new Map<string, Command>(
  commands.map((command) => [command.data.name, command]),
);

export type { Command } from './types.js';
