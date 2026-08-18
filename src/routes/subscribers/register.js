import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches login.js exactly

export async function handleSubscriberRegister(request, env) {
  // Rate limited by IP, same as model registration — shares the same
  // REGISTER_LIMITER since it's the same kind of risk.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await env.REGISTER_LIMITER.limit({ key: ip });
  if (!success) {
    return jsonResponse(
      { error: "rate_limited", message: "Too many attempts. Please wait a minute and try again." },
      429
    );
  }

  const body = await request.json();
  const { username, display_name, phone, email, password } = body;

  if (!username || !display_name || !phone || !password) {
    return badRequest("username, display_name, phone, and password are required");
  }

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return badRequest(
      "username must be 3-30 characters, lowercase letters/numbers/dots/dashes/underscores only"
    );
  }

  const existingUsername = await env.DB.prepare("SELECT id FROM subscribers WHERE username = ?")
    .bind(username)
    .first();
  if (existingUsername) {
    return badRequest("that username is already taken");
  }

  const existingPhone = await env.DB.prepare("SELECT id FROM subscribers WHERE phone = ?")
    .bind(phone)
    .first();
  if (existingPhone) {
    return badRequest("an account with that phone number already exists");
  }

  const id = generateId();
  const password_hash = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO subscribers (id, username, display_name, phone, email, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, username, display_name, phone, email ?? null, password_hash)
    .run();

  // Create a real session immediately, matching login.js exactly — so
  // she's already logged in right after registering.
  const token = generateId();
  await env.SESSIONS.put(
    `subscriber_session:${token}`,
    JSON.stringify({ subscriber_id: id }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return jsonResponse({
    token,
    id,
    username,
    display_name,
    phone,
  });
}
