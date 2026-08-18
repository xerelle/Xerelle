import { generateId } from "./http.js";

// Simple D1-based rate limiter, since Cloudflare's native Rate Limiting
// API needs a newer Wrangler version than this project currently runs.
// Checks how many attempts a given IP has made for a given action
// within the last `windowSeconds`, and blocks if over `limit`.
//
// Self-cleaning: deletes old rows for this action+IP outside the window
// on every call, so the table never grows unbounded from one repeat
// offender — a natural side effect of checking, not a separate cleanup
// job that needs to be scheduled.
export async function checkRateLimit(env, action, ipAddress, limit, windowSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - windowSeconds;

  await env.DB.prepare(
    "DELETE FROM rate_limit_attempts WHERE action = ? AND ip_address = ? AND created_at < ?"
  )
    .bind(action, ipAddress, windowStart)
    .run();

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM rate_limit_attempts WHERE action = ? AND ip_address = ?"
  )
    .bind(action, ipAddress)
    .first();

  if (countRow.count >= limit) {
    return false; // rate limited
  }

  await env.DB.prepare(
    "INSERT INTO rate_limit_attempts (id, action, ip_address) VALUES (?, ?, ?)"
  )
    .bind(generateId(), action, ipAddress)
    .run();

  return true; // allowed
}
