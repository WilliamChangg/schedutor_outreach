"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.smtpRateLimiter = exports.scrapingRateLimiter = exports.googleMapsRateLimiter = exports.RateLimiter = void 0;
/**
 * Simple rate limiter for API calls and scraping
 */
var RateLimiter = /** @class */ (function () {
    function RateLimiter(minDelayMs, maxCallsPerMinute) {
        if (minDelayMs === void 0) { minDelayMs = 1000; }
        if (maxCallsPerMinute === void 0) { maxCallsPerMinute = 30; }
        this.minDelayMs = minDelayMs;
        this.maxCallsPerMinute = maxCallsPerMinute;
        this.lastCallTime = 0;
        this.callCount = 0;
        this.windowStart = Date.now();
    }
    RateLimiter.prototype.waitForSlot = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, waitTime, timeSinceLastCall;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        // Reset window if a minute has passed
                        if (now - this.windowStart >= 60000) {
                            this.callCount = 0;
                            this.windowStart = now;
                        }
                        if (!(this.callCount >= this.maxCallsPerMinute)) return [3 /*break*/, 2];
                        waitTime = 60000 - (now - this.windowStart);
                        if (!(waitTime > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.sleep(waitTime)];
                    case 1:
                        _a.sent();
                        this.callCount = 0;
                        this.windowStart = Date.now();
                        _a.label = 2;
                    case 2:
                        timeSinceLastCall = now - this.lastCallTime;
                        if (!(timeSinceLastCall < this.minDelayMs)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.sleep(this.minDelayMs - timeSinceLastCall)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        this.lastCallTime = Date.now();
                        this.callCount++;
                        return [2 /*return*/];
                }
            });
        });
    };
    RateLimiter.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    return RateLimiter;
}());
exports.RateLimiter = RateLimiter;
// Pre-configured rate limiters
exports.googleMapsRateLimiter = new RateLimiter(200, 50); // 200ms between calls, max 50/min
exports.scrapingRateLimiter = new RateLimiter(2000, 20); // 2s between calls, max 20/min
exports.smtpRateLimiter = new RateLimiter(1000, 10); // 1s between checks, max 10/min
