import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from 'discord.js';
import { Db } from '../src/db.js';
import { processMessage, CHECKMARK } from '../src/processor.js';

const PERFECT = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 10/10 | 2026-06-03 | https://scrandle.com';
const UNSPOILED = '🟩🟩🟩🟩🟩🟩🟩🟩🟥🟥 8/10 | 2026-06-04 | https://scrandle.com';
const BEFORE_CUTOFF = '1466946990259568770';
const AFTER_CUTOFF = '1466946990259568772';

interface FakeOptions {
  id?: string;
  content: string;
  bot?: boolean;
  userId?: string;
  date?: string; // posting date, defaults to the puzzle date at noon
}

function fakeMessage(opts: FakeOptions): { message: Message; reactions: string[] } {
  const reactions: string[] = [];
  const created = opts.date
    ? Date.parse(opts.date)
    : Date.parse('2026-06-03T12:00:00Z');
  const message = {
    partial: false,
    id: opts.id ?? '1466946990259568900',
    guildId: 'g1',
    channelId: 'c1',
    content: opts.content,
    createdTimestamp: created,
    author: { bot: opts.bot ?? false, id: opts.userId ?? 'alice', username: opts.userId ?? 'alice' },
    async react(emoji: string) {
      reactions.push(emoji);
      return {};
    },
  } as unknown as Message;
  return { message, reactions };
}

test('records a valid result and reacts with a checkmark', async () => {
  const db = new Db(':memory:');
  const { message, reactions } = fakeMessage({ content: PERFECT });
  const outcome = await processMessage(db, message);
  assert.equal(outcome.recognized, true);
  assert.equal(outcome.recorded, true);
  assert.deepEqual(reactions, [CHECKMARK]);
  assert.equal(db.userStats('g1', 'alice')?.total, 10);
  db.close();
});

test('records but does not react when reacting is turned off', async () => {
  const db = new Db(':memory:');
  const { message, reactions } = fakeMessage({ content: PERFECT });
  const outcome = await processMessage(db, message, { react: false });
  assert.equal(outcome.recorded, true);
  assert.deepEqual(reactions, []);
  db.close();
});

test('does not reprocess or re-react to a known message', async () => {
  const db = new Db(':memory:');
  const first = fakeMessage({ id: 'dup', content: PERFECT });
  await processMessage(db, first.message);

  const second = fakeMessage({ id: 'dup', content: PERFECT });
  const outcome = await processMessage(db, second.message);
  assert.equal(outcome.alreadyProcessed, true);
  assert.equal(outcome.recorded, false);
  assert.deepEqual(second.reactions, []);
  db.close();
});

test('processing state comes from the database, not the reaction', async () => {
  const db = new Db(':memory:');
  // Mark processed without ever reacting; a second pass must still skip it.
  db.markProcessed('seen', 'g1', true, false);
  const { message, reactions } = fakeMessage({ id: 'seen', content: PERFECT });
  const outcome = await processMessage(db, message);
  assert.equal(outcome.alreadyProcessed, true);
  assert.deepEqual(reactions, []);
  db.close();
});

test('ignores messages from bots', async () => {
  const db = new Db(':memory:');
  const { message, reactions } = fakeMessage({ content: PERFECT, bot: true });
  const outcome = await processMessage(db, message);
  assert.equal(outcome.recognized, false);
  assert.deepEqual(reactions, []);
  db.close();
});

test('ignores messages that are not results', async () => {
  const db = new Db(':memory:');
  const { message } = fakeMessage({ content: 'just chatting' });
  const outcome = await processMessage(db, message);
  assert.equal(outcome.recognized, false);
  db.close();
});

test('flags a duplicate result for the same user and day without reacting', async () => {
  const db = new Db(':memory:');
  await processMessage(db, fakeMessage({ id: 'one', content: PERFECT }).message);
  const dup = fakeMessage({ id: 'two', content: PERFECT });
  const outcome = await processMessage(db, dup.message);
  assert.equal(outcome.recognized, true);
  assert.equal(outcome.recorded, false);
  assert.equal(outcome.duplicateDay, true);
  assert.deepEqual(dup.reactions, []);
  db.close();
});

test('rejects a result posted outside the puzzle window', async () => {
  const db = new Db(':memory:');
  // Puzzle date 2026-06-03, but posted on 2026-06-10.
  const { message } = fakeMessage({ content: PERFECT, date: '2026-06-10T12:00:00Z' });
  const outcome = await processMessage(db, message);
  assert.equal(outcome.recorded, false);
  assert.match(outcome.invalidReason ?? '', /window/);
  db.close();
});

test('honours the spoiler exemption based on message id', async () => {
  const db = new Db(':memory:');
  const before = fakeMessage({ id: BEFORE_CUTOFF, content: UNSPOILED, date: '2026-06-04T12:00:00Z' });
  const beforeOutcome = await processMessage(db, before.message);
  assert.equal(beforeOutcome.recorded, true);

  const after = fakeMessage({ id: AFTER_CUTOFF, content: UNSPOILED, userId: 'bob', date: '2026-06-04T12:00:00Z' });
  const afterOutcome = await processMessage(db, after.message);
  assert.equal(afterOutcome.recorded, false);
  assert.match(afterOutcome.invalidReason ?? '', /spoiler/);
  db.close();
});
