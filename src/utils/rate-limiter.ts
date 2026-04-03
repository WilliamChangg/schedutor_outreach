/**
 * Simple rate limiter for API calls and scraping
 */
export class RateLimiter {
  private lastCallTime = 0;
  private callCount = 0;
  private windowStart = Date.now();
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly minDelayMs: number = 1000,
    private readonly maxCallsPerMinute: number = 30,
    private readonly maxConcurrent: number = 1
  ) {}

  async waitForSlot(): Promise<void> {
    // Wait for concurrent slot
    if (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.activeRequests++;

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

  releaseSlot(): void {
    this.activeRequests--;
    const next = this.queue.shift();
    if (next) next();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Parallel batch processor with rate limiting
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, result: R) => void;
    onError?: (error: Error, item: T, index: number) => void;
    retries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<Array<{ success: boolean; result?: R; error?: Error; item: T }>> {
  const {
    concurrency = 5,
    onProgress,
    onError,
    retries = 2,
    retryDelayMs = 1000
  } = options;

  const results: Array<{ success: boolean; result?: R; error?: Error; item: T }> = [];
  let completed = 0;
  let activeCount = 0;
  let index = 0;
  const total = items.length;

  return new Promise((resolve) => {
    const processNext = async () => {
      if (index >= items.length) {
        if (activeCount === 0) {
          resolve(results);
        }
        return;
      }

      const currentIndex = index++;
      const item = items[currentIndex];
      activeCount++;

      let lastError: Error | undefined;
      let result: R | undefined;
      let success = false;

      // Retry loop
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          result = await processor(item, currentIndex);
          success = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < retries) {
            // Exponential backoff
            await new Promise(res => setTimeout(res, retryDelayMs * Math.pow(2, attempt)));
          }
        }
      }

      if (success) {
        results[currentIndex] = { success: true, result, item };
      } else {
        results[currentIndex] = { success: false, error: lastError, item };
        if (onError && lastError) {
          onError(lastError, item, currentIndex);
        }
      }

      completed++;
      if (onProgress && result) {
        onProgress(completed, total, result);
      }

      activeCount--;
      processNext();
    };

    // Start initial batch
    const initialBatch = Math.min(concurrency, items.length);
    for (let i = 0; i < initialBatch; i++) {
      processNext();
    }

    // Handle empty input
    if (items.length === 0) {
      resolve(results);
    }
  });
}

// Pre-configured rate limiters
export const googleMapsRateLimiter = new RateLimiter(200, 50, 3); // 200ms between calls, max 50/min, 3 concurrent
export const scrapingRateLimiter = new RateLimiter(1000, 30, 5); // 1s between calls, max 30/min, 5 concurrent
export const smtpRateLimiter = new RateLimiter(1000, 10, 1); // 1s between checks, max 10/min, 1 concurrent
