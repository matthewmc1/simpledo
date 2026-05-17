import type { Context, MiddlewareHandler } from "hono";
import { HTTPError, type Env } from "./session";

interface Bucket {
  /** Number of hits in the current window. */
  count: number;
  /** Window expiry timestamp in ms since epoch. */
  resetAt: number;
}

interface Options {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max hits per key per window. */
  max: number;
  /** Optional human-facing label used in 429 messages. */
  label?: string;
}

/** Returns a Hono middleware that buckets requests by the remote IP and
 *  rejects with `HTTP 429` once the per-window cap is hit. In-memory only —
 *  fine for single-process / single-node deployments, which is what we are. */
export function createRateLimiter(opts: Options): MiddlewareHandler<Env> {
  const buckets = new Map<string, Bucket>();

  // Periodically prune expired buckets so we don't grow the Map forever.
  // Tied to the window so we never have more than one expired entry per IP.
  const PRUNE_EVERY = Math.max(opts.windowMs, 60_000);
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, PRUNE_EVERY).unref?.();

  return async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retrySecs = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retrySecs));
      throw new HTTPError(
        429,
        `${opts.label ?? "Endpoint"} rate limit exceeded — retry in ${retrySecs}s.`,
      );
    }
    await next();
  };
}

/** Best-effort client identifier. Prefers `X-Forwarded-For` when running
 *  behind a proxy; falls back to the connection remote address. */
function clientKey(c: Context<Env>): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const real = c.req.header("x-real-ip");
  if (real) return real;
  // `hono/node` exposes the raw IncomingMessage on c.env.incoming when
  // available, but the typed API doesn't promise it. Fall through to a
  // shared bucket — better than no limit at all on local dev.
  return "local";
}
