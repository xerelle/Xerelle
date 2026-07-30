import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Logs a subscriber in with EITHER her username OR her phone number,
// plus her password. Same pattern as model login.
export async function handleSubscriberLogin(request, env) {
  const body = await request.json();
  const { identifier, password } = body;

  if (!identifier || !password) {
    return badRequest("username/phone and password are required");
  }

  const subscriber = await env.DB.prepare(
    "SELECT id, username, display_name, phone, avatar_url, password_hash FROM subscribers WHERE username = ? OR phone = ?"
  )
    .bind(identifier, identifier)
    .first();

  if (!subscriber) {
    return badRequest("no account found with that username or phone number");
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

  return jsonResponse({
    token,
    id: subscriber.id,
    username: subscriber.username,
    display_name: subscriber.display_name,
    phone: subscriber.phone,
    avatar_url: subscriber.avatar_url,
  });
}

// Looks up a subscriber session token in KV. Returns null if missing,
// expired, or invalid.
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
