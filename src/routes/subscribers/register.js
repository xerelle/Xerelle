import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

export async function handleSubscriberRegister(request, env) {
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

  return jsonResponse({ id, username });
}
