import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db, type ScoreInput } from '../src/db.js';

const GUILD = 'g1';

function freshDb(): Db {
  return new Db(':memory:');
}

let counter = 0;
function score(overrides: Partial<ScoreInput> = {}): ScoreInput {
  const puzzleDate = overrides.puzzleDate ?? '2026-06-04';
  const dayOfWeek = new Date(`${puzzleDate}T00:00:00Z`).getUTCDay();
  return {
    messageId: `m${counter++}`,
    guildId: GUILD,
    channelId: 'c1',
    userId: 'alice',
    username: 'alice',
    green: 8,
    pattern: 'GGGGGGGGRR',
    puzzleDate,
    dayOfWeek,
    messageTimestamp: Date.parse(`${puzzleDate}T12:00:00Z`),
    ...overrides,
  };
}

test('addScore inserts a new row and reports it', () => {
  const db = freshDb();
  assert.equal(db.addScore(score()), true);
  db.close();
});

test('addScore ignores a second result for the same user and day', () => {
  const db = freshDb();
  assert.equal(db.addScore(score({ messageId: 'm-a', green: 8 })), true);
  assert.equal(db.addScore(score({ messageId: 'm-b', green: 4 })), false);
  const stats = db.userStats(GUILD, 'alice');
  assert.equal(stats?.games, 1);
  assert.equal(stats?.total, 8);
  db.close();
});

test('hasScoreForDay reflects stored results', () => {
  const db = freshDb();
  assert.equal(db.hasScoreForDay(GUILD, 'alice', '2026-06-04'), false);
  db.addScore(score());
  assert.equal(db.hasScoreForDay(GUILD, 'alice', '2026-06-04'), true);
  assert.equal(db.hasScoreForDay(GUILD, 'alice', '2026-06-05'), false);
  db.close();
});

test('processed-message tracking is independent of scores', () => {
  const db = freshDb();
  assert.equal(db.isProcessed('m1'), false);
  db.markProcessed('m1', GUILD, true, false);
  assert.equal(db.isProcessed('m1'), true);
  // A scored message is not implicitly marked processed.
  db.addScore(score({ messageId: 'm2' }));
  assert.equal(db.isProcessed('m2'), false);
  db.close();
});

test('userStats aggregates games, average, extremes and distribution', () => {
  const db = freshDb();
  db.addScore(score({ messageId: 's1', puzzleDate: '2026-06-01', green: 10 }));
  db.addScore(score({ messageId: 's2', puzzleDate: '2026-06-02', green: 6 }));
  db.addScore(score({ messageId: 's3', puzzleDate: '2026-06-03', green: 10 }));
  db.addScore(score({ messageId: 's4', puzzleDate: '2026-06-04', green: 8 }));

  const stats = db.userStats(GUILD, 'alice');
  assert.ok(stats);
  assert.equal(stats.games, 4);
  assert.equal(stats.total, 34);
  assert.equal(stats.average, 8.5);
  assert.equal(stats.best, 10);
  assert.equal(stats.worst, 6);
  assert.equal(stats.perfects, 2);
  assert.equal(stats.lastDate, '2026-06-04');
  assert.deepEqual(stats.distribution, { 6: 1, 8: 1, 10: 2 });
  db.close();
});

test('userStats returns null for an unknown player', () => {
  const db = freshDb();
  assert.equal(db.userStats(GUILD, 'nobody'), null);
  db.close();
});

test('leaderboard ranks by the requested metric', () => {
  const db = freshDb();
  db.upsertUser(GUILD, 'alice', 'alice');
  db.upsertUser(GUILD, 'bob', 'bob');
  // alice: two games, total 18, avg 9, one perfect.
  db.addScore(score({ messageId: 'a1', userId: 'alice', username: 'alice', puzzleDate: '2026-06-01', green: 10 }));
  db.addScore(score({ messageId: 'a2', userId: 'alice', username: 'alice', puzzleDate: '2026-06-02', green: 8 }));
  // bob: three games, total 21, avg 7, no perfect.
  db.addScore(score({ messageId: 'b1', userId: 'bob', username: 'bob', puzzleDate: '2026-06-01', green: 7 }));
  db.addScore(score({ messageId: 'b2', userId: 'bob', username: 'bob', puzzleDate: '2026-06-02', green: 7 }));
  db.addScore(score({ messageId: 'b3', userId: 'bob', username: 'bob', puzzleDate: '2026-06-03', green: 7 }));

  const byTotal = db.leaderboard(GUILD, 'total', 10);
  assert.deepEqual(byTotal.map((e) => e.userId), ['bob', 'alice']);

  const byAverage = db.leaderboard(GUILD, 'average', 10);
  assert.deepEqual(byAverage.map((e) => e.userId), ['alice', 'bob']);
  assert.equal(byAverage[0].average, 9);

  const byPerfects = db.leaderboard(GUILD, 'perfects', 10);
  assert.equal(byPerfects[0].userId, 'alice');
  assert.equal(byPerfects[0].perfects, 1);
  db.close();
});

test('leaderboard honours the limit', () => {
  const db = freshDb();
  db.addScore(score({ messageId: 'a', userId: 'alice', username: 'alice' }));
  db.addScore(score({ messageId: 'b', userId: 'bob', username: 'bob' }));
  assert.equal(db.leaderboard(GUILD, 'total', 1).length, 1);
  db.close();
});

test('dayScores returns rows scoped by guild and optionally user', () => {
  const db = freshDb();
  db.addScore(score({ messageId: 'a', userId: 'alice', username: 'alice', puzzleDate: '2026-06-01', green: 9 }));
  db.addScore(score({ messageId: 'b', userId: 'bob', username: 'bob', puzzleDate: '2026-06-02', green: 5 }));

  assert.equal(db.dayScores(GUILD).length, 2);
  const aliceOnly = db.dayScores(GUILD, 'alice');
  assert.equal(aliceOnly.length, 1);
  assert.equal(aliceOnly[0].green, 9);
  // Monday for 2026-06-01.
  assert.equal(aliceOnly[0].dayOfWeek, 1);
  db.close();
});

test('roundBreakdown tallies how many players missed each round', () => {
  const db = freshDb();
  // Round 1 (index 0) and round 10 (index 9) are missed by everyone here.
  db.addScore(score({ messageId: 'r1', userId: 'alice', username: 'alice', pattern: 'RGGGGGGGGR' }));
  db.addScore(score({ messageId: 'r2', userId: 'bob', username: 'bob', pattern: 'RRGGGGGGGR' }));

  const breakdown = db.roundBreakdown(GUILD, '2026-06-04');
  assert.equal(breakdown.players, 2);
  assert.equal(breakdown.wrongByRound[0], 2); // round 1: both wrong
  assert.equal(breakdown.wrongByRound[1], 1); // round 2: only bob
  assert.equal(breakdown.wrongByRound[2], 0); // round 3: nobody
  assert.equal(breakdown.wrongByRound[9], 2); // round 10: both wrong
  db.close();
});

test('roundBreakdown ignores other days and reports no players when empty', () => {
  const db = freshDb();
  db.addScore(score({ messageId: 'x', puzzleDate: '2026-06-04', pattern: 'RGGGGGGGGG' }));
  assert.equal(db.roundBreakdown(GUILD, '2026-06-05').players, 0);
  db.close();
});

test('latestRoundDate returns the most recent day with pattern data', () => {
  const db = freshDb();
  assert.equal(db.latestRoundDate(GUILD), null);
  db.addScore(score({ messageId: 'd1', puzzleDate: '2026-06-01' }));
  db.addScore(score({ messageId: 'd2', puzzleDate: '2026-06-03' }));
  assert.equal(db.latestRoundDate(GUILD), '2026-06-03');
  db.close();
});

test('upsertUser updates the stored display name', () => {
  const db = freshDb();
  db.upsertUser(GUILD, 'alice', 'alice');
  assert.equal(db.usernameFor(GUILD, 'alice'), 'alice');
  db.upsertUser(GUILD, 'alice', 'alice2');
  assert.equal(db.usernameFor(GUILD, 'alice'), 'alice2');
  db.close();
});
