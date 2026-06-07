import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface ScoreInput {
  messageId: string;
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  green: number;
  /** Per-round outcome, 10 characters of 'G' or 'R'. */
  pattern: string;
  puzzleDate: string;
  dayOfWeek: number;
  messageTimestamp: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  games: number;
  total: number;
  average: number;
  perfects: number;
  best: number;
}

export interface UserStats {
  userId: string;
  username: string;
  games: number;
  total: number;
  average: number;
  best: number;
  worst: number;
  perfects: number;
  lastDate: string | null;
  /** green-count -> number of games with that count */
  distribution: Record<number, number>;
}

export interface DayScore {
  dayOfWeek: number;
  green: number;
}

export interface RoundBreakdown {
  puzzleDate: string;
  /** Players with a usable round pattern for this day. */
  players: number;
  /** Length 10. wrongByRound[i] is how many players missed round i + 1. */
  wrongByRound: number[];
}

export type LeaderboardMetric = 'total' | 'average' | 'perfects';

// processed_messages is the record of which messages have been handled. The
// checkmark reaction is not used for that; it's only a visual cue for users.
export class Db {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id   TEXT PRIMARY KEY,
        guild_id     TEXT NOT NULL,
        recognized   INTEGER NOT NULL,
        recorded     INTEGER NOT NULL,
        processed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scores (
        message_id   TEXT PRIMARY KEY,
        guild_id     TEXT NOT NULL,
        channel_id   TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        username     TEXT NOT NULL,
        green        INTEGER NOT NULL,
        pattern      TEXT,
        puzzle_date  TEXT NOT NULL,
        day_of_week  INTEGER NOT NULL,
        message_ts   INTEGER NOT NULL,
        created_at   INTEGER NOT NULL
      );

      -- one counted result per user per puzzle per guild
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_unique_day
        ON scores (guild_id, user_id, puzzle_date);
      CREATE INDEX IF NOT EXISTS idx_scores_guild ON scores (guild_id);
      CREATE INDEX IF NOT EXISTS idx_scores_user ON scores (guild_id, user_id);

      CREATE TABLE IF NOT EXISTS users (
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        username   TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );
    `);

    // pattern was added after the first release; backfill the column for
    // databases created before it existed.
    this.addColumnIfMissing('scores', 'pattern', 'TEXT');
  }

  private addColumnIfMissing(table: string, column: string, decl: string): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
  }

  isProcessed(messageId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM processed_messages WHERE message_id = ?')
      .get(messageId);
    return row !== undefined;
  }

  markProcessed(
    messageId: string,
    guildId: string,
    recognized: boolean,
    recorded: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO processed_messages
           (message_id, guild_id, recognized, recorded, processed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(messageId, guildId, recognized ? 1 : 0, recorded ? 1 : 0, Date.now());
  }

  hasScoreForDay(guildId: string, userId: string, puzzleDate: string): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM scores WHERE guild_id = ? AND user_id = ? AND puzzle_date = ?',
      )
      .get(guildId, userId, puzzleDate);
    return row !== undefined;
  }

  upsertUser(guildId: string, userId: string, username: string): void {
    this.db
      .prepare(
        `INSERT INTO users (guild_id, user_id, username, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at`,
      )
      .run(guildId, userId, username, Date.now());
  }

  /**
   * Insert a counted score. Returns true if a new row was added, false if a
   * result for this (guild, user, day) already existed.
   */
  addScore(input: ScoreInput): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO scores
           (message_id, guild_id, channel_id, user_id, username,
            green, pattern, puzzle_date, day_of_week, message_ts, created_at)
         VALUES (@messageId, @guildId, @channelId, @userId, @username,
                 @green, @pattern, @puzzleDate, @dayOfWeek, @messageTimestamp, @createdAt)`,
      )
      .run({ ...input, createdAt: Date.now() });
    return result.changes > 0;
  }

  leaderboard(
    guildId: string,
    metric: LeaderboardMetric,
    limit: number,
  ): LeaderboardEntry[] {
    const orderBy =
      metric === 'average'
        ? 'average DESC, games DESC'
        : metric === 'perfects'
          ? 'perfects DESC, average DESC'
          : 'total DESC, average DESC';

    const rows = this.db
      .prepare(
        `SELECT
            user_id AS userId,
            COUNT(*) AS games,
            SUM(green) AS total,
            AVG(green) AS average,
            SUM(CASE WHEN green = 10 THEN 1 ELSE 0 END) AS perfects,
            MAX(green) AS best
         FROM scores
         WHERE guild_id = ?
         GROUP BY user_id
         HAVING COUNT(*) >= 10
         ORDER BY ${orderBy}
         LIMIT ?`,
      )
      .all(guildId, limit) as Array<Omit<LeaderboardEntry, 'username'>>;

    return rows.map((row) => ({
      ...row,
      username: this.usernameFor(guildId, row.userId),
    }));
  }

  userStats(guildId: string, userId: string): UserStats | null {
    const summary = this.db
      .prepare(
        `SELECT
            COUNT(*) AS games,
            SUM(green) AS total,
            AVG(green) AS average,
            MAX(green) AS best,
            MIN(green) AS worst,
            SUM(CASE WHEN green = 10 THEN 1 ELSE 0 END) AS perfects,
            MAX(puzzle_date) AS lastDate
         FROM scores
         WHERE guild_id = ? AND user_id = ?`,
      )
      .get(guildId, userId) as
      | {
          games: number;
          total: number | null;
          average: number | null;
          best: number | null;
          worst: number | null;
          perfects: number;
          lastDate: string | null;
        }
      | undefined;

    if (!summary || summary.games === 0) return null;

    const distRows = this.db
      .prepare(
        `SELECT green, COUNT(*) AS count
         FROM scores
         WHERE guild_id = ? AND user_id = ?
         GROUP BY green`,
      )
      .all(guildId, userId) as Array<{ green: number; count: number }>;

    const distribution: Record<number, number> = {};
    for (const row of distRows) distribution[row.green] = row.count;

    return {
      userId,
      username: this.usernameFor(guildId, userId),
      games: summary.games,
      total: summary.total ?? 0,
      average: summary.average ?? 0,
      best: summary.best ?? 0,
      worst: summary.worst ?? 0,
      perfects: summary.perfects,
      lastDate: summary.lastDate,
      distribution,
    };
  }

  /** All (dayOfWeek, green) pairs for a guild, optionally narrowed to one user. */
  dayScores(guildId: string, userId?: string): DayScore[] {
    if (userId) {
      return this.db
        .prepare(
          `SELECT day_of_week AS dayOfWeek, green
           FROM scores WHERE guild_id = ? AND user_id = ?`,
        )
        .all(guildId, userId) as DayScore[];
    }
    return this.db
      .prepare(
        `SELECT day_of_week AS dayOfWeek, green FROM scores WHERE guild_id = ?`,
      )
      .all(guildId) as DayScore[];
  }

  /** The most recent puzzle date that has round-pattern data, if any. */
  latestRoundDate(guildId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT MAX(puzzle_date) AS date
         FROM scores WHERE guild_id = ? AND pattern IS NOT NULL`,
      )
      .get(guildId) as { date: string | null } | undefined;
    return row?.date ?? null;
  }

  /** Tally, for one day, how many players missed each of the 10 rounds. */
  roundBreakdown(guildId: string, puzzleDate: string): RoundBreakdown {
    const rows = this.db
      .prepare(
        `SELECT pattern FROM scores
         WHERE guild_id = ? AND puzzle_date = ? AND pattern IS NOT NULL`,
      )
      .all(guildId, puzzleDate) as Array<{ pattern: string }>;

    const wrongByRound = new Array<number>(10).fill(0);
    let players = 0;
    for (const { pattern } of rows) {
      if (pattern.length !== 10) continue;
      players++;
      for (let i = 0; i < 10; i++) {
        if (pattern[i] === 'R') wrongByRound[i]++;
      }
    }
    return { puzzleDate, players, wrongByRound };
  }

  usernameFor(guildId: string, userId: string): string {
    const row = this.db
      .prepare('SELECT username FROM users WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as { username: string } | undefined;
    return row?.username ?? `User ${userId}`;
  }

  close(): void {
    this.db.close();
  }
}
