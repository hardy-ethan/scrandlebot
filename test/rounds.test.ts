import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRounds } from '../src/commands/rounds.js';

test('renderRounds lists rounds everyone missed and spoilers the detail', () => {
  const out = renderRounds({
    puzzleDate: '2026-06-04',
    players: 2,
    // round 1 and round 10 missed by both players
    wrongByRound: [2, 1, 0, 0, 0, 0, 0, 0, 0, 2],
  });

  assert.match(out, /Scrandle rounds for 2026-06-04/);
  assert.match(out, /\(2 players\)/);
  assert.match(out, /Everyone missed: \|\|1, 10\|\|/);
  // the per-round table is wrapped in a spoiler
  assert.match(out, /\|\|`R 1/);
  assert.match(out, /R10/);
});

test('renderRounds notes when no round was missed by everyone', () => {
  const out = renderRounds({
    puzzleDate: '2026-06-04',
    players: 3,
    wrongByRound: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
  assert.match(out, /No round was missed by every player\./);
});

test('renderRounds uses the singular for a lone player', () => {
  const out = renderRounds({
    puzzleDate: '2026-06-04',
    players: 1,
    wrongByRound: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
  assert.match(out, /\(1 player\)/);
});
