import type { Message, PartialMessage } from 'discord.js';
import type { Db } from './db.js';
import { parseScrandle, puzzleWindow } from './parser.js';

export const CHECKMARK = '✅';

export interface ProcessOutcome {
  /** Had the basic shape of a Scrandle result. */
  recognized: boolean;
  /** Was already in the processed_messages table. */
  alreadyProcessed: boolean;
  /** A new score row was inserted. */
  recorded: boolean;
  /** Recognised + valid but the user already had a result for that day. */
  duplicateDay: boolean;
  /** Recognised but failed validation (bad format, outside window, etc). */
  invalidReason?: string;
}

const SKIP: ProcessOutcome = {
  recognized: false,
  alreadyProcessed: false,
  recorded: false,
  duplicateDay: false,
};

export interface ProcessOptions {
  /** Add the checkmark reaction for newly handled messages. Default true. */
  react?: boolean;
}

// Parse a message, store a new score if it's valid, and add the checkmark if we
// haven't seen it before (duplicate-day results are skipped, and reacting can be
// turned off entirely via options). Whether we've seen it is read from the
// database, not from the reaction.
export async function processMessage(
  db: Db,
  message: Message | PartialMessage,
  options: ProcessOptions = {},
): Promise<ProcessOutcome> {
  let full: Message;
  try {
    full = message.partial ? await message.fetch() : (message as Message);
  } catch {
    return SKIP;
  }

  if (full.author?.bot) return SKIP;

  const content = full.content ?? '';
  const parsed = parseScrandle(content, { messageId: full.id });
  if (!parsed.recognized || !parsed.score) return SKIP;

  if (db.isProcessed(full.id)) {
    return { ...SKIP, recognized: true, alreadyProcessed: true };
  }

  const guildId = full.guildId ?? '0';
  const score = parsed.score;

  let recorded = false;
  let duplicateDay = false;
  let invalidReason = parsed.valid ? undefined : parsed.reason;

  if (parsed.valid) {
    const withinWindow = isWithinWindow(score.puzzleDate, full.createdTimestamp);
    if (!withinWindow) {
      invalidReason = 'posted outside the puzzle\'s valid 24h UTC window';
    } else if (db.hasScoreForDay(guildId, full.author.id, score.puzzleDate)) {
      duplicateDay = true;
    } else {
      db.upsertUser(guildId, full.author.id, full.author.username);
      recorded = db.addScore({
        messageId: full.id,
        guildId,
        channelId: full.channelId,
        userId: full.author.id,
        username: full.author.username,
        green: score.green,
        pattern: score.pattern,
        puzzleDate: score.puzzleDate,
        dayOfWeek: score.dayOfWeek,
        messageTimestamp: full.createdTimestamp,
      });
    }
  }

  db.markProcessed(full.id, guildId, true, recorded);
  // A duplicate result (same user, same day) is still recorded as processed so
  // it isn't handled again, but it gets no checkmark since it wasn't counted.
  // Backfill scans pass react: false so only live messages get the checkmark.
  if (options.react !== false && !duplicateDay) await safeReact(full);

  return {
    recognized: true,
    alreadyProcessed: false,
    recorded,
    duplicateDay,
    invalidReason,
  };
}

function isWithinWindow(puzzleDate: string, timestamp: number): boolean {
  const { start, end } = puzzleWindow(puzzleDate);
  return timestamp >= start && timestamp < end;
}

async function safeReact(message: Message): Promise<void> {
  try {
    await message.react(CHECKMARK);
  } catch {
    // Missing permissions, deleted message, rate limit, etc.
  }
}
