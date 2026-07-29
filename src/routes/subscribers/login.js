import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Logs a subscriber in with phone + password. Subscribers don't have a
// username (only models do), so phone is the only identifier here.
export async function handleSubscriberLogin(request, env) {
  const body = await request.json();
  const { phone, password } = body;

  if (!phone || !password) {
    return badRequest("phone and password are required");
  }

  const subscriber = await env.DB.prepare(
    "SELECT id, phone, password_hash FROM subscribers WHERE phone = ?"
  )
    .bind(phone)
    .first();

  if (!subscriber) {
    return badRequest("no account found with that phone number");
  }

  const password_hash = await hashPassword(password);
  if (password_hash !== subscriber.password_hash) {
    return badRequest("incorrect password");
  }

  const token = generateId();
  await env.SESSIONS.put(
    `subscriber_session:${token}`,
    JSON.stringify({ subscriber_id: subscriber.id }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return jsonResponse({ token, id: subscriber.id, phone: subscriber.phone });
}

// Looks up a subscriber session token in KV. Returns null if missing,
// expired, or invalid — callers should treat that as "not logged in"
// rather than erroring, since Follow/Like/viewing a landing page should
// still work for logged-out visitors where sensible.
export async function getSubscriberIdFromSession(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const raw = await env.SESSIONS.get(`subscriber_session:${token}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw).subscriber_id;
  } catch {
    return null;
  }
}
