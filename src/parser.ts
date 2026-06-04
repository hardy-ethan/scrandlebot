// Scrandle results come in two shapes:
//   ||🟩🟩🟩🟩🟩🟩🟩🟩🟥🟥 ||8/10 | 2026-06-04 | https://scrandle.com   (has red squares, spoiler-wrapped)
//   🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 10/10 | 2026-06-03 | https://scrandle.com       (perfect, no spoiler needed)

export const GREEN = '🟩';
export const RED = '🟥';

// The spoiler-wrapping rule only applies from this message onward. Anything
// posted before it (a smaller snowflake id) may leave the squares unspoilered.
const SPOILER_REQUIRED_FROM_ID = 1466946990259568771n;

// Whether the spoiler rule should be enforced for a given message. With no id
// (e.g. standalone parsing) the rule is enforced.
function spoilerRequired(messageId?: string): boolean {
  if (!messageId) return true;
  try {
    return BigInt(messageId) >= SPOILER_REQUIRED_FROM_ID;
  } catch {
    return true;
  }
}

// Matches the structure only. Counts, spoiler rules and dates are validated
// after, so malformed-but-recognisable attempts still get processed.
const SCRANDLE_RE =
  /(\|\|)?\s*((?:🟩|🟥){10})\s*(\|\|)?\s*(\d+)\s*\/\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(https?:\/\/(?:www\.)?scrandle\.com\S*)/u;

export interface ParsedScore {
  green: number;
  red: number;
  /** Per-round outcome, 10 characters of 'G' (green) or 'R' (red), in order. */
  pattern: string;
  /** The X from "X/10" as written in the message. */
  reportedScore: number;
  /** The Y from "X/Y" as written in the message. */
  reportedTotal: number;
  puzzleDate: string; // YYYY-MM-DD
  /** 0 = Sunday .. 6 = Saturday (UTC). */
  dayOfWeek: number;
  url: string;
  spoilerWrapped: boolean;
}

export interface ParseResult {
  /** True when the message has the basic shape of a Scrandle result. */
  recognized: boolean;
  /** True when the message is a well-formed, rule-abiding result. */
  valid: boolean;
  reason?: string;
  score?: ParsedScore;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function toPattern(squares: string): { green: number; pattern: string } {
  // for..of iterates by code point so the emoji are read correctly.
  let green = 0;
  let pattern = '';
  for (const ch of squares) {
    if (ch === GREEN) {
      green++;
      pattern += 'G';
    } else {
      pattern += 'R';
    }
  }
  return { green, pattern };
}

export interface ParseOptions {
  // Discord message id, used to decide whether the spoiler rule applies.
  messageId?: string;
}

export function parseScrandle(
  content: string,
  options: ParseOptions = {},
): ParseResult {
  if (!content) return { recognized: false, valid: false };

  const match = SCRANDLE_RE.exec(content);
  if (!match) return { recognized: false, valid: false };

  const [, leadPipes, squares, trailPipes, scoreStr, totalStr, dateStr, url] =
    match;

  const { green, pattern } = toPattern(squares);
  const red = 10 - green;
  const reportedScore = Number(scoreStr);
  const reportedTotal = Number(totalStr);
  const spoilerWrapped = Boolean(leadPipes && trailPipes);

  const [y, m, d] = dateStr.split('-').map(Number);
  const validDate = isRealDate(y, m, d);
  const dayOfWeek = validDate
    ? new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    : -1;

  const score: ParsedScore = {
    green,
    red,
    pattern,
    reportedScore,
    reportedTotal,
    puzzleDate: dateStr,
    dayOfWeek,
    url,
    spoilerWrapped,
  };

  if (reportedTotal !== 10) {
    return {
      recognized: true,
      valid: false,
      reason: `score denominator must be 10 (got ${reportedTotal})`,
      score,
    };
  }
  if (reportedScore !== green) {
    return {
      recognized: true,
      valid: false,
      reason: `reported score ${reportedScore} does not match ${green} green square(s)`,
      score,
    };
  }
  if (red > 0 && !spoilerWrapped && spoilerRequired(options.messageId)) {
    return {
      recognized: true,
      valid: false,
      reason: 'results with red squares must be spoiler-wrapped (|| ... ||)',
      score,
    };
  }
  if (!validDate) {
    return {
      recognized: true,
      valid: false,
      reason: `invalid date "${dateStr}"`,
      score,
    };
  }

  return { recognized: true, valid: true, score };
}

// Grace period added to the end of the window so results posted just after
// midnight UTC still count.
const GRACE_MS = 15 * 60 * 1000;

// The [start, end) window in which a result for puzzleDate can be posted:
// from that date at 00:00 UTC up to (not including) the next day at 00:00 UTC,
// plus a 15 minute grace period at the end.
export function puzzleWindow(puzzleDate: string): { start: number; end: number } {
  const start = Date.parse(`${puzzleDate}T00:00:00.000Z`);
  return { start, end: start + 24 * 60 * 60 * 1000 + GRACE_MS };
}
