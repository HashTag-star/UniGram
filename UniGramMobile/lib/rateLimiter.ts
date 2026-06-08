/**
 * Simple token-bucket rate limiter for client-side request throttling.
 * Configure a global capacity and refill rate to avoid bursting the backend.
 */
export class RateLimiter {
  private capacity: number;
  private tokens: number;
  private refillIntervalMs: number;
  private refillAmount: number;
  private lastRefill: number;

  constructor(capacity = 10, refillAmount = 1, refillIntervalMs = 1000) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillIntervalMs = refillIntervalMs;
    this.refillAmount = refillAmount;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < this.refillIntervalMs) return;
    const steps = Math.floor(elapsed / this.refillIntervalMs);
    this.tokens = Math.min(this.capacity, this.tokens + steps * this.refillAmount);
    this.lastRefill = now;
  }

  /**
   * Acquire a token. Resolves immediately if available, otherwise waits
   * until a token is refilled (with a simple polling backoff).
   */
  async acquire(timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (true) {
      this.refill();
      if (this.tokens > 0) {
        this.tokens -= 1;
        return true;
      }
      if (Date.now() - start > timeoutMs) return false;
      // Wait a short while before retrying
      await new Promise(r => setTimeout(r, Math.min(200, this.refillIntervalMs)));
    }
  }

  /** Return tokens back to the bucket (for optimistic reservations). */
  release(n = 1) {
    this.tokens = Math.min(this.capacity, this.tokens + n);
  }
}

// Export a sensible default global limiter
export const GlobalRateLimiter = new RateLimiter(12, 1, 1000);
