import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { DayScore } from './db.js';

const WIDTH = 1000;
const HEIGHT = 580;

const BG = '#2b2d31';
const TEXT = '#dbdee1';
const MUTED = '#9aa0a6';
const GRID = '#3a3d43';

// Mon-first display order mapped onto JS getUTCDay() (0 = Sun .. 6 = Sat).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Bucket {
  label: string;
  color: string;
  test: (green: number) => boolean;
}

// Score buckets shown within each day's bar.
const BUCKETS: Bucket[] = [
  { label: '0-5', color: '#e74c3c', test: (g) => g <= 5 },
  { label: '6-7', color: '#e67e22', test: (g) => g === 6 || g === 7 },
  { label: '8', color: '#f1c40f', test: (g) => g === 8 },
  { label: '9', color: '#2ecc71', test: (g) => g === 9 },
  { label: '10 (perfect)', color: '#1f8b4c', test: (g) => g === 10 },
];

// Stacked bar chart of the score distribution per day of week, returned as a
// PNG. Drawn directly on a canvas so there's no Chart.js / native build dep.
export async function renderDayOfWeekChart(
  scores: DayScore[],
  title: string,
): Promise<Buffer> {
  // counts[displayDayIndex][bucketIndex]
  const counts = DAY_ORDER.map(() => BUCKETS.map(() => 0));
  const perDayTotals = DAY_ORDER.map(() => 0);
  const perDaySum = DAY_ORDER.map(() => 0);

  for (const { dayOfWeek, green } of scores) {
    const dayIndex = DAY_ORDER.indexOf(dayOfWeek);
    if (dayIndex === -1) continue;
    const bucketIndex = BUCKETS.findIndex((b) => b.test(green));
    if (bucketIndex !== -1) counts[dayIndex][bucketIndex] += 1;
    perDayTotals[dayIndex] += 1;
    perDaySum[dayIndex] += green;
  }

  const maxTotal = Math.max(1, ...perDayTotals);
  const yMax = niceCeil(maxTotal);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Titles.
  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(title, WIDTH / 2, 38);
  ctx.fillStyle = MUTED;
  ctx.font = '16px sans-serif';
  ctx.fillText('Score distribution by day of week', WIDTH / 2, 62);

  // Plot area.
  const plot = { left: 70, right: WIDTH - 30, top: 90, bottom: HEIGHT - 110 };
  const plotW = plot.right - plot.left;
  const plotH = plot.bottom - plot.top;

  // Y gridlines + labels.
  const ySteps = yMax <= 5 ? yMax : 5;
  ctx.textAlign = 'right';
  ctx.font = '13px sans-serif';
  for (let i = 0; i <= ySteps; i++) {
    const value = Math.round((yMax / ySteps) * i);
    const y = plot.bottom - (plotH * i) / ySteps;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.fillText(String(value), plot.left - 10, y + 4);
  }

  // Y axis title.
  ctx.save();
  ctx.translate(20, plot.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = '14px sans-serif';
  ctx.fillText('Number of games', 0, 0);
  ctx.restore();

  // Bars.
  const slot = plotW / DAY_ORDER.length;
  const barWidth = slot * 0.6;
  for (let d = 0; d < DAY_ORDER.length; d++) {
    const x = plot.left + slot * d + (slot - barWidth) / 2;
    let yCursor = plot.bottom;

    for (let b = 0; b < BUCKETS.length; b++) {
      const count = counts[d][b];
      if (count === 0) continue;
      const segHeight = (plotH * count) / yMax;
      yCursor -= segHeight;
      ctx.fillStyle = BUCKETS[b].color;
      ctx.fillRect(x, yCursor, barWidth, segHeight);
    }

    // Day label + average / count beneath the axis.
    const cx = x + barWidth / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(DAY_LABELS[d], cx, plot.bottom + 22);

    ctx.fillStyle = MUTED;
    ctx.font = '12px sans-serif';
    const total = perDayTotals[d];
    const sub =
      total === 0 ? 'no data' : `avg ${(perDaySum[d] / total).toFixed(1)}, n=${total}`;
    ctx.fillText(sub, cx, plot.bottom + 40);
  }

  // X axis baseline.
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();

  drawLegend(ctx, plot.left, HEIGHT - 30);

  return canvas.toBuffer('image/png');
}

function drawLegend(ctx: SKRSContext2D, startX: number, y: number): void {
  ctx.textAlign = 'left';
  ctx.font = '13px sans-serif';
  let x = startX;
  for (const bucket of BUCKETS) {
    ctx.fillStyle = bucket.color;
    ctx.fillRect(x, y - 11, 14, 14);
    ctx.fillStyle = TEXT;
    const text = bucket.label;
    ctx.fillText(text, x + 20, y);
    x += 24 + ctx.measureText(text).width + 22;
  }
}

/** Round up to a "nice" axis maximum so gridlines land on whole numbers. */
function niceCeil(value: number): number {
  if (value <= 5) return value;
  if (value <= 10) return Math.ceil(value / 2) * 2;
  if (value <= 50) return Math.ceil(value / 5) * 5;
  return Math.ceil(value / 10) * 10;
}
