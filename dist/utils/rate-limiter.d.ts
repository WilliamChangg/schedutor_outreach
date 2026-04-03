/**
 * Simple rate limiter for API calls and scraping
 */
export declare class RateLimiter {
    private readonly minDelayMs;
    private readonly maxCallsPerMinute;
    private lastCallTime;
    private callCount;
    private windowStart;
    constructor(minDelayMs?: number, maxCallsPerMinute?: number);
    waitForSlot(): Promise<void>;
    private sleep;
}
export declare const googleMapsRateLimiter: RateLimiter;
export declare const scrapingRateLimiter: RateLimiter;
export declare const smtpRateLimiter: RateLimiter;
