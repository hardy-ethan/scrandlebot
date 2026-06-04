import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDayOfWeekChart } from '../src/chart.js';
import type { DayScore } from '../src/db.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('renders a PNG buffer for a populated dataset', async () => {
  const scores: DayScore[] = [
    { dayOfWeek: 1, green: 10 },
    { dayOfWeek: 2, green: 6 },
    { dayOfWeek: 2, green: 8 },
    { dayOfWeek: 0, green: 3 },
  ];
  const png = await renderDayOfWeekChart(scores, 'Test');
  assert.ok(png.length > 0);
  assert.ok(png.subarray(0, 4).equals(PNG_SIGNATURE));
});

test('renders a PNG even with no data', async () => {
  const png = await renderDayOfWeekChart([], 'Empty');
  assert.ok(png.subarray(0, 4).equals(PNG_SIGNATURE));
});
