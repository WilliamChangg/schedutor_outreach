/**
 * Centralized sending configuration.
 * Controls daily limits, random delays, sending windows, and warmup.
 */

export interface SendingConfig {
  /** Maximum emails per day (starting point) */
  dailyLimit: number;

  /** Minimum delay between consecutive sends (ms) */
  minDelayMs: number;

  /** Maximum delay between consecutive sends (ms) */
  maxDelayMs: number;

  /** Start of daily sending window (hour, 0-23) */
  sendingWindowStartHour: number;

  /** End of daily sending window (hour, 0-23) */
  sendingWindowEndHour: number;

  /** IANA timezone for the sending window */
  timezone: string;

  /** Optional warmup schedule to gradually increase volume */
  warmup: WarmupConfig | null;
}

export interface WarmupConfig {
  /** ISO date string for day 1 of warmup (e.g. "2025-01-15") */
  startDate: string;

  /** Each entry maps a day number to its daily limit.
   *  Days not listed inherit the previous entry's limit.
   *  After the final entry, `dailyLimit` from the base config is used. */
  schedule: { day: number; limit: number }[];
}

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_WARMUP_SCHEDULE: WarmupConfig['schedule'] = [
  { day: 1, limit: 25 },
  { day: 4, limit: 50 },
  { day: 8, limit: 75 },
  { day: 15, limit: 90 },
  { day: 22, limit: 100 },
  { day: 29, limit: 100 },
];

let config: SendingConfig = {
  dailyLimit: parseInt(process.env.DAILY_SEND_LIMIT || '15', 10),
  minDelayMs: parseInt(process.env.MIN_SEND_DELAY_MS || '45000', 10),   // 45 s
  maxDelayMs: parseInt(process.env.MAX_SEND_DELAY_MS || '240000', 10),  // 4 min
  sendingWindowStartHour: parseInt(process.env.SENDING_WINDOW_START || '8', 10),
  sendingWindowEndHour: parseInt(process.env.SENDING_WINDOW_END || '18', 10),
  timezone: process.env.SENDING_TIMEZONE || 'America/New_York',
  warmup: process.env.WARMUP_START_DATE
    ? { startDate: process.env.WARMUP_START_DATE, schedule: DEFAULT_WARMUP_SCHEDULE }
    : null,
};

// ── Accessors ───────────────────────────────────────────────────────────────

export function getSendingConfig(): Readonly<SendingConfig> {
  return config;
}

export function updateSendingConfig(patch: Partial<SendingConfig>): Readonly<SendingConfig> {
  config = { ...config, ...patch };
  return config;
}

// ── Daily limit (warmup-aware) ──────────────────────────────────────────────

export function getEffectiveDailyLimit(): number {
  if (!config.warmup) return config.dailyLimit;

  const start = new Date(config.warmup.startDate + 'T00:00:00');
  const now = new Date();
  const dayNumber = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;

  if (dayNumber < 1) return 0; // warmup hasn't begun

  const schedule = [...config.warmup.schedule].sort((a, b) => a.day - b.day);
  const last = schedule[schedule.length - 1];

  // Past the warmup? Use base dailyLimit.
  if (last && dayNumber > last.day) return config.dailyLimit;

  // Walk schedule to find the applicable limit.
  let limit = schedule[0]?.limit ?? config.dailyLimit;
  for (const entry of schedule) {
    if (dayNumber >= entry.day) {
      limit = entry.limit;
    } else {
      break;
    }
  }

  return limit;
}

// ── Random delay ────────────────────────────────────────────────────────────

/**
 * Returns a random delay (ms) biased toward the centre of the
 * [minDelayMs, maxDelayMs] range so timing looks more natural.
 */
export function getRandomDelay(): number {
  const { minDelayMs, maxDelayMs } = config;
  // Average two uniform samples → triangular-ish distribution
  const t = (Math.random() + Math.random()) / 2;
  return Math.floor(minDelayMs + t * (maxDelayMs - minDelayMs));
}

// ── Sending window ──────────────────────────────────────────────────────────

/**
 * True when the current wall-clock time (in the configured timezone)
 * falls inside the sending window.
 */
export function isWithinSendingWindow(): boolean {
  const hour = getCurrentHourInTimezone(config.timezone);
  return hour >= config.sendingWindowStartHour && hour < config.sendingWindowEndHour;
}

function getCurrentHourInTimezone(tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }).format(new Date()),
    10,
  );
}