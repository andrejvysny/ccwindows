# claude-usage-meter

Calculate Claude Code token usage by weekly reset windows.

The displayed Claude Stats token metric is:

```text
input_tokens + output_tokens
```

Cache fields are reported separately and are not included in the main total.

Models are added using their own reported token counts. There is no Opus/Sonnet
weighting in the displayed Stats total.

## Usage

After publishing:

```sh
npx claude-usage-meter --next-reset 2026-07-09T00:59:00+02:00
```

That seeds `~/.claude/usage-windows.json`. Future runs can omit reset flags:

```sh
npx claude-usage-meter
```

Or calculate the reset from separate weekday/time flags:

```sh
npx claude-usage-meter \
  --reset-day Thu \
  --reset-time 00:59 \
  --timezone Europe/Bratislava
```

With validation windows matching Claude Stats:

```sh
npx claude-usage-meter \
  --next-reset 2026-07-09T00:59:00+02:00 \
  --stats-windows
```

Split text output by model:

```sh
npx claude-usage-meter --by-model
```

Before publishing, from this checkout:

```sh
npx /Users/andrejvysny/ccwindows
```

JSON output:

```sh
npx claude-usage-meter \
  --next-reset 2026-07-09T00:59:00+02:00 \
  --stats-windows \
  --json
```

## Options

- `--claude-dir <path>`: Claude config directory. Default: `~/.claude`
- `--next-reset <date>`: next weekly reset timestamp. Prefer ISO with offset.
- `--no-save-reset`: do not save `--next-reset`
- `--reset-day <day>`: compute reset from weekday, e.g. `Thu`
- `--reset-time <HH:MM>`: compute reset from 24-hour local time, e.g. `00:59`
- `--by-model`: print per-model token totals in text output
- `--now <date>`: override current time for repeatable checks.
- `--windows <n>`: number of reset windows to print. Default: `8`
- `--timezone <tz>`: display timezone. Default: local timezone
- `--stats-windows`: print Last 7 days and Last 30 days calendar windows
- `--json`: print machine-readable JSON

Precedence: `--next-reset`, then `--reset-day/--reset-time`, then saved config.

## Validation

With `--now 2026-07-03T21:01:00+02:00`, `--stats-windows` reproduces the
Claude Stats screenshots:

- Last 7 days: `19,757,238` -> `19.8m`
- Last 30 days: `123,102,698` -> `123.1m`

## Publish

```sh
npm login
npm publish
```

If your local npm cache has permission problems, fix `~/.npm` ownership or set
`NPM_CONFIG_CACHE` to a writable directory for the publish command.
