import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageRef } from '../src/commands/delete.js';

test('parseMessageRef reads a raw message id', () => {
  assert.deepEqual(parseMessageRef('  1466946990259568771 '), {
    messageId: '1466946990259568771',
  });
});

test('parseMessageRef reads channel and message from a link', () => {
  const link =
    'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333';
  assert.deepEqual(parseMessageRef(link), {
    channelId: '222222222222222222',
    messageId: '333333333333333333',
  });
});

test('parseMessageRef rejects nonsense', () => {
  assert.equal(parseMessageRef('not-an-id'), null);
  assert.equal(parseMessageRef(''), null);
});
