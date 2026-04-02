/**
 * Simple rate limiter for API calls and scraping
 */
export class RateLimiter {
  private lastCallTime = 0;
  private callCount = 0;
  private windowStart = Date.now();

  constructor(
    private readonly minDelayMs: number = 1000,
    private readonly maxCallsPerMinute: number = 30
  ) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Reset window if a minute has passed
    if (now - this.windowStart >= 60000) {
      this.callCount = 0;
      this.windowStart = now;
    }

    // Check if we've hit the per-minute limit
    if (this.callCount >= this.maxCallsPerMinute) {
      const waitTime = 60000 - (now - this.windowStart);
      if (waitTime > 0) {
        await this.sleep(waitTime);
        this.callCount = 0;
        this.windowStart = Date.now();
      }
    }

    // Enforce minimum delay between calls
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelayMs) {
      await this.sleep(this.minDelayMs - timeSinceLastCall);
    }

    this.lastCallTime = Date.now();
    this.callCount++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Pre-configured rate limiters
export const googleMapsRateLimiter = new RateLimiter(200, 50); // 200ms between calls, max 50/min
export const scrapingRateLimiter = new RateLimiter(2000, 20); // 2s between calls, max 20/min
export const smtpRateLimiter = new RateLimiter(1000, 10); // 1s between checks, max 10/min
