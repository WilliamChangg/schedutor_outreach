"use strict";
/**
 * Centralized sending configuration.
 * Controls daily limits, random delays, sending windows, and warmup.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSendingConfig = getSendingConfig;
exports.updateSendingConfig = updateSendingConfig;
exports.getEffectiveDailyLimit = getEffectiveDailyLimit;
exports.getRandomDelay = getRandomDelay;
exports.isWithinSendingWindow = isWithinSendingWindow;
// ── Defaults ────────────────────────────────────────────────────────────────
var DEFAULT_WARMUP_SCHEDULE = [
    { day: 1, limit: 15 },
    { day: 4, limit: 25 },
    { day: 8, limit: 40 },
    { day: 15, limit: 60 },
    { day: 22, limit: 80 },
    { day: 29, limit: 100 },
];
var config = {
    dailyLimit: parseInt(process.env.DAILY_SEND_LIMIT || '15', 10),
    minDelayMs: parseInt(process.env.MIN_SEND_DELAY_MS || '45000', 10), // 45 s
    maxDelayMs: parseInt(process.env.MAX_SEND_DELAY_MS || '240000', 10), // 4 min
    sendingWindowStartHour: parseInt(process.env.SENDING_WINDOW_START || '8', 10),
    sendingWindowEndHour: parseInt(process.env.SENDING_WINDOW_END || '18', 10),
    timezone: process.env.SENDING_TIMEZONE || 'America/New_York',
    warmup: process.env.WARMUP_START_DATE
        ? { startDate: process.env.WARMUP_START_DATE, schedule: DEFAULT_WARMUP_SCHEDULE }
        : null,
};
// ── Accessors ───────────────────────────────────────────────────────────────
function getSendingConfig() {
    return config;
}
function updateSendingConfig(patch) {
    config = __assign(__assign({}, config), patch);
    return config;
}
// ── Daily limit (warmup-aware) ──────────────────────────────────────────────
function getEffectiveDailyLimit() {
    var _a, _b;
    if (!config.warmup)
        return config.dailyLimit;
    var start = new Date(config.warmup.startDate + 'T00:00:00');
    var now = new Date();
    var dayNumber = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
    if (dayNumber < 1)
        return 0; // warmup hasn't begun
    var schedule = __spreadArray([], config.warmup.schedule, true).sort(function (a, b) { return a.day - b.day; });
    var last = schedule[schedule.length - 1];
    // Past the warmup? Use base dailyLimit.
    if (last && dayNumber > last.day)
        return config.dailyLimit;
    // Walk schedule to find the applicable limit.
    var limit = (_b = (_a = schedule[0]) === null || _a === void 0 ? void 0 : _a.limit) !== null && _b !== void 0 ? _b : config.dailyLimit;
    for (var _i = 0, schedule_1 = schedule; _i < schedule_1.length; _i++) {
        var entry = schedule_1[_i];
        if (dayNumber >= entry.day) {
            limit = entry.limit;
        }
        else {
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
function getRandomDelay() {
    var minDelayMs = config.minDelayMs, maxDelayMs = config.maxDelayMs;
    // Average two uniform samples → triangular-ish distribution
    var t = (Math.random() + Math.random()) / 2;
    return Math.floor(minDelayMs + t * (maxDelayMs - minDelayMs));
}
// ── Sending window ──────────────────────────────────────────────────────────
/**
 * True when the current wall-clock time (in the configured timezone)
 * falls inside the sending window.
 */
function isWithinSendingWindow() {
    var hour = getCurrentHourInTimezone(config.timezone);
    return hour >= config.sendingWindowStartHour && hour < config.sendingWindowEndHour;
}
function getCurrentHourInTimezone(tz) {
    return parseInt(new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: tz,
    }).format(new Date()), 10);
}
