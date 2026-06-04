# scrandlebot

A Discord bot (discord.js + TypeScript, SQLite) that scans and tracks
[Scrandle](https://scrandle.com) result messages.

## What it does

- Watches for new messages and records valid Scrandle results as they're posted.
- `/scan` (bot owner only) reads back through a channel's history to backfill
  old results.
- Reacts with a checkmark to live results it hasn't processed before. Results
  picked up by `/scan` are recorded but not reacted to. The record of what's been
  processed lives in the database (the `processed_messages` table), so the
  reaction itself is never used to decide that. Removing or re-adding it won't
  change anything.
- `/leaderboard` ranks players by total greens, average, or perfect games.
- `/stats [user]` shows games, average, best/worst, perfect rate and a score
  histogram.
- `/chart [user]` renders a PNG of the score distribution per day of week.
- `/rounds [date]` shows, for one day, how many players missed each of the 10
  rounds and which rounds everyone got wrong. The breakdown is spoiler-wrapped.

## Message formats

There are always 10 squares, the score is `X/10` where `X` is the number of
green squares, and the date is the puzzle date (`YYYY-MM-DD`).

Results with one or more red squares must be spoiler-wrapped:

```
||🟩🟩🟩🟩🟩🟩🟩🟩🟥🟥 ||8/10 | 2026-06-04 | https://scrandle.com
```

Perfect results don't need spoiler tags:

```
🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 10/10 | 2026-06-03 | https://scrandle.com
```

A result is counted only when:

- there are exactly 10 squares, all green or red;
- the reported `X` matches the green count and the total is 10;
- any result with red squares is spoiler-wrapped (messages posted before
  message id `1466946990259568771` are exempt from this);
- the date is a real calendar date; and
- the message was posted within the puzzle's window: the puzzle date at
  `00:00 UTC` up to, but not including, the next day at `00:00 UTC`, plus a
  15 minute grace period at the end.

Only the first valid result per user per puzzle day counts. Later duplicates are
still marked as processed (so they aren't handled again) but don't add a second
score and aren't reacted to.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   Uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) for
   storage and [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) for
   charts. Both ship prebuilt binaries, so no C toolchain or system libraries
   are required.

2. Create a Discord application and bot in the
   [Developer Portal](https://discord.com/developers/applications):

   - Add a bot and copy its token.
   - Under Bot > Privileged Gateway Intents, enable the Message Content Intent.
   - Invite it with the `bot` and `applications.commands` scopes and these
     permissions: View Channels, Read Message History, Send Messages, Add
     Reactions, Attach Files.

3. Configure the environment:

   ```bash
   cp .env.example .env
   # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID
   ```

   `DISCORD_GUILD_ID` is the server the bot runs in; slash commands are
   registered there.

4. Run it:

   ```bash
   npm run dev          # watch mode (tsx)
   # or
   npm run build && npm start
   ```

   Slash commands are registered on startup.

## Commands

| Command | Description |
| --- | --- |
| `/leaderboard [metric] [limit]` | Server leaderboard (metric: total, average, or perfects). |
| `/stats [user]` | Stats for yourself or another player. |
| `/chart [user]` | Score distribution by weekday (server-wide or per user). |
| `/rounds [date]` | Per-round miss counts for a day, spoilered (defaults to the latest day). |
| `/scan [channel] [limit]` | Bot owner: backfill a channel's history (defaults to everything down to the cutoff). |
| `/delete <message> [channel]` | Bot owner: delete a message the bot posted (by id or link). |

## Tests

Unit tests run on Node's built-in test runner through `tsx`:

```bash
npm test
```

They cover message parsing and validation, the database queries, chart
rendering, and the message-processing pipeline (recording, dedupe, the time
window and the spoiler exemption).

## Layout

```
src/
  index.ts          client setup, event wiring, command registration
  config.ts         environment configuration
  parser.ts         Scrandle message parsing and validation
  db.ts             SQLite schema and queries
  processor.ts      parse, store, react
  chart.ts          day-of-week chart rendering
  commands/         slash commands (leaderboard, stats, chart, rounds, scan, delete)
test/               unit tests
```
