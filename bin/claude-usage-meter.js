#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const WEEKDAYS = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function parseArgs(argv) {
  const args = {
    claudeDir: path.join(os.homedir(), '.claude'),
    windows: 1,
    json: false,
    statsWindows: false,
    all: false,
    byModel: false,
    compact: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--by-model') args.byModel = true;
    else if (arg === '--stats-windows') args.statsWindows = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--compact') args.compact = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--claude-dir') args.claudeDir = requireValue(argv, ++index, arg);
    else if (arg === '--next-reset') args.nextReset = requireValue(argv, ++index, arg);
    else if (arg === '--reset-day') args.resetDay = requireValue(argv, ++index, arg);
    else if (arg === '--reset-time') args.resetTime = requireValue(argv, ++index, arg);
    else if (arg === '--no-save-reset') args.noSaveReset = true;
    else if (arg === '--now') args.now = requireValue(argv, ++index, arg);
    else if (arg === '--windows') args.windows = parseInteger(requireValue(argv, ++index, arg), arg);
    else if (arg === '--timezone') args.timezone = requireValue(argv, ++index, arg);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function requireValue(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return argv[index];
}

function parseInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDate(value, name) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be parseable by JavaScript Date. Prefer ISO with offset.`);
  }
  return date;
}

function configPath(claudeDir) {
  return path.join(claudeDir, 'usage-windows.json');
}

function readConfig(claudeDir) {
  try {
    return JSON.parse(fs.readFileSync(configPath(claudeDir), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(claudeDir, config) {
  fs.writeFileSync(configPath(claudeDir), `${JSON.stringify(config, null, 2)}\n`);
}

function resolveNextReset(args, now) {
  const config = readConfig(args.claudeDir);
  if (args.nextReset) {
    const nextReset = parseDate(args.nextReset, '--next-reset');
    if (!args.noSaveReset) {
      writeConfig(args.claudeDir, {
        ...config,
        nextReset: nextReset.toISOString(),
        timezone: args.timezone,
        updatedAt: new Date().toISOString(),
      });
    }
    return { nextReset, source: '--next-reset' };
  }

  if (args.resetDay || args.resetTime) {
    if (!args.resetDay || !args.resetTime) {
      throw new Error('--reset-day and --reset-time must be used together');
    }
    return {
      nextReset: resolveByDayTime(args.resetDay, args.resetTime, args.timezone, now),
      source: '--reset-day/--reset-time',
    };
  }

  if (config.nextReset) {
    return { nextReset: rollForwardReset(parseDate(config.nextReset, 'saved nextReset'), now), source: configPath(args.claudeDir) };
  }

  return { nextReset: null, source: null };
}

function rollForwardReset(reset, now) {
  let resetMs = reset.getTime();
  while (resetMs <= now.getTime()) resetMs += WEEK_MS;
  return new Date(resetMs);
}

function resolveByDayTime(dayValue, timeValue, timezone, now) {
  const targetDay = parseWeekday(dayValue);
  const time = parseTime(timeValue);
  const localNow = zonedParts(now, timezone);
  const daysAhead = (targetDay - localNow.weekday + 7) % 7;
  let candidate = zonedTimeToUtcMs(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day + daysAhead,
      hour: time.hour,
      minute: time.minute,
      second: 0,
    },
    timezone,
  );

  if (candidate <= now.getTime()) candidate += WEEK_MS;
  return new Date(candidate);
}

function parseWeekday(value) {
  const normalized = value.toLowerCase();
  if (!(normalized in WEEKDAYS)) {
    throw new Error('--reset-day must be a weekday like Thu or Thursday');
  }
  return WEEKDAYS[normalized];
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('--reset-time must be HH:MM, for example 00:59');
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour > 23 || minute > 59) throw new Error('--reset-time must be a valid 24-hour time');
  return { hour, minute };
}

function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    weekday: WEEKDAYS[parts.weekday.toLowerCase()],
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10),
    second: Number.parseInt(parts.second, 10),
  };
}

function zonedTimeToUtcMs(parts, timezone) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  const offset = timezoneOffsetMs(new Date(utcGuess), timezone);
  return utcGuess - offset;
}

function timezoneOffsetMs(date, timezone) {
  const parts = zonedParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function collectJsonlFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  }

  return files;
}

function readUsageRows(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  const rows = [];

  for (const file of collectJsonlFiles(projectsDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const row = parseUsageLine(line);
      if (row) rows.push(row);
    }
  }

  return rows;
}

function readStatsCache(claudeDir) {
  const file = path.join(claudeDir, 'stats-cache.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { lastComputedDate: null, tokensByDate: {}, activityByDate: {} };
  }

  const tokensByDate = {};
  for (const day of data.dailyModelTokens || []) {
    tokensByDate[day.date] = day.tokensByModel || {};
  }

  const activityByDate = {};
  for (const day of data.dailyActivity || []) {
    activityByDate[day.date] = day;
  }

  return {
    lastComputedDate: data.lastComputedDate || null,
    tokensByDate,
    activityByDate,
  };
}

function parseUsageLine(line) {
  if (!line.trim()) return null;

  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const usage = entry.message && entry.message.usage;
  if (entry.type !== 'assistant' || !usage || !entry.timestamp) return null;

  const timestampMs = Date.parse(entry.timestamp);
  if (!Number.isFinite(timestampMs)) return null;

  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;

  return {
    timestamp: entry.timestamp,
    timestampMs,
    date: entry.timestamp.slice(0, 10),
    model: entry.message.model || entry.model || '<unknown>',
    sessionId: entry.sessionId || entry.session_id || '',
    cwd: entry.cwd || '',
    input,
    output,
    cacheRead,
    cacheCreate,
    statsTokens: input + output,
    allTokens: input + output + cacheRead + cacheCreate,
  };
}

function createEmptyBucket(startMs, endMs, timezone) {
  return {
    startMs,
    endMs,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    startLocal: formatDateTime(startMs, timezone),
    endLocal: formatDateTime(endMs, timezone),
    rows: 0,
    sessions: new Set(),
    statsTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    allTokens: 0,
    byModel: {},
  };
}

function addRow(bucket, row) {
  bucket.rows += 1;
  if (row.sessionId) bucket.sessions.add(row.sessionId);
  bucket.statsTokens += row.statsTokens;
  bucket.inputTokens += row.input;
  bucket.outputTokens += row.output;
  bucket.cacheReadTokens += row.cacheRead;
  bucket.cacheCreateTokens += row.cacheCreate;
  bucket.allTokens += row.allTokens;

  if (!bucket.byModel[row.model]) {
    bucket.byModel[row.model] = { rows: 0, statsTokens: 0, inputTokens: 0, outputTokens: 0 };
  }
  const model = bucket.byModel[row.model];
  model.rows += 1;
  model.statsTokens += row.statsTokens;
  model.inputTokens += row.input;
  model.outputTokens += row.output;
}

function calculateResetWindows(rows, nextReset, now, count, timezone) {
  const anchorMs = nextReset.getTime();
  const currentIndex = Math.floor((now.getTime() - anchorMs) / WEEK_MS);
  const firstIndex = currentIndex - count + 1;
  return buildResetWindowBuckets(rows, anchorMs, firstIndex, currentIndex, now, timezone);
}

function calculateAllWindows(rows, nextReset, now, timezone) {
  const anchorMs = nextReset.getTime();
  const currentIndex = Math.floor((now.getTime() - anchorMs) / WEEK_MS);
  let firstIndex = currentIndex;

  for (const row of rows) {
    const index = Math.floor((row.timestampMs - anchorMs) / WEEK_MS);
    if (index < firstIndex) firstIndex = index;
  }

  return buildResetWindowBuckets(rows, anchorMs, firstIndex, currentIndex, now, timezone);
}

function buildResetWindowBuckets(rows, anchorMs, firstIndex, lastIndex, now, timezone) {
  const buckets = new Map();

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const startMs = anchorMs + index * WEEK_MS;
    buckets.set(index, createEmptyBucket(startMs, startMs + WEEK_MS, timezone));
  }

  for (const row of rows) {
    const index = Math.floor((row.timestampMs - anchorMs) / WEEK_MS);
    const bucket = buckets.get(index);
    if (bucket && row.timestampMs <= now.getTime()) addRow(bucket, row);
  }

  return [...buckets.values()].map((bucket) => finalizeBucket(bucket, now));
}

function finalizeBucket(bucket, now) {
  return {
    ...bucket,
    status: bucket.endMs <= now.getTime() ? 'complete' : 'current',
    sessions: bucket.sessions.size + (bucket.cachedSessionCount || 0),
  };
}

function calculateStatsWindows(rows, now, timezone, statsCache) {
  const todayUtc = now.toISOString().slice(0, 10);
  const windows = [];

  for (const days of [7, 30]) {
    const start = shiftUtcDate(todayUtc, -(days - 1));
    const bucket = createEmptyBucket(Date.parse(`${start}T00:00:00Z`), Date.parse(`${todayUtc}T23:59:59.999Z`), timezone);
    addCachedDays(bucket, statsCache, start, todayUtc);
    addRawDaysAfterCache(bucket, rows, statsCache.lastComputedDate, start, todayUtc, now);
    windows.push({
      name: `Last ${days} days`,
      days,
      startDate: start,
      endDate: todayUtc,
      source: 'stats-cache completed days + raw uncached days',
      inputOutputComplete: false,
      cacheFieldsComplete: false,
      ...finalizeBucket(bucket, now),
    });
  }

  return windows;
}

function addCachedDays(bucket, statsCache, start, end) {
  for (const [date, tokensByModel] of Object.entries(statsCache.tokensByDate)) {
    if (date < start || date > end) continue;
    for (const [model, tokens] of Object.entries(tokensByModel)) {
      addCachedModelTokens(bucket, model, tokens);
    }
    const activity = statsCache.activityByDate[date];
    if (activity) {
      bucket.rows += activity.messageCount || 0;
      bucket.cachedSessionCount = (bucket.cachedSessionCount || 0) + (activity.sessionCount || 0);
    }
  }
}

function addCachedModelTokens(bucket, model, tokens) {
  bucket.statsTokens += tokens;
  if (!bucket.byModel[model]) {
    bucket.byModel[model] = { rows: 0, statsTokens: 0, inputTokens: 0, outputTokens: 0 };
  }
  bucket.byModel[model].statsTokens += tokens;
}

function addRawDaysAfterCache(bucket, rows, lastComputedDate, start, end, now) {
  for (const row of rows) {
    if (row.date < start || row.date > end || row.timestampMs > now.getTime()) continue;
    if (lastComputedDate && row.date <= lastComputedDate) continue;
    addRow(bucket, row);
  }
}

function shiftUtcDate(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDateTime(ms, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function formatNumber(value, compact) {
  if (compact) return formatCompactNumber(value);
  return value.toLocaleString('en-US');
}

function formatCompactNumber(value) {
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled >= 100 ? Math.round(scaled) : stripTrailingZero(scaled.toFixed(1))}m`;
  }
  if (value >= 1_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : stripTrailingZero(scaled.toFixed(1))}k`;
  }
  return value.toLocaleString('en-US');
}

function stripTrailingZero(value) {
  return value.replace(/\.0$/, '');
}

function printText(result) {
  const compact = result.compact;
  console.log(`Claude dir: ${result.claudeDir}`);
  console.log(`Rows loaded: ${formatNumber(result.rowsLoaded, compact)}`);
  console.log(`Metric: input_tokens + output_tokens (Claude Stats-style)`);
  if (result.nextReset) {
    console.log(`Next reset: ${result.nextResetLocal} (${result.nextResetSource})`);
  }

  if (result.resetWindows.length > 0) {
    console.log('\nReset windows');
    for (const window of result.resetWindows) printWindow(window, result.byModel, compact);
  }

  if (result.statsWindows.length > 0) {
    console.log('\nStats windows');
    for (const window of result.statsWindows) printWindow(window, result.byModel, compact);
  }
}

function printWindow(window, byModel, compact) {
  const label = window.name || `${window.startLocal} -> ${window.endLocal}`;
  console.log(`\n${label} [${window.status}]`);
  if (window.source) console.log(`  source: ${window.source}`);
  console.log(`  tokens: ${formatNumber(window.statsTokens, compact)}`);
  if (window.inputOutputComplete === false) {
    console.log(`  input/output: partial only for uncached raw days`);
  } else {
    console.log(`  input: ${formatNumber(window.inputTokens, compact)}  output: ${formatNumber(window.outputTokens, compact)}`);
  }
  console.log(`  rows: ${formatNumber(window.rows, compact)}  sessions: ${formatNumber(window.sessions, compact)}`);
  if (window.cacheFieldsComplete === false) {
    console.log(`  cache read/create: partial only for uncached raw days`);
  } else {
    console.log(`  cache read/create: ${formatNumber(window.cacheReadTokens, compact)} / ${formatNumber(window.cacheCreateTokens, compact)}`);
  }

  if (byModel) {
    const models = Object.entries(window.byModel).sort((a, b) => b[1].statsTokens - a[1].statsTokens);
    for (const [model, usage] of models) {
      console.log(`  ${model}: ${formatNumber(usage.statsTokens, compact)}`);
    }
  }
}

function usage() {
  return `Usage:
  npx claude-usage-meter --next-reset 2026-07-09T00:59:00+02:00
  npx claude-usage-meter
  npx claude-usage-meter --reset-day Thu --reset-time 00:59 --timezone Europe/Bratislava
  npx claude-usage-meter --next-reset 2026-07-09T00:59:00+02:00 --stats-windows

Options:
  --claude-dir <path>   Claude config dir. Default: ~/.claude
  --next-reset <date>   Seed next weekly reset timestamp. Prefer ISO with offset.
  --no-save-reset       Do not save --next-reset to usage-windows.json
  --reset-day <day>     Compute reset from weekday, e.g. Thu
  --reset-time <HH:MM>  Compute reset from 24-hour local time, e.g. 00:59
  --by-model            Print token split by model
  --compact             Print numbers in compact form (19m, 120k)
  --now <date>          Override current time for repeatable checks.
  --all                 List all weekly windows with usage data (and empty windows in between)
  --windows <n>         Reset windows to print. Default: 1
  --timezone <tz>       Display timezone. Default: local timezone
  --stats-windows       Also print official Stats-style Last 7/30 day windows
  --json                Print JSON
  --help                Show help
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const now = parseDate(args.now, '--now');
  const rows = readUsageRows(args.claudeDir);
  const statsCache = readStatsCache(args.claudeDir);
  const reset = resolveNextReset(args, now);
  const resetWindows = reset.nextReset
    ? args.all
      ? calculateAllWindows(rows, reset.nextReset, now, args.timezone)
      : calculateResetWindows(rows, reset.nextReset, now, args.windows, args.timezone)
    : [];
  const statsWindows = args.statsWindows ? calculateStatsWindows(rows, now, args.timezone, statsCache) : [];

  if (!reset.nextReset && !args.statsWindows) {
    throw new Error('Provide --next-reset, saved config, --reset-day/--reset-time, --all, and/or --stats-windows');
  }

  const result = {
    claudeDir: args.claudeDir,
    now: now.toISOString(),
    nextReset: reset.nextReset ? reset.nextReset.toISOString() : null,
    nextResetLocal: reset.nextReset ? formatDateTime(reset.nextReset.getTime(), args.timezone) : null,
    nextResetSource: reset.source,
    byModel: args.byModel,
    compact: args.compact,
    rowsLoaded: rows.length,
    resetWindows,
    statsWindows,
  };

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
