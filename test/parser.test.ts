import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScrandle, puzzleWindow } from '../src/parser.js';

const PERFECT = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 10/10 | 2026-06-03 | https://scrandle.com';
const IMPERFECT = '||🟩🟩🟩🟩🟩🟩🟩🟩🟥🟥 ||8/10 | 2026-06-04 | https://scrandle.com';
const UNSPOILED = '🟩🟩🟩🟩🟩🟩🟩🟩🟥🟥 8/10 | 2026-06-04 | https://scrandle.com';

// Cutoff message id, before which the spoiler rule is not enforced.
const CUTOFF = '1466946990259568771';
const BEFORE_CUTOFF = '1466946990259568770';
const AFTER_CUTOFF = '1466946990259568772';

test('parses a perfect result without spoiler tags', () => {
  const result = parseScrandle(PERFECT);
  assert.equal(result.recognized, true);
  assert.equal(result.valid, true);
  assert.equal(result.score?.green, 10);
  assert.equal(result.score?.red, 0);
  assert.equal(result.score?.puzzleDate, '2026-06-03');
  assert.equal(result.score?.spoilerWrapped, false);
});

test('parses a spoiler-wrapped imperfect result', () => {
  const result = parseScrandle(IMPERFECT);
  assert.equal(result.valid, true);
  assert.equal(result.score?.green, 8);
  assert.equal(result.score?.red, 2);
  assert.equal(result.score?.spoilerWrapped, true);
});

test('records the per-round pattern in order', () => {
  assert.equal(parseScrandle(PERFECT).score?.pattern, 'GGGGGGGGGG');
  assert.equal(parseScrandle(IMPERFECT).score?.pattern, 'GGGGGGGGRR');
  const mixed = '||🟥🟩🟥🟩🟩🟩🟩🟩🟩🟩 ||8/10 | 2026-06-04 | https://scrandle.com';
  assert.equal(parseScrandle(mixed).score?.pattern, 'RGRGGGGGGG');
});

test('computes day of week in UTC', () => {
  // 2026-06-03 is a Wednesday.
  assert.equal(parseScrandle(PERFECT).score?.dayOfWeek, 3);
  // 2026-06-04 is a Thursday.
  assert.equal(parseScrandle(IMPERFECT).score?.dayOfWeek, 4);
});

test('finds a result embedded in surrounding text', () => {
  const content = `today: ||🟩🟩🟩🟩🟩🟩🟩🟥🟥🟥 ||7/10 | 2026-06-02 | https://scrandle.com gg`;
  const result = parseScrandle(content);
  assert.equal(result.valid, true);
  assert.equal(result.score?.green, 7);
});

test('does not recognise non-result messages', () => {
  assert.equal(parseScrandle('hello world').recognized, false);
  assert.equal(parseScrandle('').recognized, false);
});

test('rejects a denominator that is not 10', () => {
  const content = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 9/9 | 2026-06-03 | https://scrandle.com';
  const result = parseScrandle(content);
  assert.equal(result.recognized, true);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /denominator/);
});

test('rejects a score that does not match the green count', () => {
  const content = '||🟩🟩🟩🟩🟩🟩🟩🟥🟥🟥 ||8/10 | 2026-06-04 | https://scrandle.com';
  const result = parseScrandle(content);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /does not match/);
});

test('rejects an impossible date', () => {
  const content = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 10/10 | 2026-13-40 | https://scrandle.com';
  const result = parseScrandle(content);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /invalid date/);
});

test('requires spoilers for red squares by default', () => {
  const result = parseScrandle(UNSPOILED);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /spoiler/);
});

test('enforces the spoiler rule from the cutoff message onward', () => {
  assert.equal(parseScrandle(UNSPOILED, { messageId: CUTOFF }).valid, false);
  assert.equal(parseScrandle(UNSPOILED, { messageId: AFTER_CUTOFF }).valid, false);
});

test('exempts messages before the cutoff from the spoiler rule', () => {
  const result = parseScrandle(UNSPOILED, { messageId: BEFORE_CUTOFF });
  assert.equal(result.valid, true);
  assert.equal(result.score?.green, 8);
});

test('still requires correct counts even when spoiler-exempt', () => {
  const wrongCount = '🟩🟩🟩🟩🟩🟩🟩🟥🟥🟥 8/10 | 2026-06-04 | https://scrandle.com';
  const result = parseScrandle(wrongCount, { messageId: BEFORE_CUTOFF });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /does not match/);
});

test('falls back to enforcing spoilers for a non-numeric message id', () => {
  assert.equal(parseScrandle(UNSPOILED, { messageId: 'not-a-snowflake' }).valid, false);
});

test('puzzleWindow spans the day plus a 15 minute grace period', () => {
  const { start, end } = puzzleWindow('2026-06-04');
  assert.equal(start, Date.parse('2026-06-04T00:00:00.000Z'));
  assert.equal(end, Date.parse('2026-06-05T00:15:00.000Z'));
  assert.equal(end - start, (24 * 60 + 15) * 60 * 1000);
});
